import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { DATABASE_ID, initAdminApp } from './init-admin-app.mjs';

initAdminApp();
const db = getFirestore(DATABASE_ID);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const productsDir = join(repoRoot, 'src', 'assets', 'products');
const MAX_DOC_BYTES = 700 * 1024;

const products = [
  {
    id: 'P001',
    slug: 'red-crop-top-shorts-set',
    name: 'Crochet Crop Top & Shorts Set',
    category: 'Apparel',
    description: 'A bold two-piece crochet set with airy hand-worked texture.',
    price: 48,
    quantity: 3,
    file: 'red-crop-set.webp',
    colors: ['Red'],
    bestSeller: true,
    newArrival: false,
  },
  {
    id: 'P002',
    slug: 'granny-square-chair-throw',
    name: 'Granny-Square Chair Throw',
    category: 'Home Decor',
    description:
      'Warm geometric granny squares designed to bring a handcrafted accent to your space.',
    price: 62,
    quantity: 2,
    file: 'granny-chair-throw.webp',
    colors: ['Orange', 'Olive', 'Brown'],
    bestSeller: false,
    newArrival: false,
  },
  {
    id: 'P003',
    slug: 'multicolor-crochet-runner',
    name: 'Multicolor Crochet Runner',
    category: 'Home Decor',
    description: 'A cheerful color-blocked runner finished with decorative blue edging.',
    price: 38,
    quantity: 4,
    file: 'multicolor-runner.webp',
    colors: ['Multicolor'],
    bestSeller: false,
    newArrival: true,
  },
  {
    id: 'P004',
    slug: 'sunflower-drawstring-bag',
    name: 'Sunflower Drawstring Bag',
    category: 'Bags & Accessories',
    description: 'A soft cream drawstring bag composed from sunflower granny squares.',
    price: 44,
    quantity: 5,
    file: 'sunflower-bag.webp',
    colors: ['Cream', 'Yellow', 'Green'],
    bestSeller: true,
    newArrival: true,
  },
  {
    id: 'P005',
    slug: 'royal-blue-frame-handbag',
    name: 'Royal Blue Frame Handbag',
    category: 'Bags & Accessories',
    description: 'Structured crochet handbag with a vintage-inspired metal frame closure.',
    price: 58,
    quantity: 2,
    file: 'royal-blue-frame-bag.webp',
    colors: ['Royal Blue'],
    bestSeller: true,
    newArrival: false,
  },
  {
    id: 'P006',
    slug: 'cream-child-dress',
    name: 'Cream Crochet Child Dress',
    category: 'Apparel',
    description: 'Delicate cream crochet dress with a round yoke and scalloped hem.',
    price: 52,
    quantity: 2,
    file: 'cream-child-dress.webp',
    colors: ['Cream'],
    bestSeller: false,
    newArrival: true,
  },
  {
    id: 'P007',
    slug: 'white-pinafore-dress',
    name: 'White Crochet Pinafore Dress',
    category: 'Apparel',
    description: 'Light sleeveless crochet dress with a graceful flared skirt.',
    price: 50,
    quantity: 2,
    file: 'white-pinafore-dress.webp',
    colors: ['White'],
    bestSeller: false,
    newArrival: true,
  },
  {
    id: 'P008',
    slug: 'taupe-flower-dress',
    name: 'Taupe Flower-Appliqué Dress',
    category: 'Apparel',
    description: 'A soft taupe crochet dress accented by a handcrafted flower at the waist.',
    price: 54,
    quantity: 1,
    file: 'taupe-flower-dress.webp',
    colors: ['Taupe', 'Cream'],
    bestSeller: true,
    newArrival: false,
  },
  {
    id: 'P009',
    slug: 'yellow-child-dress',
    name: 'Yellow Crochet Child Dress',
    category: 'Apparel',
    description: 'A sunny yellow crochet dress with a textured openwork skirt.',
    price: 52,
    quantity: 3,
    file: 'yellow-child-dress.webp',
    colors: ['Yellow'],
    bestSeller: false,
    newArrival: true,
  },
  {
    id: 'P010',
    slug: 'geometric-crochet-blanket',
    name: 'Geometric Crochet Blanket',
    category: 'Home Decor',
    description: 'Dimensional cube motifs in warm rust, cream and brown with a tasseled edge.',
    price: 92,
    quantity: 1,
    file: 'geometric-blanket.webp',
    colors: ['Rust', 'Cream', 'Brown'],
    bestSeller: true,
    newArrival: false,
  },
  {
    id: 'P011',
    slug: 'flower-leaf-keychains',
    name: 'Flower & Leaf Keychains',
    category: 'Keychains',
    description:
      'Playful flower-and-leaf keychains available in a range of soft and bright colors.',
    price: 12,
    quantity: 20,
    file: 'flower-keychains.webp',
    colors: ['Pink', 'White', 'Orange', 'Red', 'Yellow', 'Blue', 'Lavender'],
    bestSeller: true,
    newArrival: true,
  },
  {
    id: 'P012',
    slug: 'purple-openwork-cardigan',
    name: 'Purple Openwork Long Cardigan',
    category: 'Apparel',
    description:
      'An elegant long crochet layer with an airy lattice stitch and flowing silhouette.',
    price: 74,
    quantity: 2,
    file: 'purple-cardigan.webp',
    colors: ['Purple'],
    bestSeller: false,
    newArrival: false,
  },
  {
    id: 'P013',
    slug: 'multicolor-v-stitch-pouch',
    name: 'Multicolor V-Stitch Pouch',
    category: 'Bags & Accessories',
    description: 'Compact wristlet pouch with colorful V-stitch accents and a button closure.',
    price: 28,
    quantity: 6,
    file: 'v-stitch-pouch.webp',
    colors: ['Cream', 'Multicolor'],
    bestSeller: false,
    newArrival: true,
  },
  {
    id: 'P014',
    slug: 'white-red-baby-set',
    name: 'White & Red Baby Dress Set',
    category: 'Apparel',
    description:
      'A charming white crochet dress with red trim, waist tie and matching crochet shoes.',
    price: 56,
    quantity: 2,
    file: 'white-red-baby-set.webp',
    colors: ['White', 'Red'],
    bestSeller: true,
    newArrival: false,
  },
];

