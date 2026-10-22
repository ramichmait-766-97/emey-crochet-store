import { FirebaseService } from './firebase.service';
import { Injectable, inject } from '@angular/core';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CustomerProfile, emptyProfile } from '../models/profile.model';
import { StoreUser } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly firestore = inject(FirebaseService).firestore;

  async load(user: StoreUser): Promise<CustomerProfile> {
    const data = (await getDoc(doc(this.firestore, `users/${user.uid}`))).data();
    const defaults = emptyProfile();
    return {
      displayName: data?.['displayName'] ?? user.displayName ?? '',
      phone: data?.['phone'] ?? '',
      billing: { ...defaults.billing, ...data?.['billing'] },
      notifications: { ...defaults.notifications, ...data?.['notifications'] },
    };
  }

  async save(user: StoreUser, profile: CustomerProfile): Promise<void> {
    if (!profile.displayName.trim()) throw new Error('Your name is required.');
    const billing = Object.fromEntries(
      Object.entries(profile.billing).map(([key, value]) => [key, value.trim()]),
    );
    await setDoc(
      doc(this.firestore, `users/${user.uid}`),
      {
        uid: user.uid,
        email: user.email,
        displayName: profile.displayName.trim(),
        phone: profile.phone.trim(),
        billing,
        notifications: {
          orderUpdates: !!profile.notifications.orderUpdates,
          emailOffers: !!profile.notifications.emailOffers,
        },
        notificationPreferencesUpdatedAt: serverTimestamp(),
        modifiedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
}
