import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-product-card-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../product-card/product-card.component.scss',
  template: `
    <article aria-hidden="true">
      <div class="image skeleton-shimmer"></div>
      <div class="meta"><div class="skeleton-shimmer skeleton-copy"></div></div>
      <div class="add skeleton-shimmer"></div>
    </article>
  `,
})
export class ProductCardSkeletonComponent {}
