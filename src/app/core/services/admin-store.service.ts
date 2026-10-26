import { collectionData } from '../utils/firestore-streams';
import { FirebaseService } from './firebase.service';
import { Injectable, inject, signal } from '@angular/core';
import { collection, deleteField, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { PRODUCT_CATEGORIES } from '../constants/store.constants';
import { Product } from '../models/product.model';
import { SiteSettings } from '../models/site-settings.model';
import { productImageSrc } from '../utils/product-image';
import { ImageUploadService } from './image-upload.service';

export type ProductDraft = Omit<Product, 'createdAt' | 'modifiedAt'> & {
  createdAt?: unknown;
  modifiedAt?: unknown;
};

@Injectable({ providedIn: 'root' })
export class AdminStoreService {
  private readonly firestore = inject(FirebaseService).firestore;
  private readonly imageUpload = inject(ImageUploadService);
  readonly loadError = signal('');

  readonly products$ = this.createProductStream();

  async saveProduct(draft: ProductDraft, file?: File): Promise<void> {
    if (
      !draft.name.trim() ||
      !draft.description.trim() ||
      !PRODUCT_CATEGORIES.includes(draft.category)
    ) {
      throw new Error('Add a name, description and valid collection.');
    }
    if (
      !Number.isFinite(Number(draft.price)) ||
      Number(draft.price) < 0 ||
      !Number.isInteger(Number(draft.quantity)) ||
      Number(draft.quantity) < 0
    ) {
      throw new Error('Enter a valid price and a whole stock quantity of zero or more.');
    }

    const id = this.normalizeId(draft.id);
    const productRef = doc(this.firestore, `products/${id}`);
    const imagePayload = file ? await this.imageUpload.upload(file, id) : null;

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
        ...(imagePayload
          ? {
              ...imagePayload,
              imageData: deleteField(),
            }
          : {}),
      },
      { merge: true },
    );
  }

  async saveSettings(settings: SiteSettings): Promise<void> {
    if (
      !settings.storeName.trim() ||
      !/^[A-Z]{3}$/.test(settings.currency.trim().toUpperCase()) ||
      !Number.isFinite(Number(settings.memberDiscountPercent))
    ) {
      throw new Error('Enter a store name, three-letter currency and valid discount.');
    }
    for (const contact of settings.contacts) {
      if (contact.enabled && (!contact.label.trim() || !contact.value.trim()))
        throw new Error('Enabled contacts need a label and contact details.');
      if (contact.url && !/^(https?:\/\/|mailto:|tel:)/i.test(contact.url))
        throw new Error('Contact links must begin with https://, mailto: or tel:.');
    }

    await setDoc(
      doc(this.firestore, 'siteSettings/public'),
      {
        ...settings,
        storeName: settings.storeName.trim(),
        currency: settings.currency.trim().toUpperCase(),
        memberDiscountPercent: Math.min(100, Math.max(0, Number(settings.memberDiscountPercent))),
        modifiedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  private createProductStream(): Observable<Product[]> {
    return collectionData<Product>(collection(this.firestore, 'products'), { idField: 'id' }).pipe(
      map((products) => {
        this.loadError.set('');
        return products.map((product) => ({
          ...product,
          imageUrl: productImageSrc(product),
          gallery: product.gallery ?? [],
          colors: product.colors ?? [],
        }));
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
      catchError(() => {
        this.loadError.set('We could not load your products. Please refresh and try again.');
        return of([] as Product[]);
      }),
    );
  }

  private normalizeId(value: string): string {
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '-');
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
