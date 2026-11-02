import { Product } from '../models/product.model';
import { PRODUCT_CATEGORIES } from '../constants/store.constants';
import { CatalogQueryFilters } from '../../types/commerce.contracts';
export type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'new';
export interface CatalogFilters {
  collection: string;
  search: string;
  category: string;
  sort: SortOption;
}
export function catalogQueryFilters(filters: CatalogFilters): CatalogQueryFilters {
  const searchToken = filters.search.trim() || null;
  return {
    category: filters.category || null,
    searchToken,
    sortField: !searchToken && filters.sort.startsWith('price-') ? 'basePriceInCents' : 'title',
    sortDirection: !searchToken && filters.sort === 'price-desc' ? 'desc' : 'asc',
    limit: 12,
    collection:
      filters.collection === 'bestsellers'
        ? 'bestsellers'
        : filters.collection === 'new' || filters.sort === 'new'
          ? 'new'
          : null,
  };
}
export function parseCatalogFilters(params: { get(key: string): string | null }): CatalogFilters {
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'featured';
  return {
    collection: ['new', 'bestsellers'].includes(params.get('collection') ?? '')
      ? params.get('collection')!
      : '',
    search: (params.get('q') ?? '').slice(0, 200),
    category:
      PRODUCT_CATEGORIES.find((item) => item.toLowerCase() === category.toLowerCase()) ?? '',
    sort: ['featured', 'price-asc', 'price-desc', 'new'].includes(sort)
      ? (sort as SortOption)
      : 'featured',
  };
}
/** Legacy pure fixture helper; production discovery uses catalogQueryFilters. */
export function filterCatalog(products: Product[], filters: CatalogFilters): Product[] {
  const term = filters.search.trim().toLocaleLowerCase();
  return products
    .filter(
      (p) =>
        (filters.collection !== 'new' || p.newArrival) &&
        (filters.collection !== 'bestsellers' || p.bestSeller) &&
        (!filters.category || p.category === filters.category) &&
        (!term ||
          [p.name, p.description, p.category, ...p.colors]
            .join(' ')
            .toLocaleLowerCase()
            .includes(term)),
    )
    .sort((a, b) => {
      const rank =
        filters.sort === 'price-asc'
          ? a.price - b.price
          : filters.sort === 'price-desc'
            ? b.price - a.price
            : filters.sort === 'new'
              ? Number(b.newArrival) - Number(a.newArrival)
              : Number(b.bestSeller) - Number(a.bestSeller);
      return rank || a.name.localeCompare(b.name);
    });
}
