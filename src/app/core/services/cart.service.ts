import { Injectable, computed, inject, signal } from '@angular/core';
import { CartLine, Product } from '../models/product.model';
import { ProductService } from './product.service';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly storageKey = 'emey-cart-v2';
  private readonly products = inject(ProductService);
  private readonly linesState = signal<CartLine[]>(this.load());

  constructor() {
    this.products.list().subscribe((catalog) => this.attachImages(catalog));
  }

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
        product: this.withoutImageBytes(product),
        quantity: Math.min(lines[index].quantity + quantity, product.quantity),
      };
    } else {
      lines.push({
        product: this.withoutImageBytes(product),
        quantity: Math.min(quantity, product.quantity),
      });
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

  attachImages(products: Product[]): void {
    const byId = new Map(products.map((product) => [product.id, product]));
    this.linesState.update((lines) =>
      lines.map((line) => {
        const live = byId.get(line.product.id);
        return live ? { ...line, product: this.withoutImageBytes(live) } : line;
      }),
    );
  }

  private persist(lines: CartLine[]): void {
    const slim = lines.map((line) => ({
      ...line,
      product: this.withoutImageBytes(line.product),
    }));
    this.linesState.set(slim);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, JSON.stringify(slim));
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

  private withoutImageBytes(product: Product): Product {
    const { imageData: _imageData, ...rest } = product;
    return { ...rest, imageData: undefined };
  }
}
