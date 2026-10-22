import { Injectable, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  OAuthProvider,
  User,
  authState,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from '@angular/fire/auth';
import { Firestore, doc, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Observable, from, map, of, shareReplay, switchMap } from 'rxjs';
import { StoreRole, StoreUser } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);

  readonly firebaseUser$ = authState(this.auth).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly user$: Observable<StoreUser | null> = this.firebaseUser$.pipe(
    switchMap((firebaseUser) => {
      if (!firebaseUser) {
        return of(null);
      }

      return from(getIdTokenResult(firebaseUser)).pipe(
        map((token): StoreUser => {
          const role: StoreRole = token.claims['admin'] === true ? 'admin' : 'user';

          return {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName ?? this.fallbackDisplayName(firebaseUser),
            role,
          };
        }),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  async login(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email.trim(), password);
  }

  async register(email: string, password: string) {
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    await this.ensureProfile(credential.user);
    return credential;
  }

  async loginWithGoogle() {
    const credential = await signInWithPopup(this.auth, new GoogleAuthProvider());
    await this.ensureProfile(credential.user);
    return credential;
  }

  async loginWithApple() {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');

    const credential = await signInWithPopup(this.auth, provider);
    await this.ensureProfile(credential.user);
    return credential;
  }

  logout() {
    return signOut(this.auth);
  }

  private async ensureProfile(user: User): Promise<void> {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const existing = await getDoc(userRef);
    const displayName = user.displayName ?? this.fallbackDisplayName(user);

    if (!existing.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName,
        createdAt: serverTimestamp(),
        modifiedAt: serverTimestamp(),
      });
      return;
    }

    await setDoc(
      userRef,
      {
        email: user.email,
        displayName,
        modifiedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  private fallbackDisplayName(user: User): string {
    return user.email?.split('@')[0] ?? 'Customer';
  }
}
