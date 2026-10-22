import { Injectable, inject } from '@angular/core';
import {
  Bytes,
  Firestore,
  collection,
  collectionData,
  doc,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable, map, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Product } from '../models/product.model';
import { SiteSettings } from '../models/site-settings.model';
import { MAX_PRODUCT_IMAGE_BYTES, productImageSrc } from '../utils/product-image';
import { SEED_PRODUCTS } from './seed-products';

export type ProductDraft = Omit<Product, 'createdAt' | 'modifiedAt'> & {
  createdAt?: unknown;
  modifiedAt?: unknown;
};

@Injectable({ providedIn: 'root' })
export class AdminStoreService {
  private readonly firestore = inject(Firestore);

  readonly products$ = this.createProductStream();

  async saveProduct(draft: ProductDraft, file?: File): Promise<void> {
    if (environment.demoMode) {
      throw new Error('Persistent writes are disabled while demo mode is enabled.');
    }

    const id = this.normalizeId(draft.id);
    const productRef = doc(this.firestore, `products/${id}`);
    const imagePayload = file ? await this.imageBytesFromFile(file) : null;

    if (!file && !draft.imageData && !draft.imageUrl) {
      throw new Error('Please choose a product image.');
    }

    await setDoc(
      productRef,
      {
        id,
        slug: this.slugify(draft.slug || draft.name),
        name: draft.name.trim(),
        category: draft.category,
        description: draft.description.trim(),
        colors: draft.colors ?? [],
        gallery: [],
        price: Number(draft.price),
        quantity: Math.max(0, Math.floor(Number(draft.quantity))),
        bestSeller: !!draft.bestSeller,
        newArrival: !!draft.newArrival,
        active: !!draft.active,
        createdAt: draft.createdAt ?? serverTimestamp(),
        modifiedAt: serverTimestamp(),
        ...(imagePayload ?? {}),
      },
      { merge: true },
    );
  }

  async saveSettings(settings: SiteSettings): Promise<void> {
    if (environment.demoMode) {
      throw new Error('Persistent writes are disabled while demo mode is enabled.');
    }

    await setDoc(
      doc(this.firestore, 'siteSettings/public'),
      {
        ...settings,
        memberDiscountPercent: Math.min(100, Math.max(0, Number(settings.memberDiscountPercent))),
        modifiedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  private createProductStream(): Observable<Product[]> {
    if (environment.demoMode) {
      return of(SEED_PRODUCTS).pipe(shareReplay(1));
    }

    return (collectionData(collection(this.firestore, 'products'), {
      idField: 'id',
    }) as Observable<Product[]>).pipe(
      map((products) =>
        products.map((product) => ({
          ...product,
          imageUrl: productImageSrc(product),
          gallery: product.gallery ?? [],
          colors: product.colors ?? [],
        })),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  private async imageBytesFromFile(file: File): Promise<{
    imageData: Bytes;
    imageContentType: string;
  }> {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please choose a valid image file.');
    }
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      throw new Error(
        'Product images must be smaller than 700 KB so they fit in a Firestore document.',
      );
    }

    const buffer = await file.arrayBuffer();
    return {
      imageData: Bytes.fromUint8Array(new Uint8Array(buffer)),
      imageContentType: file.type,
    };
  }

  private normalizeId(value: string): string {
    const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
    if (!normalized) {
      throw new Error('Product ID is required.');
    }
    return normalized;
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
