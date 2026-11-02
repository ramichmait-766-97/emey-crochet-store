import { Injectable, computed, inject, signal } from '@angular/core';
import { CartLine, Product } from '../models/product.model';
import { ProductService } from './product.service';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly storageKey = 'emey-cart-v2';
  private readonly products = inject(ProductService);
  private readonly linesState = signal<CartLine[]>(this.load());

  constructor() {
    this.products.state$.subscribe((state) => {
      if (!state.loading && !state.error) this.attachImages(state.products);
    });
  }

  readonly lines = this.linesState.asReadonly();
  readonly count = computed(() =>
    this.linesState().reduce((total, line) => total + line.quantity, 0),
  );
  readonly subtotal = computed(() =>
    this.linesState().reduce((total, line) => total + this.unitPrice(line) * line.quantity, 0),
  );

  readonly announcement = signal('');
  private announcementTimer?: ReturnType<typeof setTimeout>;

  available(line: CartLine): number {
    return line.variantId
      ? (line.product.variants?.find((item) => item.id === line.variantId)?.quantity ?? 0)
      : line.product.variants?.length
        ? 0
        : line.product.quantity;
  }
  unitPrice(line: CartLine): number {
    return (
      line.product.variants?.find((item) => item.id === line.variantId)?.price ?? line.product.price
    );
  }
  optionLabel(line: CartLine): string {
    const option = line.product.variants?.find((item) => item.id === line.variantId);
    return option ? `${option.color} / ${option.size}` : 'Selection unavailable';
  }
  add(product: Product, quantity = 1, variantId?: string): void {
    const available = this.available({ product, quantity, variantId });
    if (!product.active || available < 1 || !Number.isInteger(quantity) || quantity < 1) {
      return;
    }

    const lines = [...this.linesState()];
    const index = lines.findIndex(
      (line) => line.product.id === product.id && line.variantId === variantId,
    );

    if (index >= 0) {
      if (lines[index].quantity >= available) {
        this.announcement.set('All available stock of this piece is already in your bag.');
        clearTimeout(this.announcementTimer);
        this.announcementTimer = setTimeout(() => this.announcement.set(''), 4000);
        return;
      }
      lines[index] = {
        ...lines[index],
        product,
        quantity: Math.min(lines[index].quantity + quantity, available),
      };
    } else {
      lines.push({
        product,
        variantId,
        quantity: Math.min(quantity, available),
      });
    }

    this.persist(lines);
    this.announcement.set(
      `${product.name} added to your bag. ${this.count()} ${this.count() === 1 ? 'item' : 'items'} in total.`,
    );
    clearTimeout(this.announcementTimer);
    this.announcementTimer = setTimeout(() => this.announcement.set(''), 4000);
  }

  setQuantity(productId: string, quantity: number, variantId?: string): void {
    if (!Number.isInteger(quantity)) return;
    const line = this.linesState().find(
      (item) => item.product.id === productId && item.variantId === variantId,
    );
    if (!line) {
      return;
    }

    if (quantity <= 0) {
      this.remove(productId, variantId);
      return;
    }

    this.persist(
      this.linesState().map((item) =>
        item.product.id === productId && item.variantId === variantId
          ? { ...item, quantity: Math.min(quantity, this.available(item)) }
          : item,
      ),
    );
  }

  remove(productId: string, variantId?: string): void {
    this.persist(
      this.linesState().filter(
        (line) => line.product.id !== productId || line.variantId !== variantId,
      ),
    );
  }

  clear(): void {
    this.persist([]);
  }

  attachImages(products: Product[]): void {
    const byId = new Map(products.map((product) => [product.id, product]));
    this.linesState.update((lines) =>
      lines.map((line) => {
        const live = byId.get(line.product.id);
        return live
          ? {
              ...line,
              quantity:
                this.available({ ...line, product: live }) > 0
                  ? Math.min(line.quantity, this.available({ ...line, product: live }))
                  : line.quantity,
              product: live,
            }
          : { ...line, product: { ...line.product, active: false, quantity: 0 } };
      }),
    );
  }

  private persist(lines: CartLine[]): void {
    const slim = lines.map((line) => ({
      ...line,
      product: this.withoutImageBytes(line.product),
    }));
    this.linesState.set(lines);

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(slim));
      } catch {
        /* Keep the in-memory bag usable when storage is full or blocked. */
      }
    }
  }

  private load(): CartLine[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const parsed = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]');
      return Array.isArray(parsed)
        ? parsed.filter(
            (line) =>
              line?.product &&
              typeof line.product.id === 'string' &&
              typeof line.product.name === 'string' &&
              Number.isFinite(line.product.price) &&
              Number.isInteger(line.quantity) &&
              line.quantity > 0,
          )
        : [];
    } catch {
      try {
        localStorage.removeItem(this.storageKey);
      } catch {
        /* Storage may be blocked. */
      }
      return [];
    }
  }

  private withoutImageBytes(product: Product): Product {
    const { imageData: _imageData, ...rest } = product;
    return {
      ...rest,
      imageUrl: rest.imageUrl?.startsWith('data:') ? '' : rest.imageUrl,
      imageData: undefined,
    };
  }
}
