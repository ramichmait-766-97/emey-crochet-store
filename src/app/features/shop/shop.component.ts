import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest, map } from 'rxjs';
import { PRODUCT_CATEGORIES } from '../../core/constants/store.constants';
import { ProductService } from '../../core/services/product.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import { filterCatalog, parseCatalogFilters } from '../../core/utils/catalog';

@Component({
  standalone: true,
  imports: [AsyncPipe, FormsModule, RouterLink, ProductCardComponent],
  templateUrl: './shop.component.html',
  styleUrl: './shop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopComponent {
  readonly products = inject(ProductService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly categories = PRODUCT_CATEGORIES;
  readonly vm$ = combineLatest([this.products.state$, this.route.queryParamMap]).pipe(
    map(([state, params]) => {
      const filters = parseCatalogFilters(params);
      return { ...state, ...filters, items: filterCatalog(state.products, filters) };
    }),
  );
  setFilter(key: string, value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: value || null },
      queryParamsHandling: 'merge',
      replaceUrl: key === 'q',
    });
  }
  clear(): void {
    void this.router.navigate(['/shop']);
  }
}
