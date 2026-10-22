import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Storage, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { Observable, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Product } from '../models/product.model';
import { SiteSettings } from '../models/site-settings.model';
import { SEED_PRODUCTS } from './seed-products';

export type ProductDraft = Omit<Product, 'createdAt' | 'modifiedAt'> & {
  createdAt?: unknown;
  modifiedAt?: unknown;
};

@Injectable({ providedIn: 'root' })
export class AdminStoreService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(Storage);

  readonly products$ = this.createProductStream();

  async saveProduct(draft: ProductDraft, file?: File): Promise<void> {
    if (environment.demoMode) {
      throw new Error('Persistent writes are disabled while demo mode is enabled.');
    }

    const id = this.normalizeId(draft.id);
    const imageUrl = file ? await this.uploadProductImage(id, file) : draft.imageUrl;
    const productRef = doc(this.firestore, `products/${id}`);

    await setDoc(
      productRef,
      {
        ...draft,
        id,
        slug: this.slugify(draft.slug || draft.name),
        imageUrl,
        gallery: draft.gallery?.length ? draft.gallery : imageUrl ? [imageUrl] : [],
        colors: draft.colors ?? [],
        price: Number(draft.price),
        quantity: Math.max(0, Math.floor(Number(draft.quantity))),
        createdAt: draft.createdAt ?? serverTimestamp(),
        modifiedAt: serverTimestamp(),
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
    }) as Observable<Product[]>).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  private async uploadProductImage(productId: string, file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please choose a valid image file.');
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('Product images must be smaller than 8 MB.');
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const imageRef = ref(this.storage, `products/${productId}/${Date.now()}.${extension}`);
    await uploadBytes(imageRef, file, { contentType: file.type });
    return getDownloadURL(imageRef);
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
