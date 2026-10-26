import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseService } from './firebase.service';

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
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Image upload failed. Please try again.');
    if (
      typeof result.imageUrl !== 'string' ||
      !result.imageUrl.startsWith(environment.images.urlEndpoint + '/') ||
      typeof result.imageFileId !== 'string'
    ) {
      throw new Error('Image hosting returned an unexpected response.');
    }
    return result;
  }
}
