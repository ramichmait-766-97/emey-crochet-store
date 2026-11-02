import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  Renderer2,
  inject,
} from '@angular/core';
import { IMAGE_PLACEHOLDER, imagePlaceholder } from '../../core/utils/product-image';

/** Low-resolution backdrop and bounded fallback; image geometry belongs to CSS. */
@Directive({ selector: 'img[appImageFallback]', standalone: true })
export class ImageFallbackDirective implements OnChanges {
  @Input() appImageFallback: string | null | undefined;
  private readonly image = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
  private readonly renderer = inject(Renderer2);
  ngOnChanges(): void {
    const placeholder = imagePlaceholder(this.appImageFallback ?? '');
    if (placeholder)
      this.renderer.setStyle(this.image, 'background-image', `url("${placeholder}")`);
    else this.loaded();
  }
  @HostListener('load') loaded(): void {
    this.renderer.removeStyle(this.image, 'background-image');
  }
  @HostListener('error') failed(): void {
    this.loaded();
    if (this.image.getAttribute('src') === IMAGE_PLACEHOLDER) return;
    this.renderer.removeAttribute(this.image, 'srcset');
    this.renderer.setAttribute(this.image, 'src', IMAGE_PLACEHOLDER);
  }
}
