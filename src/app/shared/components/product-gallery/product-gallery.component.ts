import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ImageKitPipe, ImageKitSrcsetPipe } from '../../pipes/imagekit.pipe';
import { ImageFallbackDirective } from '../../directives/image-fallback.directive';

@Component({
  selector: 'app-product-gallery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImageKitPipe, ImageKitSrcsetPipe, ImageFallbackDirective],
  styles: ':host { display: block; }',
  template: `
    <div class="product-gallery" aria-label="Product photos">
      <button
        class="gallery-tile"
        type="button"
        (click)="selectedImage.emit('')"
        [attr.aria-pressed]="!selected()"
      >
        Main photo
      </button>
      @for (photo of photos(); track photo) {
        <button
          class="gallery-tile"
          type="button"
          (click)="selectedImage.emit(photo)"
          [attr.aria-pressed]="selected() === photo"
        >
          <img
            [src]="photo | imagekit: { width: 128 }"
            [attr.srcset]="photo | imagekitSrcset: [80, 160, 240]"
            sizes="65px"
            width="65"
            height="65"
            [appImageFallback]="photo"
            [alt]="productName() + ' additional view'"
            loading="lazy"
            decoding="async"
          />
        </button>
      }
    </div>
  `,
})
export class ProductGalleryComponent {
  readonly photos = input.required<readonly string[]>();
  readonly productName = input.required<string>();
  readonly selected = input('');
  readonly selectedImage = output<string>();
}
