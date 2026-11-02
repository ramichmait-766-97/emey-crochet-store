import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import * as angular from '@angular/core';
import * as rxjs from 'rxjs';
import { sourceLoader } from './load-typescript.mjs';
const filters = {
  category: null,
  searchToken: null,
  sortField: 'title',
  sortDirection: 'asc',
  limit: 3,
};
const makeRows = (count = 14) =>
  Array.from({ length: count }, (_, i) => ({
    id: `P${String(i + 1).padStart(3, '0')}`,
    slug: `product-${i + 1}`,
    name: `Piece ${String(Math.floor(i / 2) + 1).padStart(2, '0')}`,
    price: Math.floor(i / 3) + 1,
    inventoryVersion: Math.floor(i / 2),
    quantity: 3,
    active: i % 5 !== 4,
    category: i % 2 ? 'Apparel' : 'Home Decor',
    description: 'Handmade',
    imageUrl: 'https://ik.imagekit.io/s5yr4ioi1/product.webp',
    gallery: [],
    colors: [],
    bestSeller: i % 3 === 0,
    newArrival: i % 2 === 0,
  }));
function harness(initial = makeRows()) {
  let rows = structuredClone(initial);
  const requests = [];
  const listeners = new Set();
  const destroyed = [];
  const gates = [];
  let fail = null;
  let pager;
  class FirebaseService {}
  class ImageUploadService {}
  const field = (row, key) => (key === '__name__' ? row.id : row[key]);
  const document = (row) => ({ id: row.id, data: () => structuredClone(row) });
  function snapshot(q) {
    const order = q.constraints.filter((c) => c.kind === 'order');
    const compare = (a, b) => {
      for (const c of order) {
        const av = field(a, c.field),
          bv = field(b, c.field);
        const diff = av < bv ? -1 : av > bv ? 1 : 0;
        if (diff) return c.direction === 'desc' ? -diff : diff;
      }
      return 0;
    };
    let result = rows
      .filter((row) =>
        q.constraints.every((c) => {
          if (c.kind === 'order') return field(row, c.field) !== undefined;
          if (c.kind !== 'where') return true;
          const value = field(row, c.field);
          return c.op === '=='
            ? value === c.value
            : c.op === 'in'
              ? c.value.includes(value)
              : c.op === '>='
                ? value >= c.value
                : c.op === '<='
                  ? value <= c.value
                  : false;
        }),
      )
      .sort(compare);
    const cursor = q.constraints.find((c) => c.kind === 'after');
    if (cursor) result = result.filter((row) => compare(row, cursor.doc.data()) > 0);
    const cap = q.constraints.find((c) => c.kind === 'limit');
    assert.ok(cap, 'Every product query must be bounded');
    result = result.slice(0, cap.value);
    return { docs: result.map(document) };
  }
  const firestore = {
    collection: (_db, path) => ({ path }),
    documentId: () => '__name__',
    where: (field, op, value) => ({ kind: 'where', field, op, value }),
    orderBy: (field, direction) => ({ kind: 'order', field, direction }),
    limit: (value) => ({ kind: 'limit', value }),
    startAfter: (doc) => ({ kind: 'after', doc }),
    query: (ref, ...constraints) => ({ ...ref, constraints }),
    getDocsFromServer: async (q) => {
      requests.push(q);
      if (fail) {
        const error = fail;
        fail = null;
        throw error;
      }
      const result = snapshot(q);
      const gate = gates.shift();
      if (gate) await gate.promise;
      return result;
    },
    onSnapshot: (q, next, error) => {
      requests.push(q);
      const listener = { q, next, error };
      listeners.add(listener);
      next(snapshot(q));
      return () => listeners.delete(listener);
    },
  };
  const overrides = {
    '@angular/core': {
      ...angular,
      inject: (token) =>
        token === angular.DestroyRef
          ? { onDestroy: (callback) => destroyed.push(callback) }
          : token === FirebaseService
            ? { firestore: {} }
            : token === ImageUploadService
              ? {}
              : pager,
    },
    'firebase/firestore': firestore,
    rxjs,
    './firebase.service': { FirebaseService },
    './image-upload.service': { ImageUploadService },
  };
  const load = sourceLoader(overrides);
  const { ProductService } = load(
    fileURLToPath(new URL('../src/app/core/services/product.service.ts', import.meta.url)),
  );
  pager = new ProductService();
  overrides['./product.service'] = { ProductService };
  return {
    pager,
    requests,
    listeners,
    load,
    gate() {
      let release;
      const promise = new Promise((resolve) => (release = resolve));
      gates.push({ promise });
      return release;
    },
    fail(error) {
      fail = error;
    },
    update(change) {
      rows = change(rows);
      for (const listener of [...listeners]) listener.next(snapshot(listener.q));
    },
    destroy() {
      for (const callback of destroyed) callback();
    },
  };
}
test('bounded pages traverse duplicate names/prices deterministically in both directions', async () => {
  for (const sortField of ['title', 'basePriceInCents', 'version'])
    for (const sortDirection of ['asc', 'desc']) {
      const h = harness();
      const f = { ...filters, sortField, sortDirection };
      await h.pager.fetchNextPage(f, true);
      assert.equal(h.pager.displayProducts().length, 3);
      assert.equal(h.pager.catalogPage().lastVisibleId, h.pager.displayProducts().at(-1).id);
      let guard = 0;
      while (h.pager.hasMorePages() && guard++ < 10) await h.pager.fetchNextPage(f, false);
      const ids = h.pager.displayProducts().map((p) => p.id);
      assert.equal(ids.length, 12);
      assert.equal(new Set(ids).size, 12);
      for (const q of h.requests) {
        assert.equal(q.constraints.find((c) => c.kind === 'limit').value, 4);
        const order = q.constraints.filter((c) => c.kind === 'order');
        assert.equal(order[1].field, '__name__');
        assert.equal(order[1].direction, sortDirection);
      }
      const values = h.pager
        .displayProducts()
        .map((p) =>
          sortField === 'title' ? p.name : sortField === 'version' ? p.inventoryVersion : p.price,
        );
      assert.deepEqual(
        values,
        [...values].sort(
          (a, b) => (a < b ? -1 : a > b ? 1 : 0) * (sortDirection === 'asc' ? 1 : -1),
        ),
      );
    }
});
test('changed filters reset even without reset=true, and stale/reset/destroy responses cannot overwrite state', async () => {
  const h = harness();
  const release = h.gate();
  const old = h.pager.fetchNextPage(filters, true);
  const current = { ...filters, category: 'Apparel' };
  await h.pager.fetchNextPage(current, false);
  const ids = h.pager.displayProducts().map((p) => p.id);
  release();
  await old;
  assert.deepEqual(
    h.pager.displayProducts().map((p) => p.id),
    ids,
  );
  assert.ok(h.pager.displayProducts().every((p) => p.category === 'Apparel'));
  const release2 = h.gate();
  const fresh = h.pager.fetchNextPage(filters, true);
  assert.equal(h.pager.displayProducts().length, 0);
  assert.equal(h.pager.catalogPage().lastVisibleId, null);
  assert.equal(h.pager.isLoading(), true);
  h.destroy();
  release2();
  await fresh;
  assert.equal(h.pager.displayProducts().length, 0);
});
test('overlapping load-more is ignored; failed append preserves rows and retries the same cursor', async () => {
  const h = harness();
  await h.pager.fetchNextPage(filters, true);
  const before = h.pager.catalogPage();
  const release = h.gate();
  const more = h.pager.fetchNextPage(filters, false);
  const count = h.requests.length;
  await h.pager.fetchNextPage(filters, false);
  assert.equal(h.requests.length, count);
  release();
  await more;
  const page = h.pager.catalogPage();
  h.fail(Object.assign(new Error('missing index'), { code: 'failed-precondition' }));
  await h.pager.fetchNextPage(filters, false);
  assert.deepEqual(h.pager.catalogPage(), page);
  assert.match(h.pager.error(), /temporarily unavailable/);
  assert.match(h.pager.notice(), /required catalog index/);
  await h.pager.fetchNextPage(filters, false);
  assert.ok(h.pager.displayProducts().length > page.products.length);
  assert.equal(h.pager.error(), '');
  assert.ok(before.products.length < page.products.length);
});
test('malformed rows are skipped and raw cursor advances, including fully rejected pages', async () => {
  const rows = makeRows(8).map((row) => ({ ...row, active: true }));
  rows[0].quantity = -1;
  rows[1].price = 'bad';
  rows[2].description = null;
  const h = harness(rows);
  await h.pager.fetchNextPage(filters, true);
  assert.equal(h.pager.displayProducts().length, 0);
  assert.equal(h.pager.rejectedProducts(), 3);
  assert.equal(h.pager.catalogPage().lastVisibleId, 'P003');
  assert.equal(h.pager.hasMorePages(), true);
  await h.pager.fetchNextPage(filters, false);
  assert.equal(h.pager.displayProducts().length, 3);
  assert.equal(h.pager.displayProducts()[0].id, 'P004');
});
test('prefix/category/collection predicates run on the server and reject unsupported filter shapes', async () => {
  const h = harness();
  await h.pager.fetchNextPage(
    { ...filters, searchToken: 'Piece 0', category: 'Home Decor', collection: 'new' },
    true,
  );
  const constraints = h.requests[0].constraints;
  assert.ok(constraints.some((c) => c.field === 'name' && c.op === '>='));
  assert.ok(constraints.some((c) => c.field === 'newArrival' && c.value === true));
  assert.ok(
    h.pager
      .displayProducts()
      .every((p) => p.category === 'Home Decor' && p.newArrival && p.name.startsWith('Piece 0')),
  );
  for (const bad of [
    { ...filters, limit: 1000 },
    { ...filters, limit: 0 },
    { ...filters, sortDirection: 'sideways' },
    { ...filters, category: 'invalid' },
    { ...filters, searchToken: 'Piece', sortField: 'basePriceInCents' },
  ]) {
    const count = h.requests.length;
    await h.pager.fetchNextPage(bad, true);
    assert.equal(h.requests.length, count);
    assert.equal(h.pager.displayProducts().length, 0);
    assert.ok(h.pager.error());
  }
});
test('cursor retains sort values when its document is deleted and duplicate IDs never append twice', async () => {
  const h = harness(makeRows(8).map((row) => ({ ...row, active: true })));
  await h.pager.fetchNextPage(filters, true);
  const last = h.pager.catalogPage().lastVisibleId;
  h.update((rows) =>
    rows
      .filter((row) => row.id !== last)
      .map((row) => (row.id === 'P001' ? { ...row, name: 'Piece 99' } : row)),
  );
  await h.pager.fetchNextPage(filters, false);
  assert.equal(h.pager.displayProducts().at(-1).id, 'P006');
  while (h.pager.hasMorePages()) await h.pager.fetchNextPage(filters, false);
  assert.equal(
    new Set(h.pager.displayProducts().map((product) => product.id)).size,
    h.pager.displayProducts().length,
  );
  await h.pager.fetchNextPage({ ...filters, limit: 12 }, true);
  assert.ok(!h.pager.displayProducts().some((product) => product.id === last));
});

