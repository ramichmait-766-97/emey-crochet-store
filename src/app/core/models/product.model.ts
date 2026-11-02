import { PRODUCT_CATEGORIES } from '../constants/store.constants';

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export interface ProductVariant {
  id: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  imageUrl?: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  description: string;
  price: number;
  quantity: number;
  imageUrl: string;
  imageFileId?: string;
  imageContentType?: string;
  imageData?: unknown;
  gallery: string[];
  variants?: ProductVariant[];
  inventoryVersion?: number;
  reservedUnits?: number;
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
  variantId?: string;
}
