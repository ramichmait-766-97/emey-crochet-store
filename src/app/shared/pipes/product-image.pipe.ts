import { Pipe, PipeTransform } from '@angular/core';
import { Product } from '../../core/models/product.model';
import { productImageSrc } from '../../core/utils/product-image';

@Pipe({
  name: 'productImage',
  standalone: true,
})
export class ProductImagePipe implements PipeTransform {
  transform(product: Product | null | undefined): string {
    return product ? productImageSrc(product) : '';
  }
}
