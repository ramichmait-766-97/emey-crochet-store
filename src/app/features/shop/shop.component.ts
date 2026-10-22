import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { PRODUCT_CATEGORIES } from '../../core/constants/store.constants';
import { ProductService } from '../../core/services/product.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'new';

@Component({
  standalone: true,
  imports: [AsyncPipe, FormsModule, ProductCardComponent],
  templateUrl: './shop.component.html',
  styleUrl: './shop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopComponent {
  private readonly products = inject(ProductService);
  private readonly route = inject(ActivatedRoute);

  readonly categories = PRODUCT_CATEGORIES;
  readonly search$ = new BehaviorSubject('');
  readonly category$ = new BehaviorSubject(this.route.snapshot.queryParamMap.get('category') ?? '');
  readonly sort$ = new BehaviorSubject<SortOption>(
    (this.route.snapshot.queryParamMap.get('sort') as SortOption | null) ?? 'featured',
  );

  search = '';
  category = this.category$.value;
  sort = this.sort$.value;

  readonly filtered$ = combineLatest([
    this.products.list(),
    this.search$,
    this.category$,
    this.sort$,
  ]).pipe(
    map(([products, search, category, sort]) => {
      const term = search.trim().toLowerCase();
      const filtered = products.filter((product) => {
        const matchesSearch =
          !term || `${product.name} ${product.description}`.toLowerCase().includes(term);
        const matchesCategory = !category || product.category === category;
        return matchesSearch && matchesCategory;
      });

      return [...filtered].sort((a, b) => {
        switch (sort) {
          case 'price-asc':
            return a.price - b.price;
          case 'price-desc':
            return b.price - a.price;
          case 'new':
            return Number(b.newArrival) - Number(a.newArrival);
          default:
            return Number(b.bestSeller) - Number(a.bestSeller);
        }
      });
    }),
  );

  setSearch(value: string): void {
    this.search$.next(value);
  }

  setCategory(value: string): void {
    this.category$.next(value);
  }

  setSort(value: SortOption): void {
    this.sort$.next(value);
  }
}
