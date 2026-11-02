import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product } from '../../../core/models/product.model';
import { ProductImagePipe } from '../../pipes/product-image.pipe';
import { CartService } from '../../../core/services/cart.service';
import { SiteSettingsService } from '../../../core/services/site-settings.service';
import { ImageKitPipe, ImageKitSrcsetPipe } from '../../pipes/imagekit.pipe';
import { ImageFallbackDirective } from '../../directives/image-fallback.directive';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    RouterLink,
    ProductImagePipe,
    ImageKitPipe,
    ImageKitSrcsetPipe,
    ImageFallbackDirective,
  ],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  readonly product = input.required<Product>();
  readonly sizes = input(
    '(max-width: 360px) calc(100vw - 24px), (max-width: 560px) calc((100vw - 37px) / 2), (max-width: 720px) calc((100vw - 53px) / 2), (max-width: 1000px) calc((100vw - 92px) / 3), (max-width: 1280px) calc((100vw - 117px) / 4), 291px',
  );
  readonly eager = input(false);
  readonly cart = inject(CartService);
  readonly settings = inject(SiteSettingsService);
}
