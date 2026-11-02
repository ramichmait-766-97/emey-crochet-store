import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkoutInput,
  DEFAULT_CHECKOUT,
  priceOrder,
  transition,
  validateSettings,
} from './commerce-domain.mjs';
import { createCommerceHandler, hash, identity, ledger } from './commerce.mjs';
import { createLocalJWKSet, exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { decode, encode, firestore } from './firestore-rest.mjs';

const settings = {
  ...structuredClone(DEFAULT_CHECKOUT),
  enabled: true,
  zones: [{ id: 'local', label: 'Test zone', feeCents: 300, estimate: 'Two days', enabled: true }],
  paymentMethods: [{ id: 'cod', label: 'Cash', instructions: 'Pay on delivery.', enabled: true }],
};
const site = {
  currency: 'USD',
  memberDiscountPercent: 10,
  contacts: [{ enabled: true, type: 'whatsapp', value: '+15555550123' }],
};
const product = { id: 'P001', name: 'Test piece', price: 12.35, quantity: 3, active: true };
const request = (key = 'a') => ({
  checkoutKey: key.repeat(64),
  contact: {
    fullName: 'Test Customer',
    phone: '+15555550111',
    email: '',
    address: 'Test street',
    building: 'Building 1',
    notes: '',
  },
  deliveryId: 'local',
  paymentId: 'cod',
  lines: [{ productId: 'P001', quantity: 1 }],
});
function memory(initial = {}) {
  const data = new Map(
    Object.entries({
      'store_settings/checkout': structuredClone(settings),
      'siteSettings/public': structuredClone(site),
      'products/P001': structuredClone(product),
      ...initial,
    }),
  );
  let revision = 0;
  const getMany = async (paths) => paths.map((path) => structuredClone(data.get(path) || null));
  return {
    data,
    getMany,
    async query(collection, { filters = [], cursor, limit = 25 } = {}) {
      return [...data]
        .filter(([path]) => path.split('/').length === 2 && path.startsWith(collection + '/'))
        .map(([, value]) => structuredClone(value))
        .filter((row) =>
          filters.every(([field, op, value]) =>
            op === 'EQUAL' ? row[field] === value : row[field] <= value,
          ),
        )
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .filter(
          (row) =>
            !cursor ||
            row.createdAt < cursor.createdAt ||
            (row.createdAt === cursor.createdAt && row.id < cursor.id),
        )
        .slice(0, limit);
    },
    async transaction(action) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const before = revision;
        const writes = [];
        const result = await action({
          getMany,
          set: (path, value) => writes.push([path, structuredClone(value)]),
          patch: (path, value) =>
            writes.push([path, { ...structuredClone(data.get(path)), ...structuredClone(value) }]),
        });
        if (before !== revision) continue;
        if (writes.length) {
          for (const [path, value] of writes) data.set(path, value);
          revision++;
        }
        return result;
      }
      throw new Error('Transaction contention.');
    },
  };
}
async function placed(db, input = request(), user = null, clock = () => 1000) {
  const service = ledger(db, clock);
  const quote = await service.quote(input, user);
  return service.create({ ...input, quoteFingerprint: quote.quoteFingerprint }, user);
}
test('draft defaults cannot open checkout and validation rejects malformed money/options', () => {
  assert.equal(DEFAULT_CHECKOUT.enabled, false);
  assert.ok(DEFAULT_CHECKOUT.zones.every((zone) => !zone.enabled));
  assert.throws(() => validateSettings({ ...DEFAULT_CHECKOUT, enabled: true }), /Enable/);
  assert.throws(() => validateSettings({ ...settings, reservationMinutes: 0 }), /duration/);
  assert.throws(
    () => validateSettings({ ...settings, zones: [settings.zones[0], settings.zones[0]] }),
    /unique/,
  );
  assert.throws(
    () => validateSettings({ ...settings, zones: [{ ...settings.zones[0], feeCents: 3.5 }] }),
    /cents/,
  );
});
test('authoritative cent totals include delivery, verified discount and post-discount free-shipping threshold', () => {
  const input = checkoutInput({
    ...request(),
    lines: [{ productId: 'P001', quantity: 3 }],
    price: 0,
    discount: 999,
  });
  const catalog = new Map([['P001', product]]);
  const member = priceOrder(input, settings, site, catalog, true);
  assert.equal(member.subtotalCents, 3705);
  assert.equal(member.discountCents, 371);
  assert.equal(member.totalCents, 3634);
  assert.equal(
    priceOrder(input, { ...settings, freeShippingThresholdCents: 3500 }, site, catalog, true)
      .deliveryCents,
    300,
  );
  assert.equal(
    priceOrder(input, { ...settings, freeShippingThresholdCents: 3300 }, site, catalog, true)
      .deliveryCents,
    0,
  );
  assert.equal(priceOrder(input, settings, site, catalog, false).totalCents, 4005);
  assert.throws(
    () => priceOrder(input, settings, { ...site, currency: 'EUR' }, catalog, false),
    /currency/,
  );
});
test('delivery addresses required; pickup is free and still requires contact/payment', () => {
  assert.throws(
    () => checkoutInput({ ...request(), contact: { ...request().contact, building: '' } }),
    /building/,
  );
  const input = checkoutInput({
    ...request(),
    deliveryId: 'pickup',
    contact: { ...request().contact, address: '', building: '' },
  });
  assert.equal(
    priceOrder(
      input,
      { ...settings, pickup: { enabled: true, details: 'Test pickup' } },
      site,
      new Map([['P001', product]]),
      false,
    ).deliveryCents,
    0,
  );
});
test('duplicates aggregate and specific variant stock/price is enforced', () => {
  const input = checkoutInput({
    ...request(),
    lines: [
      { productId: 'P001', quantity: 2 },
      { productId: 'P001', quantity: 2 },
    ],
  });
  assert.equal(input.lines[0].quantity, 4);
  assert.throws(
    () => priceOrder(input, settings, site, new Map([['P001', product]]), false),
    /stock/,
  );
  const variants = {
    ...product,
    variants: [{ id: 'cream-s', color: 'Cream', size: 'S', price: 20, quantity: 1 }],
  };
  assert.throws(
    () =>
      priceOrder(checkoutInput(request()), settings, site, new Map([['P001', variants]]), false),
    /option/,
  );
  const selected = checkoutInput({
    ...request(),
    lines: [{ productId: 'P001', variantId: 'cream-s', quantity: 1 }],
  });
  assert.equal(
    priceOrder(selected, settings, site, new Map([['P001', variants]]), false).totalCents,
    2300,
  );
});
test('atomic reservation, idempotent retry and rejected changed payload', async () => {
  const db = memory();
  const input = request();
  const service = ledger(db, () => 1000);
  const quote = await service.quote(input, null);
  const payload = { ...input, quoteFingerprint: quote.quoteFingerprint };
  const results = await Promise.all([service.create(payload, null), service.create(payload, null)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(db.data.get('products/P001').quantity, 2);
  assert.equal(db.data.get('products/P001').reservedUnits, 1);
  assert.equal(db.data.get('orders/' + results[0].id).paymentStatus, 'unpaid');
  await assert.rejects(
    service.create({ ...payload, contact: { ...payload.contact, fullName: 'Changed' } }, null),
    /already has an order/,
  );
});
test('two simultaneous buyers cannot reserve the final unit twice', async () => {
  const db = memory({ 'products/P001': { ...product, quantity: 1 } });
  const service = ledger(db, () => 1000);
  const [a, b] = await Promise.all([
    service.quote(request('a'), null),
    service.quote(request('b'), null),
  ]);
  const results = await Promise.allSettled([
    service.create({ ...request('a'), quoteFingerprint: a.quoteFingerprint }, null),
    service.create({ ...request('b'), quoteFingerprint: b.quoteFingerprint }, null),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(db.data.get('products/P001').quantity, 0);
});
test('price/settings changes invalidate reviewed total without inventory mutation', async () => {
  const db = memory();
  const service = ledger(db);
  const quote = await service.quote(request(), null);
  db.data.set('products/P001', { ...product, price: 99 });
  await assert.rejects(
    service.create({ ...request(), quoteFingerprint: quote.quoteFingerprint }, null),
    /changed/,
  );
  assert.equal(db.data.get('products/P001').quantity, 3);
});
test('expiry returns stock exactly once; stale confirmation does not record payment', async () => {
  const db = memory();
  let now = 1000;
  const service = ledger(db, () => now);
  const order = await placed(db);
  now = order.reservationExpiresAt + 1;
  const expired = await service.update(
    order.id,
    {
      version: 1,
      fulfillmentStatus: 'confirmed',
      paidCents: order.totalCents,
      refundedCents: 0,
      note: 'Test payment',
    },
    'admin',
  );
  assert.equal(expired.fulfillmentStatus, 'expired');
  assert.equal(expired.paidCents, 0);
  await service.update(order.id, {}, 'system', true);
  assert.equal(db.data.get('products/P001').quantity, 3);
  assert.equal(db.data.get('products/P001').reservedUnits, 0);
});
test('deposit commits reservation; cancellation and repeated cancellation restore once', async () => {
  const db = memory();
  let now = 1000;
  const service = ledger(db, () => now);
  const order = await placed(db);
  const deposited = await service.update(
    order.id,
    {
      version: 1,
      fulfillmentStatus: 'awaiting_confirmation',
      paidCents: 100,
      refundedCents: 0,
      note: 'Verified deposit',
    },
    'admin',
  );
  assert.equal(deposited.paymentStatus, 'deposit_paid');
  now = order.reservationExpiresAt + 1;
  assert.equal((await service.update(order.id, {}, 'system', true)).reservationState, 'committed');
  const cancelled = await service.update(
    order.id,
    {
      version: deposited.version,
      fulfillmentStatus: 'cancelled',
      paidCents: 100,
      refundedCents: 0,
      note: 'Customer cancelled, refund pending',
    },
    'admin',
  );
  await service.update(
    order.id,
    {
      version: cancelled.version,
      fulfillmentStatus: 'cancelled',
      paidCents: 100,
      refundedCents: 100,
      note: 'Refund verified',
    },
    'admin',
  );
  assert.equal(db.data.get('products/P001').quantity, 3);
  assert.equal(db.data.get(`orders/${order.id}`).paymentStatus, 'refunded');
});
test('invalid transitions, stale versions, payment reductions and over-refunds are rejected', async () => {
  const db = memory();
  const order = await placed(db);
  const base = {
    version: 1,
    fulfillmentStatus: 'confirmed',
    paidCents: 100,
    refundedCents: 0,
    note: 'Evidence',
  };
  assert.throws(() => transition(order, { ...base, version: 0 }, 1000, 'admin'), /changed/);
  assert.throws(
    () => transition(order, { ...base, fulfillmentStatus: 'delivered' }, 1000, 'admin'),
    /transition/,
  );
  assert.throws(() => transition(order, { ...base, refundedCents: 101 }, 1000, 'admin'), /Refund/);
});
const origin = 'https://store.test';
const env = {
  GOOGLE_PRIVATE_KEY: 'test-only',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test-only',
  FIREBASE_PROJECT_ID: 'test-only',
  ALLOWED_ORIGINS: origin,
  TURNSTILE_SECRET: 'test-only',
  API_LIMITER: { limit: async () => ({ success: true }) },
};
const httpRequest = (path, input, token) =>
  new Request(origin + path, {
    method: 'POST',
    headers: {
      Origin: origin,
      ...(input?.challenge ? { 'X-Turnstile-Token': input.challenge } : {}),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input, (key, value) => (key === 'challenge' ? undefined : value)),
  });
test('guest status capability isolates orders and omits contact/private hashes', async () => {
  const db = memory();
  const order = await placed(db);
  const handler = createCommerceHandler({ database: () => db, clock: () => 1001 });
  assert.equal((await handler(httpRequest('/order-status', { id: order.id }), env)).status, 404);
  assert.equal(
    (await handler(httpRequest('/order-status', { id: order.id, access: 'b'.repeat(64) }), env))
      .status,
    404,
  );
  const response = await handler(
    httpRequest('/order-status', { id: order.id, access: request().checkoutKey }),
    env,
  );
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.order.contact, undefined);
  assert.equal(data.order.accessHash, undefined);
  const expired = createCommerceHandler({
    database: () => db,
    clock: () => order.accessExpiresAt + 1,
  });
  assert.equal(
    (
      await expired(
        httpRequest('/order-status', { id: order.id, access: request().checkoutKey }),
        env,
      )
    ).status,
    404,
  );
});
test('API denies admin impersonation, expired auth, missing anti-bot, excess body and exhausted rate budget', async () => {
  const db = memory();
  const handler = createCommerceHandler({
    database: () => db,
    authenticate: async () => {
      throw new Error('Invalid token');
    },
  });
  assert.equal((await handler(httpRequest('/admin/orders', { admin: true }), env)).status, 403);
  assert.equal((await handler(httpRequest('/my-orders', {}, 'invalid'), env)).status, 401);
  assert.equal((await handler(httpRequest('/checkout', request()), env)).status, 401);
  assert.equal(
    (await handler(httpRequest('/quote', { text: 'a'.repeat(25000) }), env)).status,
    413,
  );
  assert.equal(
    (
      await handler(httpRequest('/quote', request()), {
        ...env,
        API_LIMITER: { limit: async () => ({ success: false }) },
      })
    ).status,
    429,
  );
});
test('API verifies server identity for discount and verifies challenge host/action before writes', async () => {
  const db = memory();
  const handler = createCommerceHandler({
    database: () => db,
    authenticate: async () => ({ uid: 'member', member: true, admin: false }),
    remote: async () =>
      Response.json({ success: true, hostname: 'store.test', action: 'checkout' }),
    clock: () => 1000,
  });
  const quote = await (
    await handler(httpRequest('/quote', request(), 'valid-test-token'), env)
  ).json();
  assert.equal(quote.discountCents, 124);
  const response = await handler(
    httpRequest(
      '/checkout',
      { ...request(), quoteFingerprint: quote.quoteFingerprint, challenge: 'test-only' },
      'valid-test-token',
    ),
    env,
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.whatsappUrl, /wa.me/);
  assert.equal(result.order.paymentStatus, 'unpaid');
  const wrongHost = createCommerceHandler({
    database: () => db,
    remote: async () =>
      Response.json({ success: true, hostname: 'attacker.test', action: 'checkout' }),
  });
  assert.equal(
    (
      await wrongHost(
        httpRequest('/checkout', {
          ...request('b'),
          quoteFingerprint: 'a'.repeat(64),
          challenge: 'test-only',
        }),
        env,
      )
    ).status,
    403,
  );
});
test('Firestore value mapping preserves integer cents, booleans, arrays and nulls', async () => {
  const value = { cents: 1234, hold: null, active: false, rows: [{ count: 2 }] };
  assert.deepEqual(decode(encode(value)), value);
  assert.equal((await hash('a'.repeat(64))).length, 64);
});

test('commerce authentication verifies signatures/project/expiry and derives verified membership', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'commerce-test';
  jwk.alg = 'RS256';
  const keySet = createLocalJWKSet({ keys: [jwk] });
  const make = (claims = {}, audience = 'test-project') =>
    new SignJWT({ auth_time: Math.floor(Date.now() / 1000), email_verified: true, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'commerce-test' })
      .setIssuer('https://securetoken.google.com/test-project')
      .setAudience(audience)
      .setSubject('test-member')
      .setIssuedAt()
      .setExpirationTime(claims.exp ?? '5m')
      .sign(privateKey);
  assert.deepEqual(await identity(await make(), 'test-project', keySet), {
    uid: 'test-member',
    admin: false,
    member: true,
  });
  assert.equal(
    (await identity(await make({ email_verified: false }), 'test-project', keySet)).member,
    false,
  );
  await assert.rejects(identity(await make({}, 'wrong-project'), 'test-project', keySet));
  await assert.rejects(identity(await make({ exp: 1 }), 'test-project', keySet));
  const token = await make();
  await assert.rejects(identity(token.slice(0, -20) + 'forged', 'test-project', keySet));
});

test('REST adapter retries aborted transactions and sends atomic, masked inventory/order writes', async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const calls = [];
  let aborted = false;
  const root = 'projects/test-project/databases/maindb/documents';
  const mockFetch = async (url, options) => {
    if (url === 'https://oauth2.googleapis.com/token')
      return Response.json({ access_token: 'test-only', expires_in: 3600 });
    const input = JSON.parse(options.body);
    calls.push({ url, input });
    if (url.endsWith(':beginTransaction'))
      return Response.json({ transaction: 'test-transaction' });
    if (url.endsWith(':rollback')) return Response.json({});
    if (url.endsWith(':batchGet'))
      return Response.json([
        { found: { name: `${root}/products/P001`, fields: { quantity: encode(1) } } },
      ]);
    if (url.endsWith(':commit')) {
      if (!aborted) {
        aborted = true;
        return Response.json({ error: { status: 'ABORTED' } }, { status: 409 });
      }
      return Response.json({ commitTime: '2026-10-28T00:00:00Z' });
    }
    throw new Error('Unexpected request');
  };
  const db = firestore(
    {
      FIREBASE_PROJECT_ID: 'test-project',
      FIRESTORE_DATABASE: 'maindb',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'unit-test@example.invalid',
      GOOGLE_PRIVATE_KEY: await exportPKCS8(privateKey),
    },
    mockFetch,
  );
  await db.transaction(async (tx) => {
    const [p] = await tx.getMany(['products/P001']);
    assert.equal(p.quantity, 1);
    tx.patch('products/P001', { quantity: 0 });
    tx.set('orders/unit-test', { totalCents: 1234 });
  });
  const commits = calls.filter((call) => call.url.endsWith(':commit'));
  assert.equal(commits.length, 2);
  assert.equal(commits[1].input.writes.length, 2);
  assert.deepEqual(commits[1].input.writes[0].updateMask.fieldPaths, ['quantity']);
  assert.equal(commits[1].input.transaction, 'test-transaction');
});

test('admin seed is disabled/idempotent, settings save validates and rejects stale versions', async () => {
  const db = memory({ 'store_settings/checkout': null });
  const handler = createCommerceHandler({
    database: () => db,
    authenticate: async () => ({ uid: 'test-admin', admin: true, member: true }),
  });
  const invoke = async (path, input) => handler(httpRequest(path, input, 'admin-test-token'), env);
  const seeded = await (await invoke('/admin/settings/seed', {})).json();
  assert.equal(seeded.settings.enabled, false);
  assert.equal((await (await invoke('/admin/settings/seed', {})).json()).settings.version, 1);
  assert.equal(
    (await invoke('/admin/settings/save', { ...seeded.settings, enabled: true })).status,
    400,
  );
  const saved = await (await invoke('/admin/settings/save', settings)).json();
  assert.equal(saved.settings.version, 2);
  assert.equal(saved.settings.zones[0].feeCents, 300);
  assert.equal((await invoke('/admin/settings/save', settings)).status, 409);
});

test('member history cannot select another account and delivered orders consume bookkeeping holds once', async () => {
  const db = memory();
  const order = await placed(db, request(), { uid: 'member-a', member: true });
  const handler = createCommerceHandler({
    database: () => db,
    authenticate: async () => ({ uid: 'member-b', member: true, admin: false }),
  });
  const history = await (
    await handler(httpRequest('/my-orders', { userId: 'member-a' }, 'test-token'), env)
  ).json();
  assert.equal(history.orders.length, 0);
  assert.equal(
    (await handler(httpRequest('/order-status', { id: order.id }, 'test-token'), env)).status,
    404,
  );
  const service = ledger(db, () => 1001);
  let current = await service.update(
    order.id,
    {
      version: 1,
      fulfillmentStatus: 'confirmed',
      paidCents: order.totalCents,
      refundedCents: 0,
      note: 'Paid and confirmed',
    },
    'admin',
  );
  current = await service.update(
    order.id,
    {
      version: current.version,
      fulfillmentStatus: 'dispatched',
      paidCents: order.totalCents,
      refundedCents: 0,
      note: 'Courier reference',
    },
    'admin',
  );
  current = await service.update(
    order.id,
    {
      version: current.version,
      fulfillmentStatus: 'delivered',
      paidCents: order.totalCents,
      refundedCents: 0,
      note: 'Delivery confirmed',
    },
    'admin',
  );
  assert.equal(db.data.get('products/P001').reservedUnits, 0);
  assert.equal(db.data.get('products/P001').quantity, 2);
  await service.update(
    order.id,
    {
      version: current.version,
      fulfillmentStatus: 'delivered',
      paidCents: order.totalCents,
      refundedCents: 0,
      note: 'Delivery note corrected',
    },
    'admin',
  );
  assert.equal(db.data.get('products/P001').reservedUnits, 0);
});

test('edge guardian rejects hostile origins, missing headers and malformed intents before database access', async () => {
  let databaseCalls = 0;
  let verificationCalls = 0;
  const handler = createCommerceHandler({
    database: () => {
      databaseCalls++;
      throw new Error('private credential');
    },
    remote: async () => {
      verificationCalls++;
      return Response.json({ success: true, hostname: 'store.test', action: 'checkout' });
    },
  });
  const hostile = new Request(origin + '/checkout', {
    method: 'POST',
    headers: { Origin: 'https://attacker.test' },
    body: '{}',
  });
  assert.equal((await handler(hostile, env)).status, 403);
  assert.equal(
    (await handler(httpRequest('/checkout', { challenge: 'body-only' }), env)).status,
    400,
  );
  assert.equal((await handler(httpRequest('/checkout', request()), env)).status, 401);
  for (const payload of [
    null,
    [],
    'text',
    { ...request(), lines: [null] },
    { ...request(), contact: [] },
    { ...request(), lines: [{ productId: ['P001'], quantity: 1 }] },
  ]) {
    assert.equal((await handler(httpRequest('/quote', payload), env)).status, 400);
  }
  assert.equal(databaseCalls, 0);
  assert.equal(verificationCalls, 0);
  const preflight = await handler(
    new Request(origin, { method: 'OPTIONS', headers: { Origin: origin } }),
    env,
  );
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /X-Turnstile-Token/);
  assert.match(preflight.headers.get('Content-Security-Policy'), /default-src 'none'/);
  const noToken = new Request(origin + '/checkout', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request(), challenge: 'body-only' }),
  });
  assert.equal((await handler(noToken, env)).status, 401);
});

