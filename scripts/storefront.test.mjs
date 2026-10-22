import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
function load(file) {
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (name) => load(resolve(dirname(file), name + '.ts')),
    module,
    module.exports,
  );
  return module.exports;
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { filterCatalog, parseCatalogFilters } = load(resolve(root, 'src/app/core/utils/catalog.ts'));
const { TEST_PRODUCTS } = load(resolve(root, 'scripts/fixtures/catalog-products.ts'));
const { prepareOrderRequest } = load(resolve(root, 'src/app/core/utils/order-request.ts'));
const parse = (params) => parseCatalogFilters(new URLSearchParams(params));
test('all home collection links return the matching fixture products', () => {
  for (const [category, count] of [
    ['Apparel', 7],
    ['Bags & Accessories', 3],
    ['Home Decor', 3],
    ['Keychains', 1],
  ]) {
    assert.equal(filterCatalog(TEST_PRODUCTS, parse({ category })).length, count);
  }
  assert.equal(filterCatalog(TEST_PRODUCTS, parse({})).length, 14);
});
test('search, filters and sorting compose without mutating source', () => {
  const original = TEST_PRODUCTS.map((p) => p.id);
  const results = filterCatalog(
    TEST_PRODUCTS,
    parse({ category: 'Bags & Accessories', q: 'cream', sort: 'price-asc' }),
  );
  assert.ok(results.length > 0);
  assert.ok(results.every((p) => p.category === 'Bags & Accessories'));
  const sorted = filterCatalog(TEST_PRODUCTS, parse({ sort: 'price-asc' }));
  assert.ok(sorted.every((p, i) => i === 0 || p.price >= sorted[i - 1].price));
  assert.deepEqual(
    TEST_PRODUCTS.map((p) => p.id),
    original,
  );
  assert.equal(filterCatalog(TEST_PRODUCTS, parse({ q: 'no such product zzz' })).length, 0);
});
test('invalid filter values recover to usable defaults', () => {
  assert.deepEqual(parse({ category: 'bad', sort: 'bad' }), {
    category: '',
    collection: '',
    search: '',
    sort: 'featured',
  });
  assert.equal(parse({ category: 'home decor' }).category, 'Home Decor');
});
const contact = {
  fullName: 'Test Customer',
  phone: '+15555550111',
  email: '',
  address: '',
  notes: '',
};
const site = {
  storeName: 'Emey',
  currency: 'USD',
  memberDiscountPercent: 10,
  contacts: [{ type: 'whatsapp', label: 'WhatsApp', value: '+15555550123', enabled: true }],
};
const lines = [{ product: { ...TEST_PRODUCTS[0], price: 12.35 }, quantity: 3 }];
test('request estimate applies rounded member discount and includes each item', () => {
  const result = prepareOrderRequest(lines, contact, site, true);
  assert.equal(result.subtotal, 37.05);
  assert.equal(result.discount, 3.71);
  assert.equal(result.total, 33.34);
  const text = new URL(result.whatsappUrl).searchParams.get('text');
  assert.match(text, /3 ×/);
  assert.match(text, /Please confirm availability/);
  assert.equal(result.orderId, undefined);
  assert.equal(prepareOrderRequest(lines, contact, site, false).total, 37.05);
});
test('does not prepare requests for disabled, missing or placeholder WhatsApp contacts', () => {
  for (const contacts of [
    [],
    [{ ...site.contacts[0], enabled: false }],
    [{ ...site.contacts[0], value: '+96100000000' }],
  ]) {
    assert.throws(
      () => prepareOrderRequest(lines, contact, { ...site, contacts }, false),
      /not available yet/,
    );
  }
});

test('new arrivals and bestseller shortcuts select matching products', () => {
  for (const collection of ['new', 'bestsellers']) {
    const items = filterCatalog(TEST_PRODUCTS, parse({ collection }));
    assert.ok(items.length > 0);
    assert.ok(items.every((p) => (collection === 'new' ? p.newArrival : p.bestSeller)));
  }
});
