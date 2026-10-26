import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function verifyAdmin(token, projectId, keySet = keys) {
  const { payload } = await jwtVerify(token, keySet, {
    algorithms: ['RS256'],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    requiredClaims: ['exp', 'iat', 'sub', 'auth_time'],
  });
  const now = Math.floor(Date.now() / 1000);
  if (
    !payload.sub ||
    payload.sub.length > 128 ||
    payload.iat > now ||
    typeof payload.auth_time !== 'number' ||
    payload.auth_time > now ||
    payload.admin !== true
  ) {
    throw new Error('Admin access required.');
  }
}

export function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png';
  const text = new TextDecoder();
  if (text.decode(bytes.slice(0, 4)) === 'RIFF' && text.decode(bytes.slice(8, 12)) === 'WEBP')
    return 'image/webp';
  return '';
}

export function createHandler({ authenticate = verifyAdmin, requestImageKit = fetch } = {}) {
  return async (request, env) => {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
    const reply = (data, status = 200) => Response.json(data, { status, headers });
    if (!origin || !allowed.includes(origin)) return reply({ error: 'Origin not allowed.' }, 403);
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    if (new URL(request.url).pathname !== '/upload') return reply({ error: 'Not found.' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    if (!env.IMAGEKIT_PRIVATE_KEY || !env.FIREBASE_PROJECT_ID || !env.IMAGEKIT_URL_ENDPOINT) {
      return reply({ error: 'Image uploads have not been configured.' }, 503);
    }
    try {
      const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
      if (!token) return reply({ error: 'Please sign in again.' }, 401);
      try {
        await authenticate(token, env.FIREBASE_PROJECT_ID);
      } catch {
        return reply({ error: 'Please sign in with an administrator account.' }, 403);
      }
      if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) {
        return reply({ error: 'Choose a product image.' }, 400);
      }
      // Bound the actual stream, including requests without Content-Length.
      const chunks = [];
      let size = 0;
      for await (const chunk of request.body || []) {
        size += chunk.byteLength;
        if (size > MAX_IMAGE_BYTES + 64 * 1024)
          return reply({ error: 'Images must be at most 5 MB.' }, 413);
        chunks.push(chunk);
      }
      const form = await new Response(new Blob(chunks), {
        headers: { 'Content-Type': request.headers.get('Content-Type') },
      }).formData();
      const file = form.get('file');
      const productId = form.get('productId');
      if (typeof productId !== 'string' || !/^[A-Z0-9_-]{1,128}$/.test(productId)) {
        return reply({ error: 'Invalid product ID.' }, 400);
      }
      if (!(file instanceof Blob) || !file.size || file.size > MAX_IMAGE_BYTES) {
        return reply({ error: 'Choose an image up to 5 MB.' }, 400);
      }
      const type = imageType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
      if (!type || file.type !== type)
        return reply({ error: 'Choose a WebP, JPG or PNG image.' }, 400);
      const upload = new FormData();
      upload.set('file', file, `${productId}.${type.split('/')[1]}`);
      upload.set('fileName', `${productId}.${type.split('/')[1]}`);
      upload.set('folder', '/emey/products');
      upload.set('useUniqueFileName', 'true');
      const response = await requestImageKit('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(env.IMAGEKIT_PRIVATE_KEY + ':')}` },
        body: upload,
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok)
        return reply(
          {
            error:
              'Image hosting could not accept the upload. Check ImageKit configuration and usage.',
          },
          502,
        );
      const result = await response.json();
      const endpoint = env.IMAGEKIT_URL_ENDPOINT.replace(/\/$/, '') + '/';
      if (typeof result.url !== 'string' || !result.url.startsWith(endpoint) || !result.fileId) {
        return reply({ error: 'Image hosting returned an unexpected response.' }, 502);
      }
      return reply({ imageUrl: result.url, imageFileId: result.fileId, imageContentType: type });
    } catch {
      return reply({ error: 'Image upload failed. Please try again.' }, 502);
    }
  };
}

export default { fetch: createHandler() };