test('legacy documents remain in name/price pages; version ordering explicitly warns about missing versions', async () => {
  const rows = makeRows(6).map((row) => ({ ...row, active: true }));
  delete rows[0].inventoryVersion;
  const h = harness(rows);
  await h.pager.fetchNextPage({ ...filters, limit: 12 }, true);
  assert.equal(h.pager.displayProducts().length, 6);
  await h.pager.fetchNextPage({ ...filters, limit: 12, sortField: 'version' }, true);
  assert.equal(h.pager.displayProducts().length, 5);
  assert.match(h.pager.notice(), /stored inventory version/);
});
test('bag ID and direct slug listeners are bounded, independent of browse filters, and release subscriptions', async () => {
  const h = harness(makeRows(30));
  await h.pager.fetchNextPage({ ...filters, category: 'Apparel' }, true);
  let bag;
  const subscription = h.pager.watchProducts(['P029', 'P001']).subscribe((p) => (bag = p));
  assert.deepEqual(
    bag.map((p) => p.id),
    ['P001', 'P029'],
  );
  assert.equal(h.listeners.size, 1);
  h.update((rows) => rows.map((row) => (row.id === 'P029' ? { ...row, active: false } : row)));
  assert.deepEqual(
    bag.map((p) => p.id),
    ['P001'],
  );
  subscription.unsubscribe();
  assert.equal(h.listeners.size, 0);
  let detail;
  const slug = h.pager.watchBySlug('product-29').subscribe((p) => (detail = p));
  assert.equal(detail, undefined);
  assert.equal(h.requests.at(-1).constraints.find((c) => c.kind === 'limit').value, 2);
  slug.unsubscribe();
  h.update((rows) => rows.map((row) => (row.id === 'P002' ? { ...row, slug: 'product-1' } : row)));
  let duplicateError;
  h.pager.watchBySlug('product-1').subscribe({
    error: (error) => {
      duplicateError = error;
    },
  });
  assert.match(duplicateError.message, /ambiguous/);
  assert.equal(h.listeners.size, 0);
  assert.throws(() => h.pager.watchProducts(Array.from({ length: 16 }, (_, i) => `P${i}`)));
  const count = h.requests.length;
  h.pager.watchProducts([]).subscribe();
  assert.equal(h.requests.length, count);
});
test('admin pages include inactive products, are bounded, and use the same pager', async () => {
  const h = harness(makeRows(60));
  const { AdminStoreService } = h.load(
    fileURLToPath(new URL('../src/app/core/services/admin-store.service.ts', import.meta.url)),
  );
  const admin = new AdminStoreService();
  await admin.loadProducts(true);
  assert.equal(admin.products().length, 25);
  assert.ok(admin.products().some((p) => !p.active));
  assert.equal(h.requests[0].constraints.find((c) => c.kind === 'limit').value, 26);
  assert.ok(!h.requests[0].constraints.some((c) => c.field === 'active'));
  await admin.loadProducts();
  assert.equal(admin.products().length, 50);
  assert.equal(h.listeners.size, 0);
});
test('every supported public sort/category/collection combination has an exact declared composite index', () => {
  const config = JSON.parse(
    readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'),
  );
  for (const category of [false, true])
    for (const collection of [null, 'newArrival', 'bestSeller'])
      for (const sort of ['price', 'name', 'inventoryVersion'])
        for (const direction of ['ASCENDING', 'DESCENDING']) {
          const fields = [
            { fieldPath: 'active', order: 'ASCENDING' },
            ...(category ? [{ fieldPath: 'category', order: 'ASCENDING' }] : []),
            ...(collection ? [{ fieldPath: collection, order: 'ASCENDING' }] : []),
            { fieldPath: sort, order: direction },
            { fieldPath: '__name__', order: direction },
          ];
          assert.ok(
            config.indexes.some(
              (i) =>
                i.collectionGroup === 'products' &&
                JSON.stringify(i.fields) === JSON.stringify(fields),
            ),
            JSON.stringify(fields),
          );
        }
  assert.equal(config.indexes.filter((i) => i.collectionGroup === 'orders').length, 3);
  assert.equal(config.fieldOverrides.length, 6);
});
