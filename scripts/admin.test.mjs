import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sourceLoader } from './load-typescript.mjs';

const { analyzeOrders } = sourceLoader()(
  fileURLToPath(new URL('../src/app/core/utils/admin-analytics.ts', import.meta.url)),
);
const now = new Date(2026, 10, 2, 12).getTime();
const order = (overrides = {}) => ({
  id: 'order',
  currency: 'USD',
  createdAt: now,
  totalCents: 2500,
  paidCents: 0,
  refundedCents: 0,
  fulfillmentStatus: 'requested',
  ...overrides,
});

test('overview separates order value from net payments, excludes cancellations from value and never mixes currencies', () => {
  const result = analyzeOrders(
    [
      order(),
      order({ fulfillmentStatus: 'delivered', paidCents: 2500 }),
      order({ fulfillmentStatus: 'cancelled', paidCents: 2500, refundedCents: 2500 }),
      order({ fulfillmentStatus: 'expired' }),
      order({ currency: 'EUR', totalCents: 999999 }),
      order({ createdAt: now - 100 * 86400000 }),
      order({ createdAt: now + 86400000 }),
    ],
    'USD',
    30,
    now,
  );
  assert.equal(result.count, 4);
  assert.equal(result.orderValueCents, 5000);
  assert.equal(result.netPaymentsCents, 2500);
  assert.equal(result.refundedCents, 2500);
  assert.equal(result.outstandingCents, 2500);
  assert.equal(result.awaitingCount, 1);
  assert.equal(result.averageCents, 2500);
  assert.equal(result.buckets.length, 30);
  assert.equal(result.buckets.at(-1).valueCents, 5000);
  const refunded = analyzeOrders(
    [order({ fulfillmentStatus: 'delivered', paidCents: 2500, refundedCents: 500 })],
    'USD',
    30,
    now,
  );
  assert.equal(refunded.netPaymentsCents, 2000);
  assert.equal(refunded.outstandingCents, 0);
  assert.equal(
    result.statuses.reduce((sum, item) => sum + item.count, 0),
    4,
  );
});

test('empty overview has finite zero metrics and buckets honor local calendar boundaries', () => {
  const result = analyzeOrders([], 'USD', 14, now);
  assert.equal(result.averageCents, 0);
  assert.equal(result.maxBucket, 1);
  const first = result.firstDate;
  const days = analyzeOrders(
    [order({ createdAt: first }), order({ createdAt: first - 1 })],
    'USD',
    14,
    now,
  );
  assert.equal(days.count, 1);
  assert.equal(days.buckets[0].count, 1);
});

test('product editor preserves drafts on close/cancel/failure and blocks duplicate saves', async () => {
  let release;
  let writes = 0;
  let fail = false;
  const service = {
    products: () => [],
    saveProduct: async () => {
      writes++;
      await new Promise((resolve) => {
        release = resolve;
      });
      if (fail) throw new Error('Inventory changed. Reload and retry.');
    },
  };
  const loader = sourceLoader({
    '@angular/core': {
      Component: () => (target) => target,
      ChangeDetectionStrategy: { OnPush: 0 },
      ChangeDetectorRef: class {},
      HostListener: () => () => {},
      ViewChild: () => () => {},
      inject: (token) => (token.name === 'AdminStoreService' ? service : { markForCheck() {} }),
    },
    '@angular/common': {},
    '@angular/router': {},
    '@angular/forms': {},
    rxjs: {},
    '../../core/services/admin-store.service': { AdminStoreService: class AdminStoreService {} },
    '../../core/services/site-settings.service': { SiteSettingsService: class {} },
    '../../shared/components/admin-nav.component': {},
    '../../shared/components/app-dialog.component': {},
    '../../shared/pipes/imagekit.pipe': {},
    '../../shared/directives/image-fallback.directive': {},
  });
  const { AdminComponent } = loader(
    fileURLToPath(new URL('../src/app/features/admin/admin.component.ts', import.meta.url)),
  );
  const editor = new AdminComponent();
  editor.openNew();
  assert.equal(editor.productDirty, false);
  Object.assign(editor.draft, {
    id: 'P001',
    name: 'Rose bag',
    description: 'Handmade',
    price: 20,
    quantity: 2,
  });
  editor.closeEditor();
  assert.equal(editor.discardPrompt, true);
  editor.decideDiscard(false);
  assert.equal(editor.showEditor, true);
  const leave = editor.canLeave();
  editor.decideDiscard(false);
  assert.equal(await leave, false);
  fail = true;
  const saving = editor.saveProduct();
  await editor.saveProduct();
  editor.closeEditor();
  assert.equal(editor.showEditor, true);
  assert.equal(editor.saving, true);
  assert.equal(writes, 1);
  release();
  await saving;
  assert.match(editor.error, /Inventory changed/);
  assert.equal(editor.draft.name, 'Rose bag');
  assert.equal(editor.showEditor, true);
  fail = false;
  const retry = editor.saveProduct();
  release();
  await retry;
  assert.equal(editor.showEditor, false);
  assert.equal(writes, 2);
});

test('overview pages sequentially, retries the same failed cursor and keeps retained data', async () => {
  const calls = [];
  const pending = [];
  const state = { destroyed: false };
  const signal = (value) =>
    Object.assign(() => value, {
      set: (next) => {
        value = next;
      },
    });
  const api = {
    call: async (_path, data) => {
      calls.push(data);
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
  };
  const loader = sourceLoader({
    '@angular/core': {
      Component: () => (target) => target,
      ChangeDetectionStrategy: { OnPush: 0 },
      signal,
      computed: (fn) => fn,
      inject: (token) => (token?.name === 'CommerceService' ? api : state),
    },
    '@angular/common': {},
    '@angular/router': {},
    '@angular/forms': {},
    '../../core/services/commerce.service': { CommerceService: class CommerceService {} },
    '../../shared/components/admin-nav.component': {},
  });
  const { AdminDashboardComponent } = loader(
    fileURLToPath(
      new URL('../src/app/features/admin-dashboard/admin-dashboard.component.ts', import.meta.url),
    ),
  );
  const dashboard = new AdminDashboardComponent();
  const first = order({ id: 'first' });
  const cursor = { createdAt: now, id: 'first' };
  pending.shift().resolve({ orders: [first], cursor });
  await new Promise((resolve) => setImmediate(resolve));
  const more = dashboard.load(true);
  await dashboard.load(true);
  assert.equal(calls.length, 2);
  pending.shift().reject(new Error('Offline'));
  await more;
  assert.equal(dashboard.orders().length, 1);
  assert.equal(dashboard.error(), 'Offline');
  dashboard.retry();
  assert.deepEqual(calls.at(-1).cursor, cursor);
  pending.shift().resolve({ orders: [first, order({ id: 'second' })], cursor: null });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dashboard.orders().length, 2);
  assert.equal(dashboard.hasMore(), false);
  const refresh = dashboard.load();
  assert.equal(calls.at(-1).cursor, null);
  state.destroyed = true;
  pending.shift().resolve({ orders: [], cursor: null });
  await refresh;
  assert.equal(dashboard.orders().length, 2);
});
