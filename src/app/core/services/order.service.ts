import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CheckoutContact, OrderResult } from '../models/order.model';
import { CartLine } from '../models/product.model';
import { AuthService } from './auth.service';
import { SiteSettingsService } from './site-settings.service';

interface CreateOrderPayload {
  items: Array<{ productId: string; quantity: number }>;
  contact: CheckoutContact;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly functions = inject(Functions);
  private readonly auth = inject(AuthService);
  private readonly settings = inject(SiteSettingsService);

  async place(lines: CartLine[], contact: CheckoutContact): Promise<OrderResult> {
    if (!environment.demoMode) {
      const createOrder = httpsCallable<CreateOrderPayload, OrderResult>(
        this.functions,
        'createOrder',
      );

      const response = await createOrder({
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
        contact,
      });

      return response.data;
    }

    const [settings, user] = await Promise.all([
      firstValueFrom(this.settings.settings$),
      firstValueFrom(this.auth.firebaseUser$),
    ]);
    const subtotal = lines.reduce(
      (total, line) => total + line.product.price * line.quantity,
      0,
    );
    const discountRate = user ? settings.memberDiscountPercent / 100 : 0;
    const discount = this.money(subtotal * discountRate);

    return {
      orderId: `DEMO-${Date.now().toString().slice(-8)}`,
      subtotal: this.money(subtotal),
      discount,
      total: this.money(subtotal - discount),
      currency: settings.currency,
    };
  }

  private money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
