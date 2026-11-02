import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../core/services/product.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import { ProductCardSkeletonComponent } from '../../shared/components/product-card-skeleton/product-card-skeleton.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { DEFAULT_CATALOG_FILTERS } from '../../types/commerce.contracts';

@Component({
  standalone: true,
  providers: [ProductService],
  imports: [RouterLink, ProductCardComponent, ProductCardSkeletonComponent, ImageFallbackDirective],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  reloadCatalog(): void {
    window.location.reload();
  }
  readonly products = inject(ProductService);
  readonly settings = inject(SiteSettingsService);
  constructor() {
    this.refresh();
  }
  refresh(): void {
    void this.products.fetchNextPage({ ...DEFAULT_CATALOG_FILTERS, limit: 8 }, true);
  }
}
