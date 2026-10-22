import { PRODUCT_CATEGORIES } from '../constants/store.constants';

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  description: string;
  price: number;
  quantity: number;
  imageUrl: string;
  imageContentType?: string;
  imageData?: unknown;
  gallery: string[];
  colors: string[];
  bestSeller: boolean;
  newArrival: boolean;
  active: boolean;
  createdAt?: unknown;
  modifiedAt?: unknown;
}

export interface CartLine {
  product: Product;
  quantity: number;
}
