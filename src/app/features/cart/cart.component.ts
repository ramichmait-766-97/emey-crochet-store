import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductImagePipe } from '../../shared/pipes/product-image.pipe';
import { firstValueFrom } from 'rxjs';
import { CheckoutContact, OrderResult } from '../../core/models/order.model';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { OrderService } from '../../core/services/order.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';

@Component({
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, FormsModule, ProductImagePipe],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartComponent {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly settings = inject(SiteSettingsService);
  private readonly orders = inject(OrderService);

  contact: CheckoutContact = {
    fullName: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
  };

  busy = false;
  error = '';
  result?: OrderResult;
  whatsappUrl = '#';

  async checkout(): Promise<void> {
    if (this.busy || this.cart.lines().length === 0) {
      return;
    }

    this.busy = true;
    this.error = '';

    try {
      this.result = await this.orders.place(this.cart.lines(), this.contact);
      await this.prepareWhatsappLink(this.result);
      this.cart.clear();
    } catch (error) {
      this.error = this.errorMessage(error);
    } finally {
      this.busy = false;
    }
  }

  private async prepareWhatsappLink(result: OrderResult): Promise<void> {
    const site = await firstValueFrom(this.settings.settings$);
    const whatsapp = site.contacts.find((item) => item.type === 'whatsapp' && item.enabled);

    if (!whatsapp?.url) {
      this.whatsappUrl = '#';
      return;
    }

    const message = encodeURIComponent(
      `Hello ${site.storeName}, I placed order ${result.orderId} for ${result.currency} ${result.total.toFixed(2)}.`,
    );
    const separator = whatsapp.url.includes('?') ? '&' : '?';
    this.whatsappUrl = `${whatsapp.url}${separator}text=${message}`;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'We could not place the order. Please try again.';
  }
}
