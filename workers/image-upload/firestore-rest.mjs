import { importPKCS8, SignJWT } from 'jose';

let cached;
let signingKey;
export function encode(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: fields(value) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: value };
}
const fields = (data) =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
export function decode(value) {
  if ('nullValue' in value) return null;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
  if (value.mapValue)
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]),
    );
  return value.stringValue ?? value.timestampValue;
}

// IAM credentials stay in Worker secrets; browser rules remain deny-write for orders.
export function firestore(env, request = fetch) {
  const root = `projects/${env.FIREBASE_PROJECT_ID}/databases/${env.FIRESTORE_DATABASE || 'maindb'}/documents`;
  async function accessToken() {
    if (cached?.email === env.GOOGLE_SERVICE_ACCOUNT_EMAIL && cached.until > Date.now())
      return cached.token;
    if (!signingKey || signingKey.pem !== env.GOOGLE_PRIVATE_KEY)
      signingKey = {
        pem: env.GOOGLE_PRIVATE_KEY,
        key: await importPKCS8(env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256'),
      };
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/datastore' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(signingKey.key);
    const response = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Database authentication unavailable.');
    const data = await response.json();
    cached = {
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      token: data.access_token,
      until: Date.now() + (data.expires_in - 120) * 1000,
    };
    return cached.token;
  }
  async function call(suffix, body) {
    const response = await request(`https://firestore.googleapis.com/v1/${root}${suffix}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error('Database request failed.');
      error.retry = data.error?.status === 'ABORTED';
      throw error;
    }
    return data;
  }
  const document = (item) =>
    Object.fromEntries(
      Object.entries(item.fields || {}).map(([key, value]) => [key, decode(value)]),
    );
  async function getMany(paths, transaction) {
    const response = await call(':batchGet', {
      documents: paths.map((path) => `${root}/${path}`),
      ...(transaction ? { transaction } : {}),
    });
    const byName = new Map(
      response.map((item) => [
        item.found?.name || item.missing,
        item.found ? document(item.found) : null,
      ]),
    );
    return paths.map((path) => byName.get(`${root}/${path}`) ?? null);
  }
  return {
    getMany,
    async query(collectionId, { filters = [], limit = 25, cursor, order = 'createdAt' } = {}) {
      const conditions = filters.map(([field, op, value]) => ({
        fieldFilter: { field: { fieldPath: field }, op, value: encode(value) },
      }));
      const result = await call(':runQuery', {
        structuredQuery: {
          from: [{ collectionId }],
          limit,
          ...(conditions.length
            ? {
                where:
                  conditions.length === 1
                    ? conditions[0]
                    : { compositeFilter: { op: 'AND', filters: conditions } },
              }
            : {}),
          orderBy: [
            { field: { fieldPath: order }, direction: 'DESCENDING' },
            { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
          ],
          ...(cursor
            ? {
                startAt: {
                  before: false,
                  values: [
                    encode(cursor.createdAt),
                    { referenceValue: `${root}/${collectionId}/${cursor.id}` },
                  ],
                },
              }
            : {}),
        },
      });
      return result
        .filter((item) => item.document)
        .map((item) => ({ ...document(item.document), id: item.document.name.split('/').at(-1) }));
    },
    async transaction(action) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { transaction } = await call(':beginTransaction', {});
        const writes = [];
        try {
          const result = await action({
            getMany: (paths) => getMany(paths, transaction),
            set: (path, data) =>
              writes.push({ update: { name: `${root}/${path}`, fields: fields(data) } }),
            patch: (path, data) =>
              writes.push({
                update: { name: `${root}/${path}`, fields: fields(data) },
                updateMask: { fieldPaths: Object.keys(data) },
                currentDocument: { exists: true },
              }),
          });
          if (writes.length) await call(':commit', { transaction, writes });
          else await call(':rollback', { transaction });
          return result;
        } catch (error) {
          await call(':rollback', { transaction }).catch(() => {});
          if (!error.retry || attempt === 2) throw error;
        }
      }
    },
  };
}
