import { Injectable, inject } from '@angular/core';
import { doc, getDocFromServer } from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';
import { SiteSettingsService } from './site-settings.service';
import { CheckoutContact, OrderRequestEstimate } from '../models/order.model';
import { CartLine, Product } from '../models/product.model';
import { prepareOrderRequest } from '../utils/order-request';

/** Prepares an estimate; sending, payment and stock confirmation happen with the store. */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly db = inject(FirebaseService).firestore;
  private readonly auth = inject(AuthService);
  private readonly settings = inject(SiteSettingsService);
  async prepare(lines: CartLine[], contact: CheckoutContact): Promise<OrderRequestEstimate> {
    if (!lines.length || !contact.fullName.trim() || !contact.phone.trim())
      throw new Error('Please enter your name and phone number.');
    const [site, user, live] = await Promise.all([
      firstValueFrom(this.settings.settings$),
      firstValueFrom(this.auth.firebaseUser$),
      Promise.all(
        lines.map(async (line) => {
          const snapshot = await getDocFromServer(doc(this.db, `products/${line.product.id}`));
          if (!snapshot.exists())
            throw new Error('A piece in your bag is no longer available. Please update your bag.');
          const product = snapshot.data() as Product;
          if (
            !product.active ||
            product.quantity < line.quantity ||
            line.quantity < 1 ||
            !Number.isInteger(line.quantity)
          )
            throw new Error(
              `${line.product.name} has changed availability. Please review your bag.`,
            );
          if (!Number.isFinite(product.price) || product.price < 0)
            throw new Error('A price needs confirmation. Please contact the store.');
          return { ...line, product: { ...product, id: snapshot.id } };
        }),
      ),
    ]);
    return prepareOrderRequest(live, contact, site, !!user);
  }
}
