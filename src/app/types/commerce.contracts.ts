import { Product } from '../core/models/product.model';
import {
  CheckoutSettings,
  LedgerOrder,
  OrderPage,
  OrderQuote,
} from '../core/models/commerce.model';
import { ContactMethod, SiteSettings } from '../core/models/site-settings.model';
import { CustomerProfile } from '../core/models/profile.model';
import { PRODUCT_CATEGORIES } from '../core/constants/store.constants';
import { environment } from '../../environments/environment';

// Future provider-facing vocabulary. The existing ledger keeps its richer states.
export type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'AUTHORIZED' | 'PAID' | 'REFUNDED';
export interface ImageKitMetadata {
  readonly url: string;
  readonly path: string;
  readonly lqip?: string;
}
export interface ProductVariant {
  readonly id: string;
  readonly color: string;
  readonly size: string;
  readonly stock: number;
  readonly priceInCents: number;
  readonly image?: ImageKitMetadata;
}
export interface ProductDocument {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly active: boolean;
  readonly basePriceInCents: number;
  readonly media: readonly ImageKitMetadata[];
  readonly variants: readonly ProductVariant[];
  readonly version: number;
}
export interface CartLineItem {
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly snapshotPriceInCents: number;
}
export interface CatalogQueryFilters {
  readonly category: string | null;
  readonly searchToken: string | null;
  readonly sortField: 'basePriceInCents' | 'title' | 'version';
  readonly sortDirection: 'asc' | 'desc';
  readonly limit: number;
  readonly collection?: 'new' | 'bestsellers' | null;
}
export interface PaginatedCatalogPage {
  readonly products: readonly ProductDocument[];
  readonly lastVisibleId: string | null;
  readonly hasMore: boolean;
}
export const DEFAULT_CATALOG_FILTERS: CatalogQueryFilters = Object.freeze({
  category: null,
  searchToken: null,
  sortField: 'title',
  sortDirection: 'asc',
  limit: 12,
});
export function decodeCatalogQueryFilters(data: unknown): CatalogQueryFilters {
  const d = record(data);
  const searchToken = d['searchToken'] === null ? null : text(d['searchToken'], 200).trim() || null;
  const sortField = choice(d['sortField'], ['basePriceInCents', 'title', 'version']);
  if (searchToken && sortField !== 'title')
    throw new Error('Name-prefix search requires name sorting.');
  return Object.freeze({
    category: d['category'] === null ? null : choice(d['category'], PRODUCT_CATEGORIES),
    searchToken,
    sortField,
    sortDirection: choice(d['sortDirection'], ['asc', 'desc']),
    limit: integer(d['limit'], 1, 48),
    collection: d['collection'] == null ? null : choice(d['collection'], ['new', 'bestsellers']),
  });
}
export const MAX_CART_QUANTITY = 10;
export const MAX_CART_LINES = 15;

