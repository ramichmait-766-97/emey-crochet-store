import { Injectable, inject } from '@angular/core';
import { doc, getDocFromServer } from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { CheckoutSettings } from '../models/commerce.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CommerceService {
  private readonly firebase = inject(FirebaseService);
  readonly configured = !!environment.commerce.apiUrl;
  async settings(): Promise<CheckoutSettings | null> {
    const snapshot = await getDocFromServer(
      doc(this.firebase.firestore, 'store_settings/checkout'),
    );
    return snapshot.exists() ? (snapshot.data() as CheckoutSettings) : null;
  }
  async call<T>(path: string, data: unknown): Promise<T> {
    if (!this.configured)
      throw new Error('Online order reservations are not available yet. Please contact the store.');
    await this.firebase.auth.authStateReady();
    const token = await this.firebase.auth.currentUser?.getIdToken();
    const response = await fetch(`${environment.commerce.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(30000),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || 'Unable to complete this request. Please retry.');
    return result as T;
  }
  newKey(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  }
}
