import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { combineLatest, map, tap } from 'rxjs';
import { CartService } from '../../core/services/cart.service';
import { ProductImagePipe } from '../../shared/pipes/product-image.pipe';
import { ProductService } from '../../core/services/product.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { Product } from '../../core/models/product.model';

@Component({
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, RouterLink, ProductImagePipe, FormsModule],
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
  selectedVariant = '';
  selectedImage = '';
  optionImage(product: Product): string {
    return product.variants?.find((item) => item.id === this.selectedVariant)?.imageUrl || '';
  }
  private productId = '';
  available(product: Product): number {
    return this.cart.available({
      product,
      quantity: 1,
      variantId: this.selectedVariant || undefined,
    });
  }
  unitPrice(product: Product): number {
    return this.cart.unitPrice({
      product,
      quantity: 1,
      variantId: this.selectedVariant || undefined,
    });
  }

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
      if (vm.product?.id !== this.productId) {
        this.productId = vm.product?.id || '';
        this.selectedVariant = '';
        this.selectedImage = '';
      }
      if (vm.product) this.title.setTitle(`${vm.product.name} · Emey Crochet Store`);
    }),
  );
  retry(): void {
    this.products.refresh();
  }
}
