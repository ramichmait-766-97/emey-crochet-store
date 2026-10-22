import { Injectable } from '@angular/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

/** One SDK, app and named database for every feature. Never mix SDK instances. */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app = getApps().length ? getApp() : initializeApp(environment.firebase);
  readonly auth = getAuth(this.app);
  readonly firestore = getFirestore(this.app, environment.firestoreDatabase);
}
