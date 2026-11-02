import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { PRODUCT_CATEGORIES } from '../../core/constants/store.constants';
import { ProductService } from '../../core/services/product.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import { catalogQueryFilters, parseCatalogFilters } from '../../core/utils/catalog';
import { ProductCardSkeletonComponent } from '../../shared/components/product-card-skeleton/product-card-skeleton.component';

@Component({
  standalone: true,
  providers: [ProductService],
  imports: [FormsModule, RouterLink, ProductCardComponent, ProductCardSkeletonComponent],
  templateUrl: './shop.component.html',
  styleUrl: './shop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopComponent {
  readonly products = inject(ProductService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly categories = PRODUCT_CATEGORIES;
  private readonly filters = toSignal(this.route.queryParamMap.pipe(map(parseCatalogFilters)), {
    initialValue: parseCatalogFilters(this.route.snapshot.queryParamMap),
  });
  private readonly queryFilters = computed(() => catalogQueryFilters(this.filters()));
  readonly vm = computed(() => {
    const filters = this.filters();
    const request = this.queryFilters();
    const current = this.products.matchesFilters(request);
    return {
      ...filters,
      collection: request.collection ?? '',
      sort: request.searchToken && filters.sort.startsWith('price-') ? 'featured' : filters.sort,
      loading: !current || this.products.isLoading(),
      error: current ? this.products.error() : '',
      items: current ? this.products.displayProducts() : [],
      hasMore: current && this.products.hasMorePages(),
      rejected: current ? this.products.rejectedProducts() : 0,
    };
  });
  constructor() {
    effect((onCleanup) => {
      const filters = this.queryFilters();
      // Coalesce typing; changing the URL immediately hides mismatched old rows.
      const timer = setTimeout(
        () =>
          untracked(() => {
            void this.products.fetchNextPage(filters, true);
          }),
        filters.searchToken ? 250 : 0,
      );
      onCleanup(() => clearTimeout(timer));
    });
  }
  loadMore(): void {
    void this.products.fetchNextPage(this.queryFilters(), false);
  }
  retry(): void {
    void this.products.fetchNextPage(
      this.queryFilters(),
      this.products.catalogPage().lastVisibleId === null,
    );
  }
  reloadCatalog(): void {
    window.location.reload();
  }
  setFilter(key: string, value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        [key]: value || null,
        ...(key === 'q' && value.trim() && this.filters().sort.startsWith('price-')
          ? { sort: 'featured' }
          : {}),
      },
      queryParamsHandling: 'merge',
      replaceUrl: key === 'q',
    });
  }
  clear(): void {
    void this.router.navigate(['/shop']);
  }
}
