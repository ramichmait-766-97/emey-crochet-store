import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, combineLatest, map, of, startWith, switchMap, tap } from 'rxjs';
import { CartService } from '../../core/services/cart.service';
import { ProductImagePipe } from '../../shared/pipes/product-image.pipe';
import { ProductService } from '../../core/services/product.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { Product } from '../../core/models/product.model';
import { ImageKitPipe, ImageKitSrcsetPipe } from '../../shared/pipes/imagekit.pipe';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { ProductGalleryComponent } from '../../shared/components/product-gallery/product-gallery.component';

@Component({
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    RouterLink,
    ProductImagePipe,
    FormsModule,
    ImageKitPipe,
    ImageKitSrcsetPipe,
    ImageFallbackDirective,
    ProductGalleryComponent,
  ],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailComponent {
  reloadGallery(): void {
    window.location.reload();
  }
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
  private readonly reload$ = new Subject<void>();
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
    combineLatest([this.route.paramMap, this.reload$.pipe(startWith(undefined))]).pipe(
      switchMap(([params]) =>
        this.products.watchBySlug(params.get('slug') ?? '').pipe(
          map((product) => ({ product, loading: false, error: '' })),
          startWith({ product: undefined, loading: true, error: '' }),
          catchError(() =>
            of({
              product: undefined,
              loading: false,
              error: 'This piece could not load. Please retry or contact the store.',
            }),
          ),
        ),
      ),
    ),
    this.settings.settings$,
  ]).pipe(
    map(([state, site]) => ({
      ...state,
      site,
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
    this.reload$.next();
  }
}
