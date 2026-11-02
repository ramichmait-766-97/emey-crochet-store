import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import '@angular/compiler';
import * as angular from '@angular/core';
import * as interop from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { BehaviorSubject, filter, map, of } from 'rxjs';
import * as rxjs from 'rxjs';
import { sourceLoader } from './load-typescript.mjs';

class AuthService {}
class ProductService {}
const load = sourceLoader({
  '@angular/core': angular,
  '@angular/core/rxjs-interop': interop,
  rxjs,
  './auth.service': { AuthService },
  './product.service': { ProductService },
});
const { CartService } = load(
  fileURLToPath(new URL('../src/app/core/services/cart.service.ts', import.meta.url)),
);
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterEach(() => {
  TestBed.resetTestingModule();
  delete globalThis.localStorage;
});

function cartHarness(initialStorage = [], user) {
  const state$ = new BehaviorSubject({ loading: true, error: '', products: [] });
  const currentUser = angular.signal(arguments.length < 2 ? null : user);
  const stored = new Map(initialStorage);
  let blocked = false;
  globalThis.localStorage = {
    getItem: (key) => {
      if (blocked) throw new Error('blocked');
      return stored.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (blocked) throw new Error('quota');
      stored.set(key, value);
    },
    removeItem: (key) => stored.delete(key),
  };
  TestBed.configureTestingModule({
    providers: [
      angular.provideZonelessChangeDetection(),
      { provide: angular.CSP_NONCE, useValue: null },
      { provide: DOCUMENT, useValue: {} },
      { provide: AuthService, useValue: { currentUser } },
      {
        provide: ProductService,
        useValue: {
          watchProducts: (ids) =>
            ids.length
              ? state$.pipe(
                  filter((state) => !state.loading && !state.error),
                  map((state) => state.products.filter((product) => ids.includes(product.id))),
                )
              : of([]),
        },
      },
    ],
  });
  const cart = TestBed.runInInjectionContext(() => new CartService());
  const flush = () => TestBed.flushEffects();
  flush();
  return {
    cart,
    state$,
    currentUser,
    stored,
    flush,
    block: () => {
      blocked = true;
    },
  };
}
const product = {
  id: 'P001',
  slug: 'test-bag',
  name: 'Test bag',
  category: 'Bags & Accessories',
  description: 'Bag',
  active: true,
  price: 10,
  quantity: 40,
  imageData: 'legacy-bytes',
  gallery: [],
  colors: [],
  bestSeller: false,
  newArrival: false,
  imageUrl: 'https://ik.imagekit.io/s5yr4ioi1/bag.webp',
  variants: [
    { id: 'cream-s', color: 'Cream', size: 'S', price: 12, quantity: 1 },
    { id: 'rose-m', color: 'Rose', size: 'M', price: 15, quantity: 30 },
  ],
};
test('variant bag has synchronous projections and caps each selection at ten or available stock', () => {
  const { cart, flush, stored } = cartHarness();
  cart.add(product);
  assert.equal(cart.totalItemsCount(), 0);
  cart.add(product, 1, 'cream-s');
  cart.add(product, 50, 'rose-m');
  cart.add(product, 1, 'cream-s');
  assert.equal(cart.totalItemsCount(), 11);
  assert.equal(cart.estimatedSubtotalCents(), 16200);
  cart.setQuantity('P001', 2, 'rose-m');
  assert.equal(cart.estimatedSubtotalCents(), 4200);
  cart.setQuantity('P001', NaN, 'rose-m');
  assert.equal(cart.items()[1].quantity, 2);
  cart.setQuantity('P001', 50, 'rose-m');
  assert.equal(cart.items()[1].quantity, 10);
  cart.remove('P001', 'cream-s');
  assert.equal(cart.totalItemsCount(), 10);
  flush();
  const saved = stored.get('emey-cart-v3:guest');
  assert.ok(!saved.includes('legacy-bytes'));
  assert.ok(!saved.includes('imageUrl'));
  assert.ok(!saved.includes('product"'));
  assert.deepEqual(JSON.parse(saved)[0], {
    productId: 'P001',
    variantId: 'rose-m',
    quantity: 10,
    snapshotPriceInCents: 1500,
  });
});
test('live stock and prices reconcile synchronously and persist; vanished variants remain visibly unavailable', () => {
  const { cart, state$, flush, stored } = cartHarness();
  cart.add(product, 3, 'rose-m');
  flush();
  const changed = {
    ...product,
    variants: product.variants.map((v) => ({ ...v, quantity: 1, price: 20 })),
  };
  state$.next({ loading: false, error: '', products: [changed] });
  assert.equal(cart.lines()[0].quantity, 1);
  assert.equal(cart.estimatedSubtotalCents(), 2000);
  flush();
  assert.equal(JSON.parse(stored.get('emey-cart-v3:guest'))[0].snapshotPriceInCents, 2000);
  state$.next({ loading: false, error: '', products: [{ ...changed, variants: [] }] });
  assert.equal(cart.available(cart.lines()[0]), 0);
  state$.next({ loading: false, error: '', products: [] });
  assert.equal(cart.lines()[0].product.active, false);
});
test('guest migration removes snapshots/bytes, caps quantities, and reloads only validated identifiers', () => {
  const { cart, stored, flush } = cartHarness([
    ['emey-cart-v2', JSON.stringify([{ product, quantity: 25, variantId: 'rose-m' }])],
  ]);
  assert.equal(cart.items()[0].quantity, 10);
  assert.equal(cart.items()[0].snapshotPriceInCents, 1500);
  flush();
  assert.equal(stored.has('emey-cart-v2'), false);
  assert.ok(!stored.get('emey-cart-v3:guest').includes('legacy-bytes'));
});
test('authentication isolates accounts without leaking a bag or overwriting another scope', () => {
  const { cart, currentUser, stored, flush } = cartHarness();
  cart.add(product, 2, 'rose-m'); // switch before persistence flush
  currentUser.set({ uid: 'alice' });
  assert.equal(cart.lines().length, 0);
  flush();
  assert.equal(cart.items().length, 0);
  cart.add(product, 1, 'cream-s');
  currentUser.set({ uid: 'bob' });
  flush();
  assert.equal(cart.items().length, 0);
  cart.add(product, 3, 'rose-m');
  flush();
  currentUser.set({ uid: 'alice' });
  flush();
  assert.equal(cart.items()[0].variantId, 'cream-s');
  currentUser.set(null);
  flush();
  assert.equal(cart.items()[0].quantity, 2);
  assert.equal(JSON.parse(stored.get('emey-cart-v3:user-bob'))[0].quantity, 3);
});
test('pending auth does not erase storage and blocked persistence preserves in-memory operations', () => {
  const { cart, currentUser, stored, flush, block } = cartHarness(
    [
      [
        'emey-cart-v3:guest',
        JSON.stringify([
          { productId: 'P001', variantId: 'rose-m', quantity: 2, snapshotPriceInCents: 1500 },
        ]),
      ],
    ],
    undefined,
  );
  const before = stored.get('emey-cart-v3:guest');
  assert.equal(cart.lines().length, 0);
  assert.equal(stored.get('emey-cart-v3:guest'), before);
  currentUser.set(null);
  flush();
  block();
  cart.add(product, 1, 'rose-m');
  flush();
  assert.equal(cart.totalItemsCount(), 3);
  assert.ok(cart.storageError());
});
test('corrupt stored quantities and duplicate lines fail closed, and destroyed service releases catalog listener', () => {
  const { cart, state$, flush } = cartHarness([
    [
      'emey-cart-v3:guest',
      JSON.stringify([
        { productId: 'P001', variantId: null, quantity: -1, snapshotPriceInCents: 1000 },
      ]),
    ],
  ]);
  assert.equal(cart.items().length, 0);
  assert.ok(cart.storageError());
  cart.add(product, 1, 'rose-m');
  flush();
  assert.equal(state$.observers.length, 1);
  TestBed.resetTestingModule();
  assert.equal(state$.observers.length, 0);
});
