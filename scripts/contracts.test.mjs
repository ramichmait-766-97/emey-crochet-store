import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sourceLoader } from './load-typescript.mjs';
const load = sourceLoader();
const c = load(fileURLToPath(new URL('../src/app/types/commerce.contracts.ts', import.meta.url)));
const url = 'https://ik.imagekit.io/s5yr4ioi1/bag.webp';
const product = {
  id: 'P001',
  slug: 'bag',
  title: 'Bag',
  active: true,
  basePriceInCents: 1200,
  media: [{ url, path: '/s5yr4ioi1/bag.webp' }],
  variants: [{ id: 'rose', color: 'Rose', size: 'M', stock: 2, priceInCents: 1500 }],
  version: 1,
};
test('product guardian validates nested money, stock, identity, media host and immutability', () => {
  const valid = c.assertValidProduct(product);
  assert.equal(valid.variants[0].priceInCents, 1500);
  assert.throws(() => {
    valid.variants.push(product.variants[0]);
  });
  for (const bad of [
    null,
    [],
    {},
    { ...product, active: 'true' },
    { ...product, id: '../orders' },
    { ...product, basePriceInCents: NaN },
    { ...product, basePriceInCents: 1.5 },
    { ...product, version: -1 },
    { ...product, media: [{ url: 'https://evil.test/image', path: '/image' }] },
    { ...product, variants: [{ ...product.variants[0], stock: -1 }] },
    { ...product, variants: [product.variants[0], product.variants[0]] },
  ])
    assert.throws(() => c.assertValidProduct(bad));
});
test('Firestore adapter preserves legacy schema without unchecked coercion or requiring migration', () => {
  const raw = {
    id: 'P001',
    slug: 'bag',
    name: 'Bag',
    active: true,
    price: 12,
    quantity: 2,
    imageUrl: url,
    category: 'Bags & Accessories',
    description: 'A bag',
    bestSeller: false,
    newArrival: true,
  };
  const decoded = c.decodeProduct(raw);
  assert.equal(decoded.price, 12);
  assert.equal(decoded.inventoryVersion, 0);
  assert.deepEqual(decoded.variants, []);
  assert.equal(c.toProductDocument(decoded).basePriceInCents, 1200);
  assert.throws(() => c.decodeProduct({ ...raw, price: '12' }));
  assert.throws(() => c.decodeProduct({ ...raw, quantity: Infinity }));
  assert.throws(() => c.decodeProduct({ ...raw, gallery: ['javascript:alert(1)'] }));
});
const quote = {
  lines: [
    {
      productId: 'P001',
      variantId: '',
      quantity: 2,
      name: 'Bag',
      option: '',
      unitPriceCents: 1200,
      lineTotalCents: 2400,
    },
  ],
  subtotalCents: 2400,
  discountCents: 240,
  deliveryCents: 300,
  totalCents: 2460,
  currency: 'USD',
  delivery: { id: 'local', label: 'Local', estimate: 'Tomorrow' },
  payment: { id: 'cod', label: 'Cash', instructions: 'Pay on arrival' },
  quoteFingerprint: 'a'.repeat(64),
  reservationMinutes: 1440,
};
const order = {
  ...quote,
  id: 'b'.repeat(32),
  createdAt: 1,
  updatedAt: 2,
  version: 1,
  fulfillmentStatus: 'requested',
  paymentStatus: 'unpaid',
  paidCents: 0,
  refundedCents: 0,
  reservationState: 'held',
  reservationExpiresAt: 100,
};
test('quote/order boundaries reject incorrect amounts/statuses and accept the real public-order shape', () => {
  assert.equal(c.decodeQuote(quote).totalCents, 2460);
  const { quoteFingerprint, reservationMinutes, ...publicOrder } = order;
  assert.equal(c.decodeOrderResponse({ order: publicOrder }).order.id, order.id);
  assert.equal(c.decodeOrderPage({ orders: [publicOrder], cursor: null }).orders.length, 1);
  assert.throws(() => c.decodeQuote({ ...quote, totalCents: 1 }));
  assert.throws(() => c.decodeOrder({ ...order, fulfillmentStatus: 'PAID' }));
  assert.throws(() => c.decodeOrder({ ...order, refundedCents: 10 }));
  assert.throws(() => c.decodeOrderPage({ orders: [order], cursor: {} }));
  assert.throws(() => c.decodeCheckoutResponse({ order, whatsappUrl: 'javascript:alert(1)' }));
});
test('cart and recovery guardians reject duplicates, excess quantities, malformed keys and untyped contact', () => {
  const line = { productId: 'P001', variantId: null, quantity: 1, snapshotPriceInCents: 1200 };
  assert.throws(() => c.decodeCartItems([line, line]));
  for (const quantity of [0, -1, 11, '2', 1.5, NaN])
    assert.throws(() => c.decodeCartItems([{ ...line, quantity }]));
  assert.throws(() => c.decodePendingCheckout({ checkoutKey: 'secret', contact: {}, lines: [] }));
  assert.throws(() =>
    c.decodePendingCheckout({
      checkoutKey: 'a'.repeat(64),
      contact: { fullName: {}, phone: '' },
      lines: [line],
    }),
  );
});
test('settings and profile boundaries reject malformed nested fields and preserve missing-field defaults', () => {
  assert.equal(c.decodeProfile(undefined, 'Customer').displayName, 'Customer');
  assert.throws(() => c.decodeProfile({ billing: { city: [] } }, 'Customer'));
  assert.throws(() => c.decodeProfile({ notifications: { emailOffers: 'yes' } }, 'Customer'));
  assert.throws(() =>
    c.decodeSiteSettings({
      storeName: 'Emey',
      currency: 'USD',
      memberDiscountPercent: 200,
      contacts: [],
    }),
  );
  const settings = {
    enabled: false,
    currency: 'USD',
    reservationMinutes: 1440,
    freeShippingThresholdCents: null,
    zones: [],
    pickup: { enabled: false, details: '' },
    paymentMethods: [],
    version: 1,
  };
  assert.equal(c.decodeCheckoutSettings(settings).enabled, false);
  assert.throws(() =>
    c.decodeCheckoutSettings({ ...settings, pickup: { enabled: 'false', details: '' } }),
  );
});

