import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProductImagePipe } from '../../shared/pipes/product-image.pipe';
import { firstValueFrom } from 'rxjs';
import { CheckoutContact, OrderRequestEstimate } from '../../core/models/order.model';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { OrderService } from '../../core/services/order.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { ProfileService } from '../../core/services/profile.service';

@Component({
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, FormsModule, RouterLink, ProductImagePipe],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartComponent {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly settings = inject(SiteSettingsService);
  private readonly orders = inject(OrderService);
  private readonly profiles = inject(ProfileService);
  private readonly cdr = inject(ChangeDetectorRef);
  filling = false;

  async useProfile(): Promise<void> {
    if (this.filling || this.busy) return;
    this.filling = true;
    this.error = '';
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
          profile.billing.addressLine2,
          profile.billing.city,
          profile.billing.region,
          profile.billing.postalCode,
          profile.billing.country,
        ]
          .filter(Boolean)
          .join(', '),
      };
    } catch {
      this.error = 'Unable to load your saved details. You can enter them below.';
    } finally {
      this.filling = false;
      this.cdr.markForCheck();
    }
  }

  contact: CheckoutContact = {
    fullName: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
  };

  busy = false;
  error = '';
  result?: OrderRequestEstimate;
  whatsappUrl = '#';
  private requestFingerprint = '';
  private fingerprint(): string {
    return JSON.stringify({
      contact: this.contact,
      lines: this.cart.lines().map((l) => [l.product.id, l.quantity, l.product.price]),
    });
  }
  get requestMatches(): boolean {
    return this.requestFingerprint === this.fingerprint();
  }

  async checkout(): Promise<void> {
    if (this.busy || this.cart.lines().length === 0) {
      return;
    }

    this.busy = true;
    this.error = '';

    try {
      this.result = await this.orders.prepare(this.cart.lines(), this.contact);
      this.whatsappUrl = this.result.whatsappUrl ?? '#';
      this.requestFingerprint = this.fingerprint();
    } catch (error) {
      this.error = this.errorMessage(error);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'We could not place the order. Please try again.';
  }
}
