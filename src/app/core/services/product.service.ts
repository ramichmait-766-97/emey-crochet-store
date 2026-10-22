import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  query,
  where,
} from '@angular/fire/firestore';
import { Observable, map, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Product } from '../models/product.model';
import { SEED_PRODUCTS } from './seed-products';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly firestore = inject(Firestore);
  private readonly products$ = this.createProductStream();

  list(): Observable<Product[]> {
    return this.products$;
  }

  featured(): Observable<Product[]> {
    return this.products$.pipe(
      map((products) =>
        products.filter((product) => product.bestSeller || product.newArrival).slice(0, 8),
      ),
    );
  }

  bySlug(slug: string): Observable<Product | undefined> {
    if (environment.demoMode) {
      return of(SEED_PRODUCTS.find((product) => product.slug === slug));
    }

    return this.products$.pipe(
      map((products) => products.find((product) => product.slug === slug)),
    );
  }

  byId(id: string): Observable<Product | undefined> {
    if (environment.demoMode) {
      return of(SEED_PRODUCTS.find((product) => product.id === id));
    }

    return docData(doc(this.firestore, `products/${id}`), { idField: 'id' }) as Observable<
      Product | undefined
    >;
  }

  private createProductStream(): Observable<Product[]> {
    if (environment.demoMode) {
      return of(SEED_PRODUCTS).pipe(shareReplay(1));
    }

    const productsQuery = query(
      collection(this.firestore, 'products'),
      where('active', '==', true),
    );

    return (collectionData(productsQuery, { idField: 'id' }) as Observable<Product[]>).pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
