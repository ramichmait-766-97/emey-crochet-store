import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { initAdminApp } from './init-admin-app.mjs';

const endpoint = 'https://ik.imagekit.io/s5yr4ioi1/';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.env.IMAGEKIT_PRIVATE_KEY)
    throw new Error('Set IMAGEKIT_PRIVATE_KEY securely in this process before using --apply.');
  initAdminApp();
  const products = await getFirestore('maindb').collection('products').get();
  for (const doc of products.docs) {
    const data = doc.data();
    if (!Buffer.isBuffer(data.imageData) || !data.imageData.length) {
      console.log(`${doc.id}: no image bytes; skipped.`);
      continue;
    }
    const bytes = data.imageData;
    const type = data.imageContentType || 'image/webp';
    if (!['image/webp', 'image/jpeg', 'image/png'].includes(type))
      throw new Error(`${doc.id}: unsupported image type.`);
    if (!apply) {
      console.log(`${doc.id}: would migrate ${bytes.length} bytes; no changes made.`);
      continue;
    }
    const body = new FormData();
    body.set('file', new Blob([bytes], { type }), `${doc.id}.${type.split('/')[1]}`);
    body.set('fileName', `${doc.id}-${hash(bytes).slice(0, 16)}.${type.split('/')[1]}`);
    body.set('folder', '/emey/products');
    body.set('useUniqueFileName', 'true');
    const uploaded = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body,
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.IMAGEKIT_PRIVATE_KEY + ':').toString('base64')}`,
      },
      signal: AbortSignal.timeout(60000),
    });
    if (!uploaded.ok)
      throw new Error(
        `${doc.id}: ImageKit upload failed (${uploaded.status}); database unchanged for this product.`,
      );
    const image = await uploaded.json();
    if (
      typeof image.url !== 'string' ||
      !image.url.startsWith(endpoint) ||
      typeof image.fileId !== 'string'
    ) {
      throw new Error(`${doc.id}: unexpected upload response; database unchanged.`);
    }
    const originalUrl = new URL(image.url);
    originalUrl.searchParams.set('tr', 'orig-true');
    const publicImage = await fetch(originalUrl, { signal: AbortSignal.timeout(60000) });
    if (!publicImage.ok || hash(Buffer.from(await publicImage.arrayBuffer())) !== hash(bytes)) {
      throw new Error(`${doc.id}: public image verification failed; database unchanged.`);
    }
    // Refuse to replace an image edited during upload. All unrelated fields are preserved.
    await doc.ref.update(
      {
        imageUrl: image.url,
        imageFileId: image.fileId,
        imageContentType: type,
        imageData: FieldValue.delete(),
        modifiedAt: FieldValue.serverTimestamp(),
      },
      { lastUpdateTime: doc.updateTime },
    );
    const saved = (await doc.ref.get()).data();
    if (saved.imageData || saved.imageUrl !== image.url)
      throw new Error(`${doc.id}: database read-back failed.`);
    console.log(`${doc.id}: hosted image verified; database bytes removed.`);
  }
  console.log(
    apply
      ? 'Migration complete.'
      : 'Dry run complete. Use --apply to upload, verify, and replace image bytes.',
  );
}

main().catch((error) => {
  // Do not print request objects, which can contain private authorization headers.
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
});
