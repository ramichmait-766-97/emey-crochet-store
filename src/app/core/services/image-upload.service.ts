import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseService } from './firebase.service';
import { imageKitUrl, record, text } from '../../types/commerce.contracts';

@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private readonly firebase = inject(FirebaseService);

  async upload(
    file: File,
    productId: string,
  ): Promise<{
    imageUrl: string;
    imageFileId: string;
    imageContentType: string;
  }> {
    const workerUrl: string = environment.images.uploadWorkerUrl;
    if (!workerUrl)
      throw new Error(
        'Image uploads are not configured yet. Please finish the image hosting setup.',
      );
    if (
      !['image/webp', 'image/jpeg', 'image/png'].includes(file.type) ||
      !file.size ||
      file.size > 5 * 1024 * 1024
    ) {
      throw new Error('Choose a WebP, JPG or PNG image up to 5 MB.');
    }
    const user = this.firebase.auth.currentUser;
    if (!user) throw new Error('Please sign in again.');
    const token = await user.getIdTokenResult();
    if (token.claims['admin'] !== true) throw new Error('Administrator access is required.');
    const body = new FormData();
    body.set('file', file);
    body.set('productId', productId);
    const response = await fetch(`${workerUrl.replace(/\/$/, '')}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.token}` },
      body,
      signal: AbortSignal.timeout(60000),
    });
    const result = record(await response.json());
    if (!response.ok)
      throw new Error(
        typeof result['error'] === 'string'
          ? text(result['error'])
          : 'Image upload failed. Please try again.',
      );
    const imageContentType = text(result['imageContentType'], 20);
    if (!['image/webp', 'image/jpeg', 'image/png'].includes(imageContentType))
      throw new Error('Invalid hosted image type.');
    return {
      imageUrl: imageKitUrl(result['imageUrl']),
      imageFileId: text(result['imageFileId'], 256),
      imageContentType,
    };
  }
}
