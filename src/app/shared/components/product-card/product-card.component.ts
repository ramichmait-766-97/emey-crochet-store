import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product } from '../../../core/models/product.model';
import { ProductImagePipe } from '../../pipes/product-image.pipe';
import { CartService } from '../../../core/services/cart.service';
import { SiteSettingsService } from '../../../core/services/site-settings.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, RouterLink, ProductImagePipe],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  readonly product = input.required<Product>();
  readonly cart = inject(CartService);
  readonly settings = inject(SiteSettingsService);
}
