import { Product } from '../models/product.model';

type SeedProduct = Omit<Product, 'gallery' | 'colors'> & {
  gallery?: string[];
  colors?: string[];
};

const product = (value: SeedProduct): Product => ({
  ...value,
  gallery: value.gallery ?? [value.imageUrl],
  colors: value.colors ?? [],
});

export const SEED_PRODUCTS: Product[] = [
  product({ id: 'P001', slug: 'red-crop-top-shorts-set', name: 'Crochet Crop Top & Shorts Set', category: 'Apparel', description: 'A bold two-piece crochet set with airy hand-worked texture.', price: 48, quantity: 3, imageUrl: 'assets/products/red-crop-set.webp', colors: ['Red'], bestSeller: true, newArrival: false, active: true }),
  product({ id: 'P002', slug: 'granny-square-chair-throw', name: 'Granny-Square Chair Throw', category: 'Home Decor', description: 'Warm geometric granny squares designed to bring a handcrafted accent to your space.', price: 62, quantity: 2, imageUrl: 'assets/products/granny-chair-throw.webp', colors: ['Orange', 'Olive', 'Brown'], bestSeller: false, newArrival: false, active: true }),
  product({ id: 'P003', slug: 'multicolor-crochet-runner', name: 'Multicolor Crochet Runner', category: 'Home Decor', description: 'A cheerful color-blocked runner finished with decorative blue edging.', price: 38, quantity: 4, imageUrl: 'assets/products/multicolor-runner.webp', colors: ['Multicolor'], bestSeller: false, newArrival: true, active: true }),
  product({ id: 'P004', slug: 'sunflower-drawstring-bag', name: 'Sunflower Drawstring Bag', category: 'Bags & Accessories', description: 'A soft cream drawstring bag composed from sunflower granny squares.', price: 44, quantity: 5, imageUrl: 'assets/products/sunflower-bag.webp', colors: ['Cream', 'Yellow', 'Green'], bestSeller: true, newArrival: true, active: true }),
  product({ id: 'P005', slug: 'royal-blue-frame-handbag', name: 'Royal Blue Frame Handbag', category: 'Bags & Accessories', description: 'Structured crochet handbag with a vintage-inspired metal frame closure.', price: 58, quantity: 2, imageUrl: 'assets/products/royal-blue-frame-bag.webp', colors: ['Royal Blue'], bestSeller: true, newArrival: false, active: true }),
  product({ id: 'P006', slug: 'cream-child-dress', name: 'Cream Crochet Child Dress', category: 'Apparel', description: 'Delicate cream crochet dress with a round yoke and scalloped hem.', price: 52, quantity: 2, imageUrl: 'assets/products/cream-child-dress.webp', colors: ['Cream'], bestSeller: false, newArrival: true, active: true }),
  product({ id: 'P007', slug: 'white-pinafore-dress', name: 'White Crochet Pinafore Dress', category: 'Apparel', description: 'Light sleeveless crochet dress with a graceful flared skirt.', price: 50, quantity: 2, imageUrl: 'assets/products/white-pinafore-dress.webp', colors: ['White'], bestSeller: false, newArrival: true, active: true }),
  product({ id: 'P008', slug: 'taupe-flower-dress', name: 'Taupe Flower-Appliqué Dress', category: 'Apparel', description: 'A soft taupe crochet dress accented by a handcrafted flower at the waist.', price: 54, quantity: 1, imageUrl: 'assets/products/taupe-flower-dress.webp', colors: ['Taupe', 'Cream'], bestSeller: true, newArrival: false, active: true }),
  product({ id: 'P009', slug: 'yellow-child-dress', name: 'Yellow Crochet Child Dress', category: 'Apparel', description: 'A sunny yellow crochet dress with a textured openwork skirt.', price: 52, quantity: 3, imageUrl: 'assets/products/yellow-child-dress.webp', colors: ['Yellow'], bestSeller: false, newArrival: true, active: true }),
  product({ id: 'P010', slug: 'geometric-crochet-blanket', name: 'Geometric Crochet Blanket', category: 'Home Decor', description: 'Dimensional cube motifs in warm rust, cream and brown with a tasseled edge.', price: 92, quantity: 1, imageUrl: 'assets/products/geometric-blanket.webp', colors: ['Rust', 'Cream', 'Brown'], bestSeller: true, newArrival: false, active: true }),
  product({ id: 'P011', slug: 'flower-leaf-keychains', name: 'Flower & Leaf Keychains', category: 'Keychains', description: 'Playful flower-and-leaf keychains available in a range of soft and bright colors.', price: 12, quantity: 20, imageUrl: 'assets/products/flower-keychains.webp', colors: ['Pink', 'White', 'Orange', 'Red', 'Yellow', 'Blue', 'Lavender'], bestSeller: true, newArrival: true, active: true }),
  product({ id: 'P012', slug: 'purple-openwork-cardigan', name: 'Purple Openwork Long Cardigan', category: 'Apparel', description: 'An elegant long crochet layer with an airy lattice stitch and flowing silhouette.', price: 74, quantity: 2, imageUrl: 'assets/products/purple-cardigan.webp', colors: ['Purple'], bestSeller: false, newArrival: false, active: true }),
  product({ id: 'P013', slug: 'multicolor-v-stitch-pouch', name: 'Multicolor V-Stitch Pouch', category: 'Bags & Accessories', description: 'Compact wristlet pouch with colorful V-stitch accents and a button closure.', price: 28, quantity: 6, imageUrl: 'assets/products/v-stitch-pouch.webp', colors: ['Cream', 'Multicolor'], bestSeller: false, newArrival: true, active: true }),
  product({ id: 'P014', slug: 'white-red-baby-set', name: 'White & Red Baby Dress Set', category: 'Apparel', description: 'A charming white crochet dress with red trim, waist tie and matching crochet shoes.', price: 56, quantity: 2, imageUrl: 'assets/products/white-red-baby-set.webp', colors: ['White', 'Red'], bestSeller: true, newArrival: false, active: true }),
];