async function seed() {
  // Validate every local image before performing any writes.
  for (const product of products) {
    const size = readFileSync(join(productsDir, product.file)).byteLength;
    if (size > MAX_DOC_BYTES) throw new Error(`${product.file} exceeds the 700 KB image limit.`);
  }
  console.log(`Seeding ${products.length} products into Firestore database "${DATABASE_ID}"...`);

  const settingsRef = db.doc('siteSettings/public');
  if (!(await settingsRef.get()).exists)
    await settingsRef.set(
      {
        storeName: 'Emey Crochet Store',
        currency: 'USD',
        memberDiscountPercent: 10,
        contacts: [
          {
            id: 'whatsapp',
            type: 'whatsapp',
            label: 'WhatsApp',
            value: '+96176080766',
            url: 'https://wa.me/96176080766',
            enabled: true,
          },
        ],
        modifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  for (const product of products) {
    const imagePath = join(productsDir, product.file);
    const imageData = readFileSync(imagePath);

    if (imageData.byteLength > MAX_DOC_BYTES) {
      throw new Error(
        `${product.file} is ${imageData.byteLength} bytes. Firestore documents must stay under 1 MB.`,
      );
    }

    const { file, ...fields } = product;
    const ref = db.doc(`products/${product.id}`);
    const existing = await ref.get();
    if (existing.exists) {
      await ref.update({
        imageData,
        imageContentType: 'image/webp',
        modifiedAt: FieldValue.serverTimestamp(),
      });
      console.log(`  ${product.id}: image refreshed; existing catalog fields preserved.`);
      continue;
    }
    await db.doc(`products/${product.id}`).set(
      {
        ...fields,
        active: true,
        gallery: [],
        imageContentType: 'image/webp',
        imageData,
        createdAt: FieldValue.serverTimestamp(),
        modifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log(`  ${product.id} ${product.name} (${imageData.byteLength} bytes from ${file})`);
  }

  for (const product of products) {
    const saved = (await db.doc(`products/${product.id}`).get()).data();
    if (
      !Buffer.isBuffer(saved?.imageData) ||
      !saved.imageData.equals(readFileSync(join(productsDir, product.file)))
    ) {
      throw new Error(`Image read-back verification failed for ${product.id}`);
    }
  }

  console.log(`Done. Products are in project emey-crochet-store / database ${DATABASE_ID}.`);
}

try {
  await seed();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
