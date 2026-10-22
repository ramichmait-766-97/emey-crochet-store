import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { DATABASE_ID, initAdminApp } from './init-admin-app.mjs';

import { matchProduct, normalizeIdentity } from './seed-product-matching.mjs';

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

// New items remain drafts until the owner supplies real prices and stock.
products.push(
  {
    id: 'P015',
    slug: 'multicolor-granny-square-bag',
    name: 'Multicolor Granny-Square Handbag',
    category: 'Bags & Accessories',
    description:
      'A colorful floral granny-square handbag with burgundy edging and strap and gold-tone clasps.',
    file: 'multicolor-granny-square-bag.webp',
    colors: ['Multicolor', 'Burgundy'],
  },
  {
    id: 'P016',
    slug: 'white-crochet-tops-collection',
    name: 'White Crochet Tops Collection',
    category: 'Apparel',
    description:
      'A collection preview of nine distinct white crochet top designs. Confirm the individual design and availability before publishing.',
    file: 'white-crochet-tops-collection.webp',
    colors: ['White'],
  },
  {
    id: 'P017',
    slug: 'pink-floral-crochet-coat',
    name: 'Pink Floral Crochet Coat',
    category: 'Apparel',
    description:
      'A long cream crochet coat featuring pink and burgundy floral granny squares, a waist tie and pockets.',
    file: 'pink-floral-crochet-coat.webp',
    colors: ['Cream', 'Pink', 'Burgundy'],
  },
  {
    id: 'P018',
    slug: 'black-multicolor-crochet-coat',
    name: 'Black Multicolor Crochet Coat',
    category: 'Apparel',
    description:
      'A long open-front black crochet coat with bright multicolored granny-square motifs.',
    file: 'black-multicolor-crochet-coat.webp',
    colors: ['Black', 'Multicolor'],
  },
  {
    id: 'P019',
    slug: 'pink-rose-bag',
    name: 'Pink Rose Crochet Handbag',
    category: 'Bags & Accessories',
    description:
      'A vivid pink handbag shaped with layered crochet rose petals and a round peach-colored handle.',
    file: 'pink-rose-bag.webp',
    colors: ['Pink', 'Peach'],
  },
);
for (const product of products.slice(14)) {
  Object.assign(product, {
    price: 0,
    quantity: 0,
    active: false,
    bestSeller: false,
    newArrival: true,
  });
}

async function seed() {
  const prepared = products.map(({ file, ...fields }) => {
    const imageData = readFileSync(join(productsDir, file));
    if (imageData.byteLength > MAX_DOC_BYTES)
      throw new Error(`${file} exceeds the 700 KiB image limit.`);
    return { fields, imageData };
  });
  for (const key of ['id', 'slug', 'name']) {
    const identities = prepared.map(({ fields }) => normalizeIdentity(fields[key]));
    if (new Set(identities).size !== identities.length)
      throw new Error(`Duplicate ${key} in seed manifest.`);
  }
  if (process.argv.includes('--dry-run')) {
    console.log(
      `Local validation passed: ${prepared.length} products, all images under 700 KiB. No database access or writes.`,
    );
    console.log('P014: enhanced baby-set image. P015-P019: inactive drafts if missing.');
    return;
  }
  initAdminApp();
  const db = getFirestore(DATABASE_ID);
  console.log(`Seeding ${prepared.length} products into Firestore database "${DATABASE_ID}"...`);
  const result = await db.runTransaction(async (transaction) => {
    // Read and match the entire catalog before any writes. The transaction also
    // prevents concurrent seed runs from inserting duplicates under different IDs.
    const catalog = await transaction.get(db.collection('products'));
    const settingsRef = db.doc('siteSettings/public');
    const settings = await transaction.get(settingsRef);
    const documents = catalog.docs.map((doc) => ({ id: doc.id, data: doc.data(), ref: doc.ref }));
    const plan = prepared.map((item) => ({
      ...item,
      existing: matchProduct(item.fields, documents),
    }));
    const targets = plan.map((item) => item.existing?.id ?? item.fields.id);
    if (new Set(targets).size !== targets.length)
      throw new Error('Multiple seed entries resolve to the same catalog document.');
    if (!settings.exists) {
      transaction.create(settingsRef, {
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
      });
    }
    return plan.map(({ fields, imageData, existing }) => {
      const ref = existing?.ref ?? db.doc(`products/${fields.id}`);
      if (existing) {
        if (
          !Buffer.isBuffer(existing.data.imageData) ||
          !existing.data.imageData.equals(imageData) ||
          existing.data.imageContentType !== 'image/webp'
        ) {
          transaction.update(ref, {
            imageData,
            imageContentType: 'image/webp',
            modifiedAt: FieldValue.serverTimestamp(),
          });
        }
      } else {
        transaction.create(ref, {
          ...fields,
          active: fields.active ?? true,
          gallery: [],
          imageContentType: 'image/webp',
          imageData,
          createdAt: FieldValue.serverTimestamp(),
          modifiedAt: FieldValue.serverTimestamp(),
        });
      }
      return { ref, imageData, existing: !!existing };
    });
  });
  for (const { ref, imageData, existing } of result) {
    const saved = (await ref.get()).data();
    if (!Buffer.isBuffer(saved?.imageData) || !saved.imageData.equals(imageData)) {
      throw new Error(`Image read-back verification failed for ${ref.id}`);
    }
    console.log(
      `  ${ref.id}: ${existing ? 'matched existing product; catalog fields preserved' : 'created'}; image verified.`,
    );
  }
  console.log(
    `Done. ${result.filter((x) => !x.existing).length} created; ${result.filter((x) => x.existing).length} existing. New drafts need prices, stock and activation in /admin.`,
  );
}

try {
  await seed();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    message.includes('Could not load the default credentials')
      ? 'Firebase sign-in is required. Run npm run firebase:login, then npm run products:seed. You can also configure GOOGLE_APPLICATION_CREDENTIALS for an authorized service account.'
      : message,
  );
  process.exitCode = 1;
}
