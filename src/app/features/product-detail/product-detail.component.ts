import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { combineLatest, map, tap } from 'rxjs';
import { CartService } from '../../core/services/cart.service';
import { ProductImagePipe } from '../../shared/pipes/product-image.pipe';
import { ProductService } from '../../core/services/product.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';

@Component({
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, RouterLink, ProductImagePipe],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailComponent {
  private readonly title = inject(Title);
  private readonly route = inject(ActivatedRoute);
  private readonly products = inject(ProductService);
  readonly cart = inject(CartService);
  readonly settings = inject(SiteSettingsService);

  readonly viewModel$ = combineLatest([
    this.products.state$,
    this.route.paramMap,
    this.settings.settings$,
  ]).pipe(
    map(([state, params, site]) => ({
      ...state,
      site,
      product: state.products.find((product) => product.slug === params.get('slug')),
    })),
    tap((vm) => {
      if (vm.product) this.title.setTitle(`${vm.product.name} · Emey Crochet Store`);
    }),
  );
  retry(): void {
    this.products.refresh();
  }
}