test('Turnstile fails closed for upstream failures, nonboolean success, wrong action and oversized tokens', async () => {
  let databaseCalls = 0;
  const payload = { ...request(), quoteFingerprint: 'a'.repeat(64), challenge: 'test-token' };
  for (const outcome of [
    null,
    [],
    { success: 'true', hostname: 'store.test', action: 'checkout' },
    { success: true, hostname: 'store.test', action: 'other' },
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
  ]) {
    const handler = createCommerceHandler({
      database: () => {
        databaseCalls++;
      },
      remote: async (url, options) => {
        assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
        assert.equal(options.body.get('response'), 'test-token');
        return Response.json(outcome);
      },
    });
    assert.equal((await handler(httpRequest('/checkout', payload), env)).status, 403);
  }
  for (const remote of [
    async () => new Response('private upstream', { status: 500 }),
    async () => {
      throw new Error('private secret');
    },
    async () => new Response('invalid json'),
  ]) {
    const handler = createCommerceHandler({
      database: () => {
        databaseCalls++;
      },
      remote,
    });
    const response = await handler(httpRequest('/checkout', payload), env);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private|secret|SyntaxError/);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
  const handler = createCommerceHandler({
    database: () => {
      databaseCalls++;
    },
  });
  assert.equal(
    (await handler(httpRequest('/checkout', { ...payload, challenge: 'x'.repeat(2049) }), env))
      .status,
    403,
  );
  assert.equal(databaseCalls, 0);
});
