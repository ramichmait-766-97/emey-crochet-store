import { FirebaseService } from './firebase.service';
import { Injectable, inject } from '@angular/core';
import { deleteField, doc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { PRODUCT_CATEGORIES } from '../constants/store.constants';
import { Product } from '../models/product.model';
import { SiteSettings } from '../models/site-settings.model';
import { ImageUploadService } from './image-upload.service';
import { decodeProduct } from '../../types/commerce.contracts';
import { DEFAULT_CATALOG_FILTERS } from '../../types/commerce.contracts';
import { ProductService } from './product.service';

export type ProductDraft = Omit<Product, 'createdAt' | 'modifiedAt'> & {
  createdAt?: unknown;
  modifiedAt?: unknown;
};

@Injectable({ providedIn: 'root' })
export class AdminStoreService {
  private readonly firestore = inject(FirebaseService).firestore;
  private readonly imageUpload = inject(ImageUploadService);
  private readonly catalog = inject(ProductService);
  readonly loadError = this.catalog.error;
  readonly products = this.catalog.displayProducts;
  readonly loadingProducts = this.catalog.isLoading;
  readonly hasMoreProducts = this.catalog.hasMorePages;
  readonly rejectedProducts = this.catalog.rejectedProducts;
  loadProducts(reset = false): Promise<void> {
    return this.catalog.fetchNextPage({ ...DEFAULT_CATALOG_FILTERS, limit: 25 }, reset, true);
  }

  async saveProduct(draft: ProductDraft, file?: File, galleryFiles: File[] = []): Promise<void> {
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
    const gallery = [...(draft.gallery || [])];
    if (gallery.length + galleryFiles.length > 8)
      throw new Error('Use up to eight additional photos.');
    for (const photo of galleryFiles)
      gallery.push((await this.imageUpload.upload(photo, id)).imageUrl);
    if (gallery.some((url) => !url.startsWith('https://ik.imagekit.io/s5yr4ioi1/')))
      throw new Error('Gallery images must use the store image host.');
    const variants = (draft.variants || []).map((item) => ({
      id: item.id,
      color: item.color.trim(),
      size: item.size.trim(),
      quantity: item.quantity,
      price: item.price,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    }));
    if (
      new Set(
        variants.map(
          (item) => `${item.color.trim().toLowerCase()}:${item.size.trim().toLowerCase()}`,
        ),
      ).size !== variants.length
    )
      throw new Error('Use only one option per color and size combination.');
    if (
      variants.some(
        (item) =>
          item.color.length > 80 ||
          item.size.length > 80 ||
          item.price > 100000 ||
          (item.imageUrl && !item.imageUrl.startsWith('https://ik.imagekit.io/s5yr4ioi1/')),
      )
    )
      throw new Error('Check option labels, prices and hosted photo mapping.');
    if (
      variants.length > 25 ||
      new Set(variants.map((item) => item.id)).size !== variants.length ||
      variants.some(
        (item) =>
          !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
          !item.color.trim() ||
          !item.size.trim() ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 0 ||
          !Number.isFinite(item.price) ||
          item.price <= 0 ||
          Math.abs(Math.round(item.price * 100) / 100 - item.price) > 0.000001,
      )
    )
      throw new Error(
        'Each variant needs a unique ID, color, size, positive two-decimal price and whole available quantity.',
      );

    if (!file && !draft.imageData && !draft.imageUrl) {
      throw new Error('Please choose a product image.');
    }

    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(productRef);
      const current = snapshot.exists()
        ? decodeProduct({ ...snapshot.data(), id: snapshot.id })
        : undefined;
      if ((current?.inventoryVersion || 0) !== (draft.inventoryVersion || 0))
        throw new Error('Stock changed while editing. Reopen this product before saving.');
      const oldMatrix = (current?.variants || []).map(
        (item: { id: string; color: string; size: string }) => [item.id, item.color, item.size],
      );
      if (
        (current?.reservedUnits ?? 0) > 0 &&
        JSON.stringify(oldMatrix) !==
          JSON.stringify(variants.map((item) => [item.id, item.color, item.size]))
      )
        throw new Error(
          'Existing orders reserve these options. Keep the variant IDs, colors and sizes until those orders close.',
        );
      transaction.set(
        productRef,
        {
          id,
          slug: this.slugify(draft.slug || draft.name),
          name: draft.name.trim(),
          category: draft.category,
          description: draft.description.trim(),
          colors: draft.colors ?? [],
          gallery,
          variants,
          inventoryVersion: (current?.inventoryVersion || 0) + 1,
          price: Number(draft.price),
          quantity: variants.length
            ? variants.reduce((total, item) => total + item.quantity, 0)
            : Math.max(0, Math.floor(Number(draft.quantity))),
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
    });
    await this.loadProducts(true);
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

  private normalizeId(value: string): string {
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '-');
    if (!normalized) {
      throw new Error('Product ID is required.');
    }
    if (normalized.length > 128) throw new Error('Product ID must be at most 128 characters.');
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
