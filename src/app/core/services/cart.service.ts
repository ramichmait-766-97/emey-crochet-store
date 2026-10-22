import { Injectable, computed, signal } from '@angular/core';
import { CartLine, Product } from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly storageKey = 'emey-cart-v1';
  private readonly linesState = signal<CartLine[]>(this.load());

  readonly lines = this.linesState.asReadonly();
  readonly count = computed(() =>
    this.linesState().reduce((total, line) => total + line.quantity, 0),
  );
  readonly subtotal = computed(() =>
    this.linesState().reduce(
      (total, line) => total + line.product.price * line.quantity,
      0,
    ),
  );

  add(product: Product, quantity = 1): void {
    if (product.quantity < 1 || quantity < 1) {
      return;
    }

    const lines = [...this.linesState()];
    const index = lines.findIndex((line) => line.product.id === product.id);

    if (index >= 0) {
      lines[index] = {
        ...lines[index],
        product,
        quantity: Math.min(lines[index].quantity + quantity, product.quantity),
      };
    } else {
      lines.push({ product, quantity: Math.min(quantity, product.quantity) });
    }

    this.persist(lines);
  }

  setQuantity(productId: string, quantity: number): void {
    const line = this.linesState().find((item) => item.product.id === productId);
    if (!line) {
      return;
    }

    if (quantity <= 0) {
      this.remove(productId);
      return;
    }

    this.persist(
      this.linesState().map((item) =>
        item.product.id === productId
          ? { ...item, quantity: Math.min(quantity, item.product.quantity) }
          : item,
      ),
    );
  }

  remove(productId: string): void {
    this.persist(this.linesState().filter((line) => line.product.id !== productId));
  }

  clear(): void {
    this.persist([]);
  }

  private persist(lines: CartLine[]): void {
    this.linesState.set(lines);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, JSON.stringify(lines));
    }
  }

  private load(): CartLine[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const parsed = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      localStorage.removeItem(this.storageKey);
      return [];
    }
  }
}
