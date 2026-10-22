import { collectionData } from '../utils/firestore-streams';
import { FirebaseService } from './firebase.service';
import { Injectable, inject } from '@angular/core';
import { collection, query, where } from 'firebase/firestore';
import { Observable, Subject, catchError, map, of, shareReplay, startWith, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Product } from '../models/product.model';
import { productImageSrc } from '../utils/product-image';
import { SEED_PRODUCTS } from './seed-products';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly firestore = inject(FirebaseService).firestore;
  private readonly products$ = this.createProductStream();
  private readonly reload$ = new Subject<void>();
  readonly state$ = this.reload$.pipe(
    startWith(undefined),
    switchMap(() =>
      this.products$.pipe(
        map((products) => ({ products, loading: false, error: '' })),
        startWith({ products: [] as Product[], loading: true, error: '' }),
        catchError(() =>
          of({
            products: [] as Product[],
            loading: false,
            error:
              'Please check your connection and try again. If this continues, contact the store.',
          }),
        ),
      ),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  refresh(): void {
    this.reload$.next();
  }

  private createProductStream(): Observable<Product[]> {
    if (environment.demoMode) {
      return of(SEED_PRODUCTS).pipe(shareReplay(1));
    }

    const productsQuery = query(
      collection(this.firestore, 'products'),
      where('active', '==', true),
    );

    return collectionData<Product>(productsQuery, { idField: 'id' }).pipe(
      map((products) => products.map((product) => this.withDisplayImage(product))),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  private withDisplayImage(product: Product): Product {
    return {
      ...product,
      imageUrl: productImageSrc(product),
      gallery: product.gallery ?? [],
      colors: product.colors ?? [],
    };
  }
}
