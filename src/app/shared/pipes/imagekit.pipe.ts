import { Pipe, PipeTransform } from '@angular/core';
import { ImageKitOptions, imageDeliveryUrl, imageSrcset } from '../../core/utils/product-image';
export type { ImageKitOptions } from '../../core/utils/product-image';

@Pipe({ name: 'imagekit', standalone: true, pure: true })
export class ImageKitPipe implements PipeTransform {
  transform(url: string | null | undefined, options: ImageKitOptions): string {
    return imageDeliveryUrl(url ?? '', options.width, options.quality ?? 80, options.blur ?? false);
  }
}

@Pipe({ name: 'imagekitSrcset', standalone: true, pure: true })
export class ImageKitSrcsetPipe implements PipeTransform {
  transform(url: string | null | undefined, widths: readonly number[]): string | null {
    return imageSrcset(url ?? '', widths);
  }
}
