import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import * as rxjs from 'rxjs';

// Exercise the real services and snapshot adapter with a controllable Firestore
// listener. This verifies visibility and live updates without production writes.
function catalogHarness() {
  let rows = Array.from({ length: 19 }, (_, index) => ({
    id: `P${String(index + 1).padStart(3, '0')}`,
    active: index < 14,
    name: `Database product ${index + 1}`,
  }));
  const listeners = new Set();
  const snapshot = (query) => ({
    docs: rows
      .filter((row) =>
        query.conditions.every((condition) => row[condition.field] === condition.value),
      )
      .map((row) => ({ id: row.id, data: () => ({ ...row }) })),
  });
  const firestore = {
    collection: (_db, path) => ({ path, conditions: [] }),
    where: (field, operator, value) => ({ field, operator, value }),
    query: (collection, ...conditions) => ({ ...collection, conditions }),
    onSnapshot: (query, next) => {
      const listener = { query, next };
      listeners.add(listener);
      next(snapshot(query));
      return () => listeners.delete(listener);
    },
  };
  const angular = {
    Injectable: () => (target) => target,
    inject: () => ({ firestore: {} }),
    signal: (initial) => {
      let current = initial;
      const signal = () => current;
      signal.set = (value) => {
        current = value;
      };
      return signal;
    },
  };
  function load(relative) {
    const source = readFileSync(new URL(`../src/app/${relative}`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
      },
    }).outputText;
    const module = { exports: {} };
    const require = (name) => {
      if (name === '@angular/core') return angular;
      if (name === 'firebase/firestore') return firestore;
      if (name === 'rxjs') return rxjs;
      if (name.endsWith('/firestore-streams')) return load('core/utils/firestore-streams.ts');
      if (name === './firebase.service') return { FirebaseService: class {} };
      if (name.endsWith('/product-image'))
        return { productImageSrc: (row) => `database:${row.id}` };
      if (name.endsWith('/store.constants')) return { PRODUCT_CATEGORIES: ['Apparel'] };
      throw new Error(`Unexpected service dependency: ${name}`);
    };
    new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
    return module.exports;
  }
  return {
    load,
    activate(id) {
      rows = rows.map((row) => (row.id === id ? { ...row, active: true } : row));
      for (const { query, next } of listeners) next(snapshot(query));
    },
    listenerCount: () => listeners.size,
  };
}

test('storefront listens to active database products and reflects activation without a rebuild', () => {
  const harness = catalogHarness();
  const { ProductService } = harness.load('core/services/product.service.ts');
  const service = new ProductService();
  let state;
  const subscription = service.state$.subscribe((value) => {
    state = value;
  });
  assert.equal(state.products.length, 14);
  assert.equal(
    state.products.some((product) => product.id === 'P015'),
    false,
  );
  harness.activate('P015');
  assert.equal(state.products.length, 15);
  assert.equal(state.products.at(-1).name, 'Database product 15');
  assert.equal(state.error, '');
  subscription.unsubscribe();
  assert.equal(harness.listenerCount(), 0);
});

test('admin reads every database product including the five hidden drafts', () => {
  const harness = catalogHarness();
  const { AdminStoreService } = harness.load('core/services/admin-store.service.ts');
  const service = new AdminStoreService();
  let products;
  const subscription = service.products$.subscribe((value) => {
    products = value;
  });
  assert.equal(products.length, 19);
  assert.equal(products.filter((product) => !product.active).length, 5);
  assert.equal(products.at(-1).imageUrl, 'database:P019');
  subscription.unsubscribe();
  assert.equal(harness.listenerCount(), 0);
});
