import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { combineLatest, map, switchMap } from 'rxjs';
import { CartService } from '../../core/services/cart.service';
import { ProductService } from '../../core/services/product.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';

@Component({
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, RouterLink],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly products = inject(ProductService);
  readonly cart = inject(CartService);
  readonly settings = inject(SiteSettingsService);

  readonly viewModel$ = combineLatest([
    this.route.paramMap.pipe(
      switchMap((params) => this.products.bySlug(params.get('slug') ?? '')),
    ),
    this.settings.settings$,
  ]).pipe(map(([product, site]) => ({ product, site })));
}
