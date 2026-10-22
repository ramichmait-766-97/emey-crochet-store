import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/app/core/utils/auth-navigation.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { loginDestination } = exports;

test('admin and client have separate default destinations', () => {
  assert.equal(loginDestination('admin', null), '/admin');
  assert.equal(loginDestination('user', null), '/account');
});
test('preserves a local shopping return URL for either role', () => {
  for (const role of ['admin', 'user'])
    assert.equal(loginDestination(role, '/cart?step=contact'), '/cart?step=contact');
});
test('a client requesting admin is returned to their own account', () => {
  for (const path of ['/admin', '/admin/', '/admin/products', '/admin;mode=edit']) {
    assert.equal(loginDestination('user', path), '/account');
    assert.equal(loginDestination('admin', path), path);
  }
});
test('rejects external redirects, backslashes, control characters and login loops', () => {
  for (const path of [
    'https://example.com',
    '//example.com',
    '/\\example.com',
    '/cart\n',
    '/login',
    '/login?returnUrl=/login',
  ]) {
    assert.equal(loginDestination('user', path), '/account');
    assert.equal(loginDestination('admin', path), '/admin');
  }
});
