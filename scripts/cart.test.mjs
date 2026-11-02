import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BehaviorSubject } from 'rxjs';
import ts from 'typescript';

function cartHarness() {
  const state$ = new BehaviorSubject({ loading: true });
  const stored = new Map();
  const signal = (value) => {
    const result = () => value;
    result.set = (next) => {
      value = next;
    };
    result.update = (fn) => {
      value = fn(value);
    };
    result.asReadonly = () => result;
    return result;
  };
  const angular = {
    Injectable: () => (target) => target,
    inject: () => ({ state$ }),
    signal,
    computed: (fn) => fn,
  };
  const module = { exports: {} };
  const source = readFileSync(
    new URL('../src/app/core/services/cart.service.ts', import.meta.url),
    'utf8',
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
    },
  }).outputText;
  new Function(
    'require',
    'module',
    'exports',
    'localStorage',
    'setTimeout',
    'clearTimeout',
    output,
  )(
    (name) => (name === '@angular/core' ? angular : { ProductService: class {} }),
    module,
    module.exports,
    {
      getItem: (key) => stored.get(key),
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key),
    },
    () => 0,
    () => {},
  );
  return { cart: new module.exports.CartService(), state$, stored };
}
const product = {
  id: 'P001',
  name: 'Test bag',
  active: true,
  price: 10,
  quantity: 4,
  imageData: 'legacy-bytes',
  imageUrl: 'data:legacy',
  variants: [
    { id: 'cream-s', color: 'Cream', size: 'S', price: 12, quantity: 1 },
    { id: 'rose-m', color: 'Rose', size: 'M', price: 15, quantity: 3 },
  ],
};
test('variant bag isolates selections, uses variant prices and prevents implicit/oversold options', () => {
  const { cart } = cartHarness();
  cart.add(product);
  assert.equal(cart.count(), 0);
  cart.add(product, 1, 'cream-s');
  cart.add(product, 1, 'rose-m');
  cart.add(product, 1, 'cream-s');
  assert.equal(cart.count(), 2);
  assert.equal(cart.subtotal(), 27);
  cart.setQuantity('P001', 2, 'rose-m');
  assert.equal(cart.subtotal(), 42);
  cart.remove('P001', 'cream-s');
  assert.equal(cart.count(), 2);
  assert.equal(cart.lines()[0].variantId, 'rose-m');
});
test('live variant stock reconciles specific lines and persistence excludes image bytes', () => {
  const { cart, state$, stored } = cartHarness();
  cart.add(product, 3, 'rose-m');
  assert.ok(!stored.get('emey-cart-v2').includes('legacy-bytes'));
  assert.ok(!stored.get('emey-cart-v2').includes('data:legacy'));
  const changed = {
    ...product,
    variants: product.variants.map((variant) => ({ ...variant, quantity: 1 })),
  };
  state$.next({ loading: false, products: [changed] });
  assert.equal(cart.lines()[0].quantity, 1);
  state$.next({ loading: false, products: [{ ...changed, variants: [] }] });
  assert.equal(cart.available(cart.lines()[0]), 0);
});
