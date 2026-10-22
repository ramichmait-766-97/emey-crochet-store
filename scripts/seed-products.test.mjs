import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchProduct } from '../functions/scripts/seed-product-matching.mjs';

const product = { id: 'P014', slug: 'white-red-baby-set', name: 'White & Red Baby Dress Set' };
test('matches a fixed seed ID and a slug saved under an admin-created ID', () => {
  const seeded = { id: 'P014', data: { ...product, price: 99, quantity: 7 } };
  assert.equal(matchProduct(product, [seeded]), seeded);
  const admin = { id: 'CUSTOM-BABY', data: { slug: product.slug } };
  assert.equal(matchProduct(product, [admin]), admin);
});
test('matches normalized names when the slug has changed', () => {
  const admin = {
    id: 'CUSTOM',
    data: { name: 'White & Red Baby Dress Set ', slug: 'custom-baby' },
  };
  assert.equal(matchProduct(product, [admin]), admin);
});
test('refuses ambiguous matches and IDs belonging to another product', () => {
  assert.throws(
    () =>
      matchProduct(product, [
        { id: 'P014', data: { slug: product.slug } },
        { id: 'CUSTOM', data: { slug: product.slug } },
      ]),
    /Duplicate catalog identities/,
  );
  assert.throws(
    () => matchProduct(product, [{ id: 'P014', data: { slug: 'another-product' } }]),
    /refusing to overwrite/,
  );
});
test('missing product can be created and then resolves on subsequent runs', () => {
  assert.equal(matchProduct(product, []), undefined);
  const saved = { id: product.id, data: product };
  assert.equal(matchProduct(product, [saved]), saved);
});