export function record(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Malformed data payload intercepted.');
  return data as Record<string, unknown>;
}
export function text(data: unknown, max = 1000): string {
  if (typeof data !== 'string' || data.length > max)
    throw new Error('Invalid text in data payload.');
  return data;
}
export function identifier(data: unknown): string {
  const value = text(data, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid identifier in data payload.');
  return value;
}
export function integer(data: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < min || data > max)
    throw new Error('Invalid integer in data payload.');
  return data;
}
function boolean(data: unknown): boolean {
  if (typeof data !== 'boolean') throw new Error('Invalid boolean in data payload.');
  return data;
}
function list<T>(data: unknown, decode: (item: unknown) => T, max = 1000): T[] {
  if (!Array.isArray(data) || data.length > max) throw new Error('Invalid list in data payload.');
  return data.map((item: unknown) => decode(item));
}
function choice<const T extends string>(data: unknown, values: readonly T[]): T {
  const result = values.find((value) => value === data);
  if (!result) throw new Error('Invalid status in data payload.');
  return result;
}
function unique(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate identifiers in data payload.');
}
export function imageKitUrl(data: unknown): string {
  const value = text(data, 4096);
  const url = new URL(value);
  const endpoint = new URL(environment.images.urlEndpoint + '/');
  if (
    url.origin !== endpoint.origin ||
    !url.pathname.startsWith(endpoint.pathname) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error('Unapproved image host.');
  return value;
}
function media(data: unknown): ImageKitMetadata {
  const d = record(data);
  const url = imageKitUrl(d['url']);
  const path = text(d['path'], 2048);
  if (path !== new URL(url).pathname) throw new Error('Image path mismatch.');
  return Object.freeze({
    url,
    path,
    ...(d['lqip'] === undefined ? {} : { lqip: imageKitUrl(d['lqip']) }),
  });
}
export function assertValidProduct(data: unknown): ProductDocument {
  const d = record(data);
  const variants = list(
    d['variants'],
    (value): ProductVariant => {
      const v = record(value);
      return Object.freeze({
        id: identifier(v['id']),
        color: text(v['color'], 80),
        size: text(v['size'], 80),
        stock: integer(v['stock']),
        priceInCents: integer(v['priceInCents'], 1, 10000000),
        ...(v['image'] === undefined ? {} : { image: media(v['image']) }),
      });
    },
    25,
  );
  unique(variants.map((variant) => variant.id));
  const slug = text(d['slug'], 200);
  const title = text(d['title'], 200);
  if (!slug.trim() || !title.trim()) throw new Error('Product title and slug are required.');
  return Object.freeze({
    id: identifier(d['id']),
    slug,
    title,
    active: boolean(d['active']),
    basePriceInCents: integer(d['basePriceInCents'], 0, 10000000),
    media: Object.freeze(list(d['media'], media, 9)),
    variants: Object.freeze(variants),
    version: integer(d['version']),
  });
}
export function moneyToCents(data: unknown): number {
  if (
    typeof data !== 'number' ||
    !Number.isFinite(data) ||
    data < 0 ||
    data > 100000 ||
    Math.abs(Math.round(data * 100) / 100 - data) > 0.000001
  )
    throw new Error('Invalid price in data payload.');
  return Math.round(data * 100);
}

/** Decode the existing Firestore schema; no migration or legacy byte writes. */
export function decodeProduct(data: unknown): Product {
  const d = record(data);
  const category = choice(d['category'], PRODUCT_CATEGORIES);
  const imageUrl =
    d['imageUrl'] === undefined || d['imageUrl'] === '' ? '' : imageKitUrl(d['imageUrl']);
  const variants = list(
    d['variants'] ?? [],
    (value) => {
      const v = record(value);
      return {
        id: identifier(v['id']),
        color: text(v['color'], 80),
        size: text(v['size'], 80),
        quantity: integer(v['quantity']),
        price: moneyToCents(v['price']) / 100,
        ...(v['imageUrl'] === undefined || v['imageUrl'] === ''
          ? {}
          : { imageUrl: imageKitUrl(v['imageUrl']) }),
      };
    },
    25,
  );
  const product: Product = {
    id: identifier(d['id']),
    slug: text(d['slug'], 200),
    name: text(d['name'], 200),
    category,
    description: text(d['description'], 20000),
    price: moneyToCents(d['price']) / 100,
    quantity: integer(d['quantity']),
    imageUrl,
    gallery: list(d['gallery'] ?? [], imageKitUrl, 8),
    colors: list(d['colors'] ?? [], (v) => text(v, 80), 100),
    variants,
    bestSeller: boolean(d['bestSeller']),
    newArrival: boolean(d['newArrival']),
    active: boolean(d['active']),
    inventoryVersion: integer(d['inventoryVersion'] ?? 0),
    reservedUnits: integer(d['reservedUnits'] ?? 0),
    ...(d['imageFileId'] === undefined ? {} : { imageFileId: text(d['imageFileId'], 256) }),
    ...(d['imageContentType'] === undefined
      ? {}
      : {
          imageContentType: choice(d['imageContentType'], [
            'image/webp',
            'image/jpeg',
            'image/png',
          ]),
        }),
    // Opaque SDK timestamps/legacy bytes are compatibility data, never persisted by the cart.
    createdAt: d['createdAt'],
    modifiedAt: d['modifiedAt'],
    imageData: d['imageData'],
  };
  toProductDocument(product);
  return product;
}
export function toProductDocument(product: Product): ProductDocument {
  const image = (url: string) => ({ url, path: new URL(url).pathname });
  return assertValidProduct({
    id: product.id,
    slug: product.slug,
    title: product.name,
    active: product.active,
    basePriceInCents: moneyToCents(product.price),
    version: product.inventoryVersion ?? 0,
    media: [product.imageUrl, ...product.gallery].filter(Boolean).map(image),
    variants: (product.variants ?? []).map((v) => ({
      id: v.id,
      color: v.color,
      size: v.size,
      stock: v.quantity,
      priceInCents: moneyToCents(v.price),
      ...(v.imageUrl ? { image: image(v.imageUrl) } : {}),
    })),
  });
}

export function decodeCartItems(data: unknown): CartLineItem[] {
  const items = list(
    data,
    (value): CartLineItem => {
      const d = record(value);
      return Object.freeze({
        productId: identifier(d['productId']),
        variantId: d['variantId'] === null ? null : identifier(d['variantId']),
        quantity: integer(d['quantity'], 1, MAX_CART_QUANTITY),
        snapshotPriceInCents: integer(d['snapshotPriceInCents'], 0, 10000000),
      });
    },
    MAX_CART_LINES,
  );
  unique(items.map((item) => `${item.productId}:${item.variantId ?? ''}`));
  return items;
}

export function decodeCheckoutSettings(data: unknown): CheckoutSettings {
  const d = record(data);
  const pickup = record(d['pickup']);
  const zones = list(
    d['zones'],
    (value) => {
      const v = record(value);
      return {
        id: identifier(v['id']),
        label: text(v['label'], 120),
        feeCents: integer(v['feeCents'], 0, 10000000),
        estimate: text(v['estimate'], 120),
        enabled: boolean(v['enabled']),
      };
    },
    20,
  );
  const paymentMethods = list(
    d['paymentMethods'],
    (value) => {
      const v = record(value);
      return {
        id: identifier(v['id']),
        label: text(v['label'], 120),
        instructions: text(v['instructions'], 500),
        enabled: boolean(v['enabled']),
      };
    },
    10,
  );
  unique(zones.map((v) => v.id));
  unique(paymentMethods.map((v) => v.id));
  return {
    enabled: boolean(d['enabled']),
    currency: currency(d['currency']),
    reservationMinutes: integer(d['reservationMinutes'], 15, 10080),
    freeShippingThresholdCents:
      d['freeShippingThresholdCents'] === null
        ? null
        : integer(d['freeShippingThresholdCents'], 0, 10000000),
    zones,
    pickup: { enabled: boolean(pickup['enabled']), details: text(pickup['details'], 300) },
    paymentMethods,
    version: integer(d['version'], 1),
  };
}
function currency(data: unknown): string {
  const value = text(data, 3);
  if (!/^[A-Z]{3}$/.test(value)) throw new Error('Invalid currency.');
  return value;
}
function totals(data: unknown): Omit<OrderQuote, 'quoteFingerprint' | 'reservationMinutes'> {
  const d = record(data);
  const delivery = record(d['delivery']);
  const payment = record(d['payment']);
  const lines = list(
    d['lines'],
    (value) => {
      const v = record(value);
      const line = {
        productId: identifier(v['productId']),
        variantId: v['variantId'] === '' ? '' : identifier(v['variantId']),
        quantity: integer(v['quantity'], 1, 20),
        name: text(v['name'], 200),
        option: text(v['option'], 200),
        unitPriceCents: integer(v['unitPriceCents'], 1, 10000000),
        lineTotalCents: integer(v['lineTotalCents']),
      };
      if (line.lineTotalCents !== line.quantity * line.unitPriceCents)
        throw new Error('Invalid line total.');
      return line;
    },
    15,
  );
  if (!lines.length) throw new Error('Empty order.');
  unique(lines.map((v) => `${v.productId}:${v.variantId}`));
  const subtotalCents = integer(d['subtotalCents']);
  const discountCents = integer(d['discountCents'], 0, subtotalCents);
  const deliveryCents = integer(d['deliveryCents']);
  const totalCents = integer(d['totalCents']);
  if (
    subtotalCents !== lines.reduce((sum, line) => sum + line.lineTotalCents, 0) ||
    totalCents !== subtotalCents - discountCents + deliveryCents
  )
    throw new Error('Invalid order total.');
  return {
    lines,
    subtotalCents,
    discountCents,
    deliveryCents,
    totalCents,
    currency: currency(d['currency']),
    delivery: {
      id: identifier(delivery['id']),
      label: text(delivery['label'], 120),
      estimate: text(delivery['estimate'], 300),
    },
    payment: {
      id: identifier(payment['id']),
      label: text(payment['label'], 120),
      instructions: text(payment['instructions'], 500),
    },
  };
}
function hex(data: unknown, length: number): string {
  const value = text(data, length);
  if (value.length !== length || !/^[a-f0-9]+$/.test(value)) throw new Error('Invalid reference.');
  return value;
}
export function decodeQuote(data: unknown): OrderQuote {
  const d = record(data);
  return {
    ...totals(d),
    quoteFingerprint: hex(d['quoteFingerprint'], 64),
    reservationMinutes: integer(d['reservationMinutes'], 15, 10080),
  };
}
export function decodeOrder(data: unknown): LedgerOrder {
  const d = record(data);
  const amounts = totals(d);
  const paidCents = integer(d['paidCents'], 0, amounts.totalCents);
  return {
    ...amounts,
    id: hex(d['id'], 32),
    createdAt: integer(d['createdAt']),
    updatedAt: integer(d['updatedAt']),
    version: integer(d['version'], 1),
    fulfillmentStatus: choice(d['fulfillmentStatus'], [
      'requested',
      'awaiting_confirmation',
      'confirmed',
      'in_production',
      'dispatched',
      'delivered',
      'cancelled',
      'expired',
    ]),
    paymentStatus: choice(d['paymentStatus'], [
      'unpaid',
      'deposit_paid',
      'fully_paid',
      'partially_refunded',
      'refunded',
    ]),
    reservationState: choice(d['reservationState'], ['held', 'committed', 'released']),
    paidCents,
    refundedCents: integer(d['refundedCents'], 0, paidCents),
    reservationExpiresAt: integer(d['reservationExpiresAt']),
    ...(d['contact'] === undefined ? {} : { contact: decodeContact(d['contact']) }),
  };
}
export function decodeContact(data: unknown) {
  const d = record(data);
  return {
    fullName: text(d['fullName'], 120),
    phone: text(d['phone'], 40),
    email: text(d['email'], 200),
    address: text(d['address'] ?? '', 500),
    building: text(d['building'] ?? '', 120),
    notes: text(d['notes'] ?? '', 1000),
  };
}
export function decodeOrderResponse(data: unknown) {
  return { order: decodeOrder(record(data)['order']) };
}
export function decodeCheckoutResponse(data: unknown) {
  const d = record(data);
  const link = d['whatsappUrl'];
  if (
    link !== null &&
    (typeof link !== 'string' || !/^https:\/\/wa\.me\/\d{8,15}\?text=/.test(link))
  )
    throw new Error('Invalid store conversation link.');
  return { order: decodeOrder(d['order']), whatsappUrl: link };
}
export function decodeOrderPage(data: unknown): OrderPage {
  const d = record(data);
  const cursor = d['cursor'] === null ? null : record(d['cursor']);
  return {
    orders: list(d['orders'], decodeOrder, 25),
    cursor:
      cursor === null
        ? null
        : { createdAt: integer(cursor['createdAt']), id: hex(cursor['id'], 32) },
  };
}
export function decodeSettingsResponse(data: unknown) {
  return { settings: decodeCheckoutSettings(record(data)['settings']) };
}
export function decodePendingCheckout(data: unknown) {
  const d = record(data);
  const lines = list(
    d['lines'],
    (value) => {
      const v = record(value);
      return {
        productId: identifier(v['productId']),
        variantId: v['variantId'] === '' ? '' : identifier(v['variantId']),
        quantity: integer(v['quantity'], 1, 20),
      };
    },
    15,
  );
  if (!lines.length) throw new Error('Empty recovery request.');
  return {
    checkoutKey: hex(d['checkoutKey'], 64),
    ...(d['cartOwner'] === undefined
      ? {}
      : { cartOwner: d['cartOwner'] === null ? null : text(d['cartOwner'], 128) }),
    contact: decodeContact(d['contact']),
    deliveryId: identifier(d['deliveryId']),
    paymentId: identifier(d['paymentId']),
    lines,
    ...(d['quoteFingerprint'] === undefined
      ? {}
      : { quoteFingerprint: hex(d['quoteFingerprint'], 64) }),
  };
}
export function decodeSiteSettings(data: unknown): SiteSettings {
  const d = record(data);
  const discount = d['memberDiscountPercent'];
  if (typeof discount !== 'number' || !Number.isFinite(discount) || discount < 0 || discount > 100)
    throw new Error('Invalid member discount.');
  return {
    storeName: text(d['storeName'], 120),
    currency: currency(d['currency']),
    memberDiscountPercent: discount,
    contacts: list(
      d['contacts'] ?? [],
      (value): ContactMethod => {
        const v = record(value);
        const url = v['url'] === undefined ? undefined : text(v['url'], 4096);
        if (url && !/^(https?:\/\/|mailto:|tel:)/i.test(url))
          throw new Error('Invalid contact URL.');
        return {
          id: identifier(v['id']),
          type: choice(v['type'], ['whatsapp', 'phone', 'instagram', 'email', 'custom']),
          label: text(v['label'], 120),
          value: text(v['value'], 500),
          enabled: boolean(v['enabled']),
          ...(url === undefined ? {} : { url }),
        };
      },
      50,
    ),
  };
}
export function decodeProfile(data: unknown, displayName: string): CustomerProfile {
  const d = data === undefined ? {} : record(data);
  const billing = d['billing'] === undefined ? {} : record(d['billing']);
  const notifications = d['notifications'] === undefined ? {} : record(d['notifications']);
  return {
    displayName: text(d['displayName'] ?? displayName, 120),
    phone: text(d['phone'] ?? '', 40),
    billing: {
      fullName: text(billing['fullName'] ?? '', 120),
      company: text(billing['company'] ?? '', 120),
      taxId: text(billing['taxId'] ?? '', 60),
      addressLine1: text(billing['addressLine1'] ?? '', 200),
      addressLine2: text(billing['addressLine2'] ?? '', 200),
      city: text(billing['city'] ?? '', 100),
      region: text(billing['region'] ?? '', 100),
      postalCode: text(billing['postalCode'] ?? '', 30),
      country: text(billing['country'] ?? '', 100),
    },
    notifications: {
      orderUpdates: boolean(notifications['orderUpdates'] ?? true),
      emailOffers: boolean(notifications['emailOffers'] ?? false),
    },
  };
}
