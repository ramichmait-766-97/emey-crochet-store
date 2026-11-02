import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ProductImagePipe } from '../../shared/pipes/product-image.pipe';
import { ImageKitPipe, ImageKitSrcsetPipe } from '../../shared/pipes/imagekit.pipe';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { CheckoutChallengeComponent } from '../../shared/components/checkout-challenge.component';
import { CheckoutContact } from '../../core/models/order.model';
import { CheckoutSettings, LedgerOrder, OrderQuote } from '../../core/models/commerce.model';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { CommerceService } from '../../core/services/commerce.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { ProfileService } from '../../core/services/profile.service';
import {
  decodeCheckoutResponse,
  decodeOrderResponse,
  decodePendingCheckout,
  decodeQuote,
} from '../../types/commerce.contracts';

interface CheckoutRequest {
  checkoutKey: string;
  cartOwner?: string | null;
  contact: CheckoutContact;
  deliveryId: string;
  paymentId: string;
  lines: { productId: string; variantId: string; quantity: number }[];
  quoteFingerprint?: string;
}
@Component({
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    ProductImagePipe,
    ImageKitPipe,
    ImageKitSrcsetPipe,
    ImageFallbackDirective,
    CheckoutChallengeComponent,
  ],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss', '../commerce.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartComponent {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly settings = inject(SiteSettingsService);
  readonly api = inject(CommerceService);
  private readonly profiles = inject(ProfileService);
  private readonly cdr = inject(ChangeDetectorRef);
  config: CheckoutSettings | null = null;
  configLoading = true;
  filling = false;
  busy = false;
  error = '';
  quote?: OrderQuote;
  result?: LedgerOrder;
  whatsappUrl = '';
  statusUrl = '';
  challenge = '';
  deliveryId = '';
  paymentId = '';
  private quotedFingerprint = '';
  private request?: CheckoutRequest;
  pending = false;
  contact: CheckoutContact = {
    fullName: '',
    email: '',
    phone: '',
    address: '',
    building: '',
    notes: '',
  };
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    this.configLoading = true;
    this.error = '';
    if (!this.api.configured) {
      this.configLoading = false;
      this.cdr.markForCheck();
      return;
    }
    try {
      this.config = await this.api.settings();
      // Session-only recovery preserves one reservation identity after an uncertain network response.
      const saved = sessionStorage.getItem('emey-pending-checkout');
      if (saved) {
        const request = decodePendingCheckout(JSON.parse(saved));
        if (/^[a-f0-9]{64}$/.test(request.checkoutKey)) {
          this.request = request;
          this.contact = request.contact;
          this.deliveryId = request.deliveryId;
          this.paymentId = request.paymentId;
          this.pending = true;
        }
      } else await this.useProfile();
    } catch {
      this.error = 'Unable to load checkout. Check your connection and retry.';
    } finally {
      this.configLoading = false;
      this.cdr.markForCheck();
    }
  }
  async useProfile(): Promise<void> {
    if (this.filling || this.busy || this.pending) return;
    this.filling = true;
    try {
      const user = await firstValueFrom(this.auth.user$);
      if (!user) return;
      const profile = await this.profiles.load(user);
      this.contact = {
        ...this.contact,
        fullName: profile.billing.fullName || profile.displayName,
        email: user.email ?? '',
        phone: profile.phone,
        address: [
          profile.billing.addressLine1,
          profile.billing.city,
          profile.billing.region,
          profile.billing.postalCode,
          profile.billing.country,
        ]
          .filter(Boolean)
          .join(', '),
        building: profile.billing.addressLine2,
      };
    } catch {
      this.error = 'Saved details could not load. You can enter them below.';
    } finally {
      this.filling = false;
      this.cdr.markForCheck();
    }
  }
  private fingerprint(): string {
    return JSON.stringify([
      this.contact,
      this.auth.currentUser()?.uid ?? null,
      this.deliveryId,
      this.paymentId,
      this.cart.lines().map((line) => [line.product.id, line.variantId || '', line.quantity]),
    ]);
  }
  get quoteMatches(): boolean {
    return (
      this.request?.cartOwner === (this.auth.currentUser()?.uid ?? null) &&
      this.quotedFingerprint === this.fingerprint()
    );
  }
  async review(): Promise<void> {
    if (this.busy || this.pending) return;
    this.busy = true;
    this.error = '';
    this.quote = undefined;
    this.challenge = '';
    try {
      if (this.auth.currentUser() === undefined)
        throw new Error('Sign-in is still loading. Please retry.');
      this.request = {
        checkoutKey: this.api.newKey(),
        cartOwner: this.auth.currentUser()?.uid ?? null,
        contact: { ...this.contact },
        deliveryId: this.deliveryId,
        paymentId: this.paymentId,
        lines: this.cart.lines().map((line) => ({
          productId: line.product.id,
          variantId: line.variantId || '',
          quantity: line.quantity,
        })),
      };
      const reviewedFingerprint = this.fingerprint();
      this.quote = await this.api.call('/quote', this.request, decodeQuote);
      this.request.quoteFingerprint = this.quote.quoteFingerprint;
      this.quotedFingerprint = reviewedFingerprint;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to review total.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async reserve(): Promise<void> {
    if (this.busy || !this.request || !this.challenge || (!this.pending && !this.quoteMatches))
      return;
    this.busy = true;
    this.error = '';
    try {
      // If recovery cannot be saved, do not submit an order that this browser cannot safely retry.
      sessionStorage.setItem('emey-pending-checkout', JSON.stringify(this.request));
      this.pending = true;
      const response = await this.api.call(
        '/checkout',
        this.request,
        decodeCheckoutResponse,
        this.challenge,
      );
      this.finish(response.order, response.whatsappUrl || '');
    } catch (error) {
      this.error = `${error instanceof Error ? error.message : 'Connection interrupted.'} Check reservation status before starting another order.`;
    } finally {
      this.challenge = '';
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  async recover(): Promise<void> {
    if (!this.request || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      const bytes = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(this.request.checkoutKey),
      );
      const id = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);
      const response = await this.api.call(
        '/order-status',
        {
          id,
          access: this.request.checkoutKey,
        },
        decodeOrderResponse,
      );
      this.finish(response.order, '');
    } catch (error) {
      this.error = `${error instanceof Error ? error.message : 'Status unavailable.'} You can retry the same reservation with a fresh security check. If checkout details changed, contact the store before clearing recovery.`;
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
  private finish(order: LedgerOrder, whatsappUrl: string): void {
    this.result = order;
    this.whatsappUrl = whatsappUrl;
    this.statusUrl = `${location.origin}/order/${order.id}#access=${this.request!.checkoutKey}`;
    this.pending = false;
    this.quote = undefined;
    sessionStorage.removeItem('emey-pending-checkout');
    // A reservation response/recovery must never clear another account's bag.
    if (
      this.request?.cartOwner !== undefined &&
      this.auth.currentUser() !== undefined &&
      this.request.cartOwner === (this.auth.currentUser()?.uid ?? null) &&
      !['expired', 'cancelled'].includes(order.fulfillmentStatus)
    )
      this.cart.clear();
  }
  resetRecovery = false;
  clearRecovery(): void {
    sessionStorage.removeItem('emey-pending-checkout');
    this.pending = false;
    this.request = undefined;
    this.quote = undefined;
    this.resetRecovery = false;
    this.error =
      'Recovery cleared. Any existing reservation remains valid until confirmed, cancelled or expired.';
  }
}
