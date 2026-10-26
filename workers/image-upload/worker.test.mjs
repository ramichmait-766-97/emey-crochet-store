import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { createHandler, verifyAdmin } from './worker.mjs';

const origin = 'https://emey-crochet-store.web.app';
const env = {
  ALLOWED_ORIGINS: origin,
  FIREBASE_PROJECT_ID: 'emey-crochet-store',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/s5yr4ioi1',
  IMAGEKIT_PRIVATE_KEY: 'test-key',
};
const url = 'https://worker.example/upload';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const now = Math.floor(Date.now() / 1000);
const token = (claims = {}, expires = now + 300) =>
  new SignJWT({
    admin: true,
    auth_time: now,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`)
    .setAudience(env.FIREBASE_PROJECT_ID)
    .setSubject('admin-user')
    .setIssuedAt(now)
    .setExpirationTime(expires)
    .sign(privateKey);

test('verifies signed Firebase admin tokens; rejects non-admin, expired, wrong-project and forged tokens', async () => {
  await verifyAdmin(await token(), env.FIREBASE_PROJECT_ID, publicKey);
  await assert.rejects(
    verifyAdmin(await token({ admin: false }), env.FIREBASE_PROJECT_ID, publicKey),
  );
  await assert.rejects(verifyAdmin(await token({}, now - 10), env.FIREBASE_PROJECT_ID, publicKey));
  await assert.rejects(verifyAdmin(await token(), 'different-project', publicKey));
  await assert.rejects(
    verifyAdmin(await token({ auth_time: now + 100 }), env.FIREBASE_PROJECT_ID, publicKey),
  );
  const foreignKeys = await generateKeyPair('RS256');
  await assert.rejects(verifyAdmin(await token(), env.FIREBASE_PROJECT_ID, foreignKeys.publicKey));
});

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
function uploadRequest(bytes = png, type = 'image/png', auth = 'Bearer test-token') {
  const body = new FormData();
  body.set('productId', 'P001');
  body.set('file', new Blob([bytes], { type }), 'product.png');
  return new Request(url, {
    method: 'POST',
    headers: { Origin: origin, Authorization: auth },
    body,
  });
}

test('forwards a valid admin image to ImageKit and returns only public image fields', async () => {
  let calls = 0;
  const handler = createHandler({
    authenticate: async (token, project) => {
      assert.equal(token, 'test-token');
      assert.equal(project, env.FIREBASE_PROJECT_ID);
    },
    requestImageKit: async (target, options) => {
      calls++;
      assert.equal(target, 'https://upload.imagekit.io/api/v1/files/upload');
      assert.equal(options.headers.Authorization, `Basic ${btoa('test-key:')}`);
      assert.equal(options.body.get('folder'), '/emey/products');
      assert.equal(options.body.get('file').size, png.length);
      return Response.json({
        url: `${env.IMAGEKIT_URL_ENDPOINT}/photo.png`,
        fileId: 'file-1',
        secret: 'not-returned',
      });
    },
  });
  const response = await handler(uploadRequest(), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {
    imageUrl: `${env.IMAGEKIT_URL_ENDPOINT}/photo.png`,
    imageFileId: 'file-1',
    imageContentType: 'image/png',
  });
  assert.equal(calls, 1);
});

test('rejects untrusted origins, absent tokens and non-admins without uploading', async () => {
  let calls = 0;
  const handler = createHandler({
    authenticate: async () => {
      throw new Error('not admin');
    },
    requestImageKit: async () => {
      calls++;
      throw new Error('must not upload');
    },
  });
  assert.equal(
    (
      await handler(
        new Request(url, { method: 'POST', headers: { Origin: 'https://attacker.example' } }),
        env,
      )
    ).status,
    403,
  );
  assert.equal((await handler(uploadRequest(png, 'image/png', ''), env)).status, 401);
  assert.equal((await handler(uploadRequest(), env)).status, 403);
  assert.equal(calls, 0);
});

test('handles preflight without requiring login', async () => {
  const response = await createHandler()(
    new Request(url, { method: 'OPTIONS', headers: { Origin: origin } }),
    env,
  );
  assert.equal(response.status, 204);
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('rejects disguised and oversized images before contacting ImageKit', async () => {
  let calls = 0;
  const handler = createHandler({
    authenticate: async () => {},
    requestImageKit: async () => {
      calls++;
    },
  });
  assert.equal(
    (await handler(uploadRequest(new TextEncoder().encode('<svg></svg>')), env)).status,
    400,
  );
  assert.equal((await handler(uploadRequest(png, 'image/jpeg'), env)).status, 400);
  // A raw request stream also exercises the cap without trusting Content-Length.
  const oversized = new Request(url, {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: 'Bearer test-token',
      'Content-Type': 'multipart/form-data; boundary=test',
    },
    body: new Uint8Array(6 * 1024 * 1024),
  });
  assert.equal((await handler(oversized, env)).status, 413);
  assert.equal(calls, 0);
});

test('upstream errors do not expose the private key and unexpected image URLs are rejected', async () => {
  const failed = createHandler({
    authenticate: async () => {},
    requestImageKit: async () => new Response('test-key upstream details', { status: 401 }),
  });
  const response = await failed(uploadRequest(), env);
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('test-key'), false);
  const wrongHost = createHandler({
    authenticate: async () => {},
    requestImageKit: async () =>
      Response.json({ url: 'https://attacker.example/image.png', fileId: 'id' }),
  });
  assert.equal((await wrongHost(uploadRequest(), env)).status, 502);
});
