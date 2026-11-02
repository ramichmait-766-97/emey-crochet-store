import {
  DestroyRef,
  Injectable,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { CartLine, Product } from '../models/product.model';
import {
  CartLineItem,
  MAX_CART_LINES,
  MAX_CART_QUANTITY,
  decodeCartItems,
  identifier,
  integer,
  moneyToCents,
  record,
  toProductDocument,
} from '../../types/commerce.contracts';
import { AuthService } from './auth.service';
import { ProductService } from './product.service';

@Injectable({ providedIn: 'root' })
export class CartService {
  #lineItems = signal<CartLineItem[]>([]);
  private readonly auth = inject(AuthService);
  private readonly products = inject(ProductService);
  private readonly catalog = toSignal(
    toObservable(
      computed(() => [...new Set(this.#lineItems().map((item) => item.productId))].sort()),
    ).pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap((ids) =>
        this.products.watchProducts(ids).pipe(
          map((products) => ({ ids, products, loading: false, error: '' })),
          startWith({ ids, products: [] as Product[], loading: true, error: '' }),
          catchError(() =>
            of({
              ids,
              products: [] as Product[],
              loading: false,
              error: 'Bag availability could not load.',
            }),
          ),
        ),
      ),
    ),
  );
  private readonly owner = signal<string | undefined>(undefined);
  private readonly addedProducts = signal<ReadonlyMap<string, Product>>(new Map());
  readonly items: Signal<readonly CartLineItem[]> = this.#lineItems.asReadonly();
  readonly maxQuantity = MAX_CART_QUANTITY;
  private readonly persistenceError = signal('');
  private readonly loadError = signal('');
  readonly storageError = computed(() => this.loadError() || this.persistenceError());
  private readonly message = signal('');
  readonly announcement = this.message.asReadonly();
  private announcementTimer?: ReturnType<typeof setTimeout>;

  // Compatibility projection: products never enter persistence.
  readonly lines = computed<CartLine[]>(() => {
    if (this.owner() !== this.currentOwner()) return [];
    const state = this.catalog();
    return this.items().map((item) => {
      const product =
        state && state.ids.includes(item.productId) && !state.loading && !state.error
          ? state.products.find((value) => value.id === item.productId)
          : this.addedProducts().get(item.productId);
      const line: CartLine = {
        product: product ?? this.unavailableProduct(item),
        quantity: item.quantity,
        variantId: item.variantId ?? undefined,
      };
      const stock = this.available(line);
      return {
        ...line,
        quantity: stock > 0 ? Math.min(item.quantity, stock, MAX_CART_QUANTITY) : item.quantity,
      };
    });
  });
  readonly totalItemsCount = computed(() =>
    this.lines().reduce((total, line) => total + line.quantity, 0),
  );
  readonly estimatedSubtotalCents = computed(() =>
    this.lines().reduce(
      (total, line) => total + moneyToCents(this.unitPrice(line)) * line.quantity,
      0,
    ),
  );

  constructor() {
    // Identity alone drives scope changes; edits must never reload stored data.
    effect(() => {
      const nextOwner = this.currentOwner();
      untracked(() => {
        if (nextOwner === undefined || nextOwner === this.owner()) return;
        const previousOwner = this.owner();
        if (previousOwner !== undefined) this.save(previousOwner, this.items());
        this.#lineItems.set(this.load(nextOwner));
        this.addedProducts.set(new Map());
        this.message.set('');
        clearTimeout(this.announcementTimer);
        this.owner.set(nextOwner);
      });
    });
    effect(() => {
      const state = this.catalog();
      const owner = this.owner();
      if (
        owner === undefined ||
        owner !== this.currentOwner() ||
        !state ||
        state.loading ||
        state.error
      )
        return;
      untracked(() => {
        const next = this.lines().map((line): CartLineItem => ({
          productId: line.product.id,
          variantId: line.variantId ?? null,
          quantity: line.quantity,
          snapshotPriceInCents: moneyToCents(this.unitPrice(line)),
        }));
        if (JSON.stringify(next) !== JSON.stringify(this.items())) this.#lineItems.set(next);
      });
    });
    // Prevent a pending auth effect from saving A's bag under B's key.
    effect(() => {
      const owner = this.owner();
      const items = this.items();
      if (owner !== undefined && owner === this.currentOwner())
        untracked(() => this.save(owner, items));
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.announcementTimer);
      const owner = this.owner();
      if (owner !== undefined) this.save(owner, this.items());
    });
  }
  private currentOwner(): string | undefined {
    const user = this.auth.currentUser();
    return user === undefined
      ? undefined
      : user === null
        ? 'guest'
        : `user-${encodeURIComponent(user.uid)}`;
  }
  available(line: CartLine): number {
    if (!line.product.active) return 0;
    return line.variantId
      ? (line.product.variants?.find((item) => item.id === line.variantId)?.quantity ?? 0)
      : line.product.variants?.length
        ? 0
        : line.product.quantity;
  }
  unitPrice(line: CartLine): number {
    if (line.variantId && !line.product.variants?.some((item) => item.id === line.variantId)) {
      const item = this.items().find(
        (item) => item.productId === line.product.id && item.variantId === line.variantId,
      );
      if (item) return item.snapshotPriceInCents / 100;
    }
    return (
      line.product.variants?.find((item) => item.id === line.variantId)?.price ?? line.product.price
    );
  }
  optionLabel(line: CartLine): string {
    const option = line.product.variants?.find((item) => item.id === line.variantId);
    return option ? `${option.color} / ${option.size}` : 'Selection unavailable';
  }
  add(product: Product, quantity = 1, variantId?: string): void {
    if (
      this.owner() === undefined ||
      this.owner() !== this.currentOwner() ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    )
      return;
    toProductDocument(product);
    const line = { product, quantity, variantId };
    const limit = Math.min(MAX_CART_QUANTITY, this.available(line));
    if (limit < 1) return;
    const index = this.items().findIndex(
      (item) => item.productId === product.id && item.variantId === (variantId ?? null),
    );
    if (index < 0 && this.items().length >= MAX_CART_LINES) {
      this.announce('Your bag can hold up to 15 selections.');
      return;
    }
    const previous = index < 0 ? 0 : this.items()[index].quantity;
    if (previous >= limit) {
      this.announce(
        'The maximum available quantity is already in your bag (up to 10 per selection).',
      );
      return;
    }
    this.addedProducts.update((products) => new Map(products).set(product.id, product));
    const item: CartLineItem = Object.freeze({
      productId: product.id,
      variantId: variantId ?? null,
      quantity: Math.min(previous + quantity, limit),
      snapshotPriceInCents: moneyToCents(this.unitPrice(line)),
    });
    this.#lineItems.update((items) =>
      index < 0 ? [...items, item] : items.map((value, i) => (i === index ? item : value)),
    );
    this.announce(`${product.name} added to your bag. ${this.totalItemsCount()} items in total.`);
  }
  setQuantity(productId: string, quantity: number, variantId?: string): void {
    if (this.owner() !== this.currentOwner() || !Number.isSafeInteger(quantity)) return;
    if (quantity <= 0) {
      this.remove(productId, variantId);
      return;
    }
    const line = this.lines().find(
      (item) => item.product.id === productId && item.variantId === variantId,
    );
    if (!line || this.available(line) < 1) return;
    this.#lineItems.update((items) =>
      items.map((item) =>
        item.productId === productId && item.variantId === (variantId ?? null)
          ? Object.freeze({
              ...item,
              quantity: Math.min(quantity, MAX_CART_QUANTITY, this.available(line)),
            })
          : item,
      ),
    );
  }
  remove(productId: string, variantId?: string): void {
    if (this.owner() !== this.currentOwner()) return;
    this.#lineItems.update((items) =>
      items.filter(
        (item) => item.productId !== productId || item.variantId !== (variantId ?? null),
      ),
    );
  }
  clear(): void {
    if (this.owner() !== this.currentOwner()) return;
    this.#lineItems.set([]);
  }
  private announce(message: string): void {
    this.message.set(message);
    clearTimeout(this.announcementTimer);
    this.announcementTimer = setTimeout(() => this.message.set(''), 4000);
  }
  private key(owner: string): string {
    return `emey-cart-v3:${owner}`;
  }
  private save(owner: string, items: readonly CartLineItem[]): void {
    try {
      localStorage.setItem(this.key(owner), JSON.stringify(decodeCartItems(items)));
      this.persistenceError.set('');
    } catch {
      this.persistenceError.set(
        'Your bag is available for this session, but could not be saved on this device.',
      );
    }
  }
  private load(owner: string): CartLineItem[] {
    this.loadError.set('');
    try {
      const saved = localStorage.getItem(this.key(owner));
      if (saved !== null) return decodeCartItems(JSON.parse(saved));
      // One-time guest migration extracts only identifiers, quantities and cents.
      if (owner === 'guest') {
        const old = localStorage.getItem('emey-cart-v2');
        if (old !== null) {
          const data: unknown = JSON.parse(old);
          if (!Array.isArray(data)) throw new Error('Invalid legacy bag.');
          const migrated = decodeCartItems(
            data.map((value: unknown) => {
              const line = record(value);
              const product = record(line['product']);
              const variants: unknown = product['variants'];
              const option = Array.isArray(variants)
                ? variants.map((v: unknown) => record(v)).find((v) => v['id'] === line['variantId'])
                : undefined;
              return {
                productId: identifier(product['id']),
                variantId: line['variantId'] === undefined ? null : identifier(line['variantId']),
                quantity: Math.min(integer(line['quantity'], 1), MAX_CART_QUANTITY),
                snapshotPriceInCents: moneyToCents(option?.['price'] ?? product['price']),
              };
            }),
          );
          try {
            localStorage.setItem(this.key(owner), JSON.stringify(migrated));
            localStorage.removeItem('emey-cart-v2');
          } catch {
            this.persistenceError.set(
              'Your bag is available for this session, but could not be saved on this device.',
            );
          }
          return migrated;
        }
      }
      return [];
    } catch {
      this.loadError.set(
        'Saved bag data could not be loaded. You can create a new bag for this session.',
      );
      return [];
    }
  }
  private unavailableProduct(item: CartLineItem): Product {
    return {
      id: item.productId,
      slug: '',
      name: 'Unavailable selection',
      category: 'Bags & Accessories',
      description: '',
      price: item.snapshotPriceInCents / 100,
      quantity: 0,
      active: false,
      imageUrl: '',
      gallery: [],
      colors: [],
      bestSeller: false,
      newArrival: false,
    };
  }
}
