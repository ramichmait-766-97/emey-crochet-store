import { Pipe, PipeTransform } from '@angular/core';
import { Product } from '../../core/models/product.model';
import { imageDeliveryUrl, productImageSrc } from '../../core/utils/product-image';

@Pipe({
  name: 'productImage',
  standalone: true,
})
export class ProductImagePipe implements PipeTransform {
  transform(product: Product | null | undefined, width = 1200): string {
    return product ? imageDeliveryUrl(productImageSrc(product), width) : '';
  }
}