test('commerce service decodes actual responses and settings before exposing them', async () => {
  const firebase = { auth: { authStateReady: async () => {}, currentUser: null }, firestore: {} };
  let payload = { broken: true };
  const serviceLoader = sourceLoader({
    '@angular/core': { Injectable: () => (target) => target, inject: () => firebase },
    'firebase/firestore': {
      doc: () => ({}),
      getDocFromServer: async () => ({ exists: () => true, data: () => payload }),
    },
    './firebase.service': { FirebaseService: class {} },
    '../../../environments/environment': {
      environment: { commerce: { apiUrl: 'https://commerce.test' } },
    },
  });
  const { CommerceService } = serviceLoader(
    fileURLToPath(new URL('../src/app/core/services/commerce.service.ts', import.meta.url)),
  );
  const service = new CommerceService();
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = options;
    return { ok: true, json: async () => payload };
  };
  try {
    await assert.rejects(service.call('/quote', {}, c.decodeQuote));
    await assert.rejects(service.settings());
    payload = quote;
    assert.equal((await service.call('/quote', {}, c.decodeQuote)).totalCents, 2460);
    await service.call('/checkout', { checkoutKey: 'session' }, c.decodeQuote, 'fresh-token');
    assert.equal(sent.headers['X-Turnstile-Token'], 'fresh-token');
    assert.equal(JSON.parse(sent.body).challenge, undefined);
    assert.equal(sent.cache, 'no-store');
    await service.call('/quote', {}, c.decodeQuote, 'fresh-token');
    assert.equal(sent.headers['X-Turnstile-Token'], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('checkout completion cannot clear a different account cart or an unscoped legacy recovery', () => {
  class AuthService {}
  class CartService {}
  class CommerceService {}
  class ProfileService {}
  class SiteSettingsService {}
  class ChangeDetectorRef {}
  let user = null;
  let clears = 0;
  const auth = { currentUser: () => user };
  const cart = {
    clear: () => {
      clears++;
    },
  };
  const apis = new Map([
    [AuthService, auth],
    [CartService, cart],
    [CommerceService, { configured: false }],
    [ProfileService, {}],
    [SiteSettingsService, {}],
    [ChangeDetectorRef, { markForCheck() {} }],
  ]);
  const loader = sourceLoader({
    '@angular/core': {
      Component: () => (target) => target,
      ChangeDetectionStrategy: { OnPush: 0 },
      ChangeDetectorRef,
      inject: (token) => apis.get(token),
    },
    '@angular/common': {},
    '@angular/forms': {},
    '@angular/router': {},
    rxjs: {},
    '../../core/services/auth.service': { AuthService },
    '../../core/services/cart.service': { CartService },
    '../../core/services/commerce.service': { CommerceService },
    '../../core/services/profile.service': { ProfileService },
    '../../core/services/site-settings.service': { SiteSettingsService },
    '../../shared/pipes/product-image.pipe': {},
    '../../shared/pipes/imagekit.pipe': {},
    '../../shared/directives/image-fallback.directive': {},
    '../../shared/components/checkout-challenge.component': {},
  });
  const originalLocation = globalThis.location;
  const originalSessionStorage = globalThis.sessionStorage;
  globalThis.location = { origin: 'https://store.test' };
  globalThis.sessionStorage = { removeItem() {} };
  try {
    const { CartComponent } = loader(
      fileURLToPath(new URL('../src/app/features/cart/cart.component.ts', import.meta.url)),
    );
    const component = new CartComponent();
    component.request = { checkoutKey: 'a'.repeat(64), cartOwner: null };
    component.finish(order, '');
    assert.equal(clears, 1);
    component.request.cartOwner = 'alice';
    user = { uid: 'bob' };
    component.finish(order, '');
    assert.equal(clears, 1);
    delete component.request.cartOwner;
    component.finish(order, '');
    assert.equal(clears, 1);
    component.request.cartOwner = 'bob';
    component.finish(order, '');
    assert.equal(clears, 2);
    component.finish({ ...order, fulfillmentStatus: 'expired' }, '');
    assert.equal(clears, 2);
  } finally {
    globalThis.location = originalLocation;
    globalThis.sessionStorage = originalSessionStorage;
  }
});
