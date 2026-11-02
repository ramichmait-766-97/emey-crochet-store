import { createRemoteJWKSet, jwtVerify } from 'jose';
import { firestore } from './firestore-rest.mjs';
import {
  CommerceError,
  DEFAULT_CHECKOUT,
  checkoutInput,
  priceOrder,
  requireThat,
  stockChanges,
  text,
  transition,
  validateSettings,
} from './commerce-domain.mjs';

const keys = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);
export async function identity(token, projectId, keySet = keys) {
  const { payload } = await jwtVerify(token, keySet, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
    requiredClaims: ['exp', 'iat', 'sub', 'auth_time'],
  });
  requireThat(
    typeof payload.sub === 'string' &&
      payload.sub.length <= 128 &&
      payload.iat <= Date.now() / 1000 &&
      typeof payload.auth_time === 'number' &&
      payload.auth_time <= Date.now() / 1000,
    'Please sign in again.',
    401,
  );
  return {
    uid: payload.sub,
    admin: payload.admin === true,
    member: payload.email_verified === true,
  };
}
export async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
const productIds = (lines) => [...new Set(lines.map((line) => line.productId))];
const catalog = (ids, rows) => new Map(ids.map((id, index) => [id, rows[index]]));
export const publicOrder = (order) => {
  const {
    id,
    createdAt,
    updatedAt,
    fulfillmentStatus,
    paymentStatus,
    paidCents,
    refundedCents,
    lines,
    subtotalCents,
    discountCents,
    deliveryCents,
    totalCents,
    currency,
    delivery,
    payment,
    reservationExpiresAt,
    reservationState,
    version,
  } = order;
  return {
    id,
    createdAt,
    updatedAt,
    fulfillmentStatus,
    paymentStatus,
    paidCents,
    refundedCents,
    lines,
    subtotalCents,
    discountCents,
    deliveryCents,
    totalCents,
    currency,
    delivery,
    payment,
    reservationExpiresAt,
    reservationState,
    version,
  };
};
export function ledger(db, now = () => Date.now()) {
  async function quote(raw, user) {
    const input = checkoutInput(raw);
    const ids = productIds(input.lines);
    const [settings, site, ...rows] = await db.getMany([
      'store_settings/checkout',
      'siteSettings/public',
      ...ids.map((id) => `products/${id}`),
    ]);
    const priced = priceOrder(input, settings, site, catalog(ids, rows), !!user?.member);
    return { ...priced, quoteFingerprint: await hash(JSON.stringify([priced, user?.uid || null])) };
  }
  async function create(raw, user) {
    const input = checkoutInput(raw);
    const accessHash = await hash(input.checkoutKey);
    const id = accessHash.slice(0, 32);
    const requestHash = await hash(JSON.stringify([input, user?.uid || null]));
    const ids = productIds(input.lines);
    return db.transaction(async (tx) => {
      const [existing, settings, site, ...rows] = await tx.getMany([
        `orders/${id}`,
        'store_settings/checkout',
        'siteSettings/public',
        ...ids.map((item) => `products/${item}`),
      ]);
      if (existing) {
        requireThat(
          existing.requestHash === requestHash,
          'This checkout session already has an order. Open its status before starting another.',
          409,
        );
        return existing;
      }
      const products = catalog(ids, rows);
      const priced = priceOrder(input, settings, site, products, !!user?.member);
      requireThat(
        raw.quoteFingerprint === (await hash(JSON.stringify([priced, user?.uid || null]))),
        'Prices or delivery settings changed. Review the updated total before reserving.',
        409,
      );
      const timestamp = now();
      const order = {
        ...priced,
        schemaVersion: 2,
        id,
        userId: user?.uid || null,
        contact: input.contact,
        accessHash,
        requestHash,
        createdAt: timestamp,
        updatedAt: timestamp,
        reservationExpiresAt: timestamp + settings.reservationMinutes * 60000,
        accessExpiresAt: timestamp + 90 * 86400000,
        reservationState: 'held',
        fulfillmentStatus: 'requested',
        paymentStatus: 'unpaid',
        paidCents: 0,
        refundedCents: 0,
        version: 1,
      };
      for (const [productId, data] of stockChanges(priced.lines, products, -1))
        tx.patch(`products/${productId}`, data);
      tx.set(`orders/${id}`, order);
      tx.set(`orders/${id}/events/1`, {
        at: timestamp,
        actor: user?.uid || 'guest',
        action: 'requested',
        note: 'Stock reserved. Payment not received.',
      });
      return order;
    });
  }
  async function update(id, change, actor, expire = false) {
    return db.transaction(async (tx) => {
      const [order] = await tx.getMany([`orders/${id}`]);
      requireThat(order, 'Order not found.', 404);
      const overdue = order.reservationState === 'held' && order.reservationExpiresAt <= now();
      if (expire && !overdue) return order;
      // Expiry wins over an admin confirming from a stale screen; payment must not be accepted for expired stock.
      const next = overdue
        ? {
            ...order,
            fulfillmentStatus: 'expired',
            reservationState: 'released',
            updatedAt: now(),
            version: order.version + 1,
            lastUpdate: { actor: 'system', note: 'Unconfirmed reservation expired.', at: now() },
          }
        : transition(order, change, now(), actor);
      const releasing =
        next.reservationState === 'released' && order.reservationState !== 'released';
      const finalizing =
        next.fulfillmentStatus === 'delivered' && order.fulfillmentStatus !== 'delivered';
      const ids = releasing || finalizing ? productIds(order.lines) : [];
      const rows = ids.length
        ? await tx.getMany(ids.map((productId) => `products/${productId}`))
        : [];
      if (releasing)
        for (const [productId, data] of stockChanges(order.lines, catalog(ids, rows), 1))
          tx.patch(`products/${productId}`, data);
      if (finalizing)
        for (const [index, productId] of ids.entries()) {
          const units = order.lines
            .filter((line) => line.productId === productId)
            .reduce((sum, line) => sum + line.quantity, 0);
          requireThat(
            rows[index] && rows[index].reservedUnits >= units,
            'Reserved stock needs administrator attention.',
            409,
          );
          tx.patch(`products/${productId}`, {
            reservedUnits: rows[index].reservedUnits - units,
            inventoryVersion: (rows[index].inventoryVersion || 0) + 1,
          });
        }
      tx.set(`orders/${id}`, next);
      tx.set(`orders/${id}/events/${next.version}`, {
        at: next.updatedAt,
        actor: next.lastUpdate.actor,
        note: next.lastUpdate.note,
        action: next.fulfillmentStatus,
        paymentStatus: next.paymentStatus,
        paidCents: next.paidCents,
        refundedCents: next.refundedCents,
      });
      return next;
    });
  }
  return { quote, create, update };
}
async function body(request) {
  requireThat(
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/json',
    'Send JSON.',
    415,
  );
  let size = 0;
  const chunks = [];
  for await (const chunk of request.body || []) {
    size += chunk.length;
    requireThat(size <= 24576, 'Request too large.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(await new Blob(chunks).text());
  } catch {
    throw new CommerceError('Invalid JSON.');
  }
}
export function createCommerceHandler({
  database = firestore,
  authenticate = identity,
  remote = fetch,
  clock = () => Date.now(),
} = {}) {
  return async (request, env) => {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim());
    const headers = {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      Vary: 'Origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    };
    const reply = (data, status = 200) => Response.json(data, { status, headers });
    if (!allowed.includes(origin) || !origin) return reply({ error: 'Origin not allowed.' }, 403);
    Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Turnstile-Token',
      'Access-Control-Max-Age': '86400',
    });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    try {
      requireThat(
        env.GOOGLE_PRIVATE_KEY &&
          env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
          env.FIREBASE_PROJECT_ID &&
          env.API_LIMITER,
        'Order service has not been configured.',
        503,
      );
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      requireThat(
        (await env.API_LIMITER.limit({ key: ip })).success,
        'Too many requests. Wait a minute and try again.',
        429,
      );
      const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      let user = null;
      if (token) {
        try {
          user = await authenticate(token, env.FIREBASE_PROJECT_ID);
        } catch {
          throw new CommerceError('Please sign in again.', 401);
        }
      }
      const path = new URL(request.url).pathname;
      if (path === '/checkout')
        requireThat(
          request.headers.get('X-Turnstile-Token')?.trim(),
          'Complete the checkout security check.',
          401,
        );
      const input = await body(request);
      requireThat(
        input !== null && typeof input === 'object' && !Array.isArray(input),
        'Invalid request payload.',
      );
      if (path.startsWith('/admin/'))
        requireThat(user?.admin, 'Administrator access required.', 403);
      if (path === '/quote' || path === '/checkout') checkoutInput(input);
      if (path === '/checkout') {
        const challengeToken = request.headers.get('X-Turnstile-Token');
        requireThat(
          challengeToken && challengeToken.trim(),
          'Complete the checkout security check.',
          401,
        );
        requireThat(challengeToken.length <= 2048, 'Complete the checkout security check.', 403);
        requireThat(env.TURNSTILE_SECRET, 'Order service has not been configured.', 503);
        requireThat(
          typeof input.quoteFingerprint === 'string' &&
            /^[a-f0-9]{64}$/.test(input.quoteFingerprint),
          'Invalid quote fingerprint.',
        );
        const challenge = await remote(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
          {
            method: 'POST',
            body: new URLSearchParams({
              secret: env.TURNSTILE_SECRET,
              response: challengeToken,
              remoteip: ip,
            }),
            signal: AbortSignal.timeout(10000),
          },
        );
        requireThat(challenge.ok, 'Security check unavailable. Please try again.', 503);
        const verified = await challenge.json();
        requireThat(
          verified !== null &&
            typeof verified === 'object' &&
            !Array.isArray(verified) &&
            verified.success === true &&
            verified.hostname === new URL(origin).hostname &&
            verified.action === 'checkout',
          'Security check expired. Please try again.',
          403,
        );
      }
      const db = database(env);
      const service = ledger(db, clock);
      if (path === '/quote') return reply(await service.quote(input, user));
      if (path === '/checkout') {
        const order = await service.create(input, user);
        const [site] = await db.getMany(['siteSettings/public']);
        const number = site?.contacts
          ?.find((item) => item.enabled && item.type === 'whatsapp')
          ?.value?.replace(/\D/g, '');
        const whatsappUrl =
          number && /^\d{8,15}$/.test(number)
            ? `https://wa.me/${number}?text=${encodeURIComponent(`Hello, please review order ${order.id}. The store ledger is the source of truth for items, total and payment status.`)}`
            : null;
        return reply({ order: publicOrder(order), whatsappUrl });
      }
      if (path === '/order-status') {
        requireThat(/^[a-f0-9]{32}$/.test(input.id || ''), 'Order unavailable.', 404);
        const [order] = await db.getMany([`orders/${input.id}`]);
        const owner = user && order?.userId === user.uid;
        const accessHash = /^[a-f0-9]{64}$/.test(input.access || '')
          ? await hash(input.access)
          : '';
        requireThat(
          order &&
            (user?.admin ||
              owner ||
              (order.accessHash === accessHash && order.accessExpiresAt > clock())),
          'Order unavailable or link expired.',
          404,
        );
        const current =
          order.reservationState === 'held' && order.reservationExpiresAt <= clock()
            ? await service.update(order.id, {}, 'system', true)
            : order;
        return reply({ order: publicOrder(current) });
      }
      if (path === '/my-orders' || path === '/admin/orders') {
        requireThat(user, 'Please sign in.', 401);
        if (input.cursor)
          requireThat(
            Number.isSafeInteger(input.cursor.createdAt) &&
              /^[a-f0-9]{32}$/.test(input.cursor.id || ''),
            'Invalid page cursor.',
          );
        const filters = [
          ['schemaVersion', 'EQUAL', 2],
          ...(path === '/my-orders' ? [['userId', 'EQUAL', user.uid]] : []),
        ];
        const orders = await db.query('orders', { filters, cursor: input.cursor, limit: 25 });
        const last = orders.at(-1);
        return reply({
          orders: path === '/my-orders' ? orders.map(publicOrder) : orders,
          cursor: orders.length === 25 ? { createdAt: last.createdAt, id: last.id } : null,
        });
      }
      if (path === '/admin/order') {
        requireThat(/^[a-f0-9]{32}$/.test(input.id || ''), 'Invalid order.');
        return reply({ order: await service.update(input.id, input, user.uid) });
      }
      if (path === '/admin/settings/seed' || path === '/admin/settings/save') {
        const settings = await db.transaction(async (tx) => {
          const [existing] = await tx.getMany(['store_settings/checkout']);
          if (path.endsWith('/seed')) {
            if (existing) return existing;
            const draft = { ...DEFAULT_CHECKOUT, modifiedAt: clock(), modifiedBy: user.uid };
            tx.set('store_settings/checkout', draft);
            return draft;
          }
          requireThat(
            existing && existing.version === input.version,
            'Settings changed. Reload before saving.',
            409,
          );
          const saved = {
            ...validateSettings(input),
            version: existing.version + 1,
            modifiedAt: clock(),
            modifiedBy: user.uid,
          };
          tx.set('store_settings/checkout', saved);
          return saved;
        });
        return reply({ settings });
      }
      throw new CommerceError('Not found.', 404);
    } catch (error) {
      return reply(
        {
          error:
            error instanceof CommerceError
              ? error.message
              : 'Order service unavailable. Retry with the same checkout session.',
        },
        error instanceof CommerceError ? error.status : 503,
      );
    }
  };
}
export async function expireReservations(env, database = firestore) {
  const db = database(env);
  // Three orders leave headroom for bounded transaction retries under Workers Free's 50-subrequest limit.
  const rows = await db.query('orders', {
    filters: [
      ['reservationState', 'EQUAL', 'held'],
      ['reservationExpiresAt', 'LESS_THAN_OR_EQUAL', Date.now()],
    ],
    order: 'reservationExpiresAt',
    limit: 3,
  });
  let failures = 0;
  for (const row of rows) {
    try {
      await ledger(db).update(row.id, {}, 'system', true);
    } catch {
      failures++;
    }
  }
  if (failures)
    throw new Error('Reservation sweep needs inventory review. No customer data logged.');
}
export default {
  fetch: createCommerceHandler(),
  scheduled(_event, env, context) {
    context.waitUntil(expireReservations(env));
  },
};
