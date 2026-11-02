import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  collection,
  documentId,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  DocumentData,
  Query,
  QueryConstraint,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { Observable, map, of } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { Product } from '../models/product.model';
import {
  CatalogQueryFilters,
  PaginatedCatalogPage,
  decodeCatalogQueryFilters,
  decodeProduct,
  identifier,
  toProductDocument,
} from '../../types/commerce.contracts';

/** Logical contract names map to existing persisted fields; no database migration. */
const SORT_FIELDS = {
  basePriceInCents: 'price',
  title: 'name',
  version: 'inventoryVersion',
} as const;
@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly firestore = inject(FirebaseService).firestore;
  #currentPage = signal<PaginatedCatalogPage>({
    products: [],
    lastVisibleId: null,
    hasMore: false,
  });
  #loadingSignal = signal(false);
  #hasMoreSignal = signal(false);
  #products = signal<Product[]>([]);
  #error = signal('');
  #rejected = signal(0);
  #key = signal('');
  #notice = signal('');
  private cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  private generation = 0;
  private destroyed = false;
  readonly catalogPage = this.#currentPage.asReadonly();
  readonly isLoading = this.#loadingSignal.asReadonly();
  readonly hasMorePages = this.#hasMoreSignal.asReadonly();
  readonly displayProducts = this.#products.asReadonly();
  readonly error = this.#error.asReadonly();
  readonly rejectedProducts = this.#rejected.asReadonly();
  readonly notice = this.#notice.asReadonly();
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation++;
    });
  }

  matchesFilters(filters: CatalogQueryFilters, includeInactive = false): boolean {
    return this.#key() === this.key(decodeCatalogQueryFilters(filters), includeInactive);
  }
  private key(filters: CatalogQueryFilters, includeInactive: boolean): string {
    return JSON.stringify([filters, SORT_FIELDS[filters.sortField], includeInactive]);
  }
  async fetchNextPage(
    input: CatalogQueryFilters,
    reset = false,
    includeInactive = false,
  ): Promise<void> {
    if (this.destroyed) return;
    let filters: CatalogQueryFilters;
    try {
      filters = decodeCatalogQueryFilters(input);
      if (includeInactive && (filters.category || filters.searchToken || filters.collection))
        throw new Error('Admin product pagination supports unfiltered ordering only.');
    } catch (error) {
      this.generation++;
      this.#key.set('');
      this.cursor = null;
      this.#products.set([]);
      this.#currentPage.set({ products: [], lastVisibleId: null, hasMore: false });
      this.#loadingSignal.set(false);
      this.#hasMoreSignal.set(false);
      this.#notice.set('');
      this.#rejected.set(0);
      this.#error.set(error instanceof Error ? error.message : 'Invalid catalog filters.');
      return;
    }
    const key = this.key(filters, includeInactive);
    if (this.destroyed) return;
    if (reset || key !== this.#key()) {
      this.generation++;
      this.#key.set(key);
      this.cursor = null;
      this.#products.set([]);
      this.#currentPage.set({ products: [], lastVisibleId: null, hasMore: true });
      this.#hasMoreSignal.set(true);
      this.#rejected.set(0);
      this.#loadingSignal.set(false);
    }
    if (this.#loadingSignal() || !this.#hasMoreSignal()) return;
    const generation = this.generation;
    this.#loadingSignal.set(true);
    this.#error.set('');
    this.#notice.set(
      filters.sortField === 'version'
        ? 'Version ordering includes only products with a stored inventory version.'
        : '',
    );
    try {
      const constraints: QueryConstraint[] = includeInactive ? [] : [where('active', '==', true)];
      if (filters.category) constraints.push(where('category', '==', filters.category));
      if (filters.collection)
        constraints.push(
          where(filters.collection === 'new' ? 'newArrival' : 'bestSeller', '==', true),
        );
      if (filters.searchToken)
        constraints.push(
          where('name', '>=', filters.searchToken),
          where('name', '<=', filters.searchToken + '\uf8ff'),
        );
      constraints.push(
        orderBy(SORT_FIELDS[filters.sortField], filters.sortDirection),
        orderBy(documentId(), filters.sortDirection),
      );
      if (this.cursor) constraints.push(startAfter(this.cursor));
      // One lookahead row determines hasMore without a count or an unbounded scan.
      constraints.push(limit(filters.limit + 1));
      const snapshot = await getDocsFromServer(
        query(collection(this.firestore, 'products'), ...constraints),
      );
      if (this.destroyed || generation !== this.generation) return;
      const consumed = snapshot.docs.slice(0, filters.limit);
      const valid: Product[] = [];
      let rejected = 0;
      for (const document of consumed) {
        try {
          const product = decodeProduct({ ...document.data(), id: document.id });
          // decodeProduct/toProductDocument invoke assertValidProduct at this boundary.
          valid.push(product);
        } catch {
          rejected++;
        }
      }
      // Advance across malformed documents too: never loop on the same invalid row.
      this.cursor = consumed.at(-1) ?? this.cursor;
      const products = [
        ...new Map(
          [...this.#products(), ...valid].map((product) => [product.id, product]),
        ).values(),
      ];
      const hasMore = snapshot.docs.length > filters.limit;
      this.#products.set(products);
      this.#rejected.update((count) => count + rejected);
      this.#hasMoreSignal.set(hasMore);
      this.#currentPage.set({
        products: products.map(toProductDocument),
        lastVisibleId: this.cursor?.id ?? null,
        hasMore,
      });
    } catch (error) {
      if (generation !== this.generation || this.destroyed) return;
      const missingIndex =
        !!error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'failed-precondition';
      if (missingIndex)
        this.#notice.set('A required catalog index must be enabled before this query can run.');
      this.#error.set(
        missingIndex
          ? 'The collection is temporarily unavailable. Please retry later or contact the store.'
          : 'The collection could not load. Check your connection and retry.',
      );
    } finally {
      if (generation === this.generation && !this.destroyed) this.#loadingSignal.set(false);
    }
  }

  /** A bag's absence from the current browse page is never evidence of deletion. */
  watchProducts(ids: readonly string[]): Observable<Product[]> {
    const unique = [...new Set(ids.map(identifier))];
    if (unique.length > 15) throw new Error('A bag can watch at most 15 products.');
    if (!unique.length) return of([]);
    return this.watch(
      query(
        collection(this.firestore, 'products'),
        where('active', '==', true),
        where(documentId(), 'in', unique),
        orderBy(documentId(), 'asc'),
        limit(unique.length),
      ),
    );
  }
  watchBySlug(slug: string): Observable<Product | undefined> {
    if (!slug || slug.length > 200) return of(undefined);
    return this.watch(
      query(
        collection(this.firestore, 'products'),
        where('active', '==', true),
        where('slug', '==', slug),
        orderBy(documentId(), 'asc'),
        limit(2),
      ),
    ).pipe(
      map((products) => {
        if (products.length > 1)
          throw new Error('This product link is ambiguous. Please contact the store.');
        return products[0];
      }),
    );
  }
  private watch(request: Query<DocumentData>): Observable<Product[]> {
    return new Observable((subscriber) =>
      onSnapshot(
        request,
        (snapshot) => {
          try {
            subscriber.next(
              snapshot.docs.map((document) =>
                decodeProduct({ ...document.data(), id: document.id }),
              ),
            );
          } catch (error) {
            subscriber.error(error);
          }
        },
        (error) => subscriber.error(error),
      ),
    );
  }
}
