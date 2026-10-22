import { Injectable, inject, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  OAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onIdTokenChanged,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Observable, from, map, of, shareReplay, switchMap } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { StoreRole, StoreUser } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebase = inject(FirebaseService);
  readonly ready = signal(false);
  readonly firebaseUser$ = new Observable<User | null>((subscriber) =>
    onIdTokenChanged(
      this.firebase.auth,
      (user) => {
        this.ready.set(true);
        subscriber.next(user);
      },
      (error) => subscriber.error(error),
    ),
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly user$: Observable<StoreUser | null> = this.firebaseUser$.pipe(
    switchMap((user) =>
      !user
        ? of(null)
        : from(getIdTokenResult(user)).pipe(
            map((token): StoreUser => ({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || this.displayName(user),
              role: token.claims['admin'] === true ? 'admin' : 'user',
            })),
          ),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  async login(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(this.firebase.auth, email.trim(), password);
    await getIdTokenResult(credential.user, true);
    return credential;
  }
  async register(email: string, password: string) {
    const credential = await createUserWithEmailAndPassword(
      this.firebase.auth,
      email.trim(),
      password,
    );
    await this.ensureProfile(credential.user);
    return credential;
  }
  async loginWithGoogle() {
    const credential = await signInWithPopup(this.firebase.auth, new GoogleAuthProvider());
    await this.ensureProfile(credential.user);
    return credential;
  }
  async loginWithApple() {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    const credential = await signInWithPopup(this.firebase.auth, provider);
    await this.ensureProfile(credential.user);
    return credential;
  }
  logout() {
    return signOut(this.firebase.auth);
  }
  resetPassword(email: string) {
    return sendPasswordResetEmail(this.firebase.auth, email.trim());
  }
  async verifyEmail(): Promise<void> {
    const user = this.firebase.auth.currentUser;
    if (!user) throw new Error('Please sign in again.');
    await sendEmailVerification(user);
  }
  async refreshSession(): Promise<void> {
    await this.firebase.auth.currentUser?.reload();
    await this.firebase.auth.currentUser?.getIdToken(true);
  }
  async currentRole(): Promise<StoreRole> {
    const user = this.firebase.auth.currentUser;
    if (!user) throw new Error('Please sign in again.');
    return (await getIdTokenResult(user)).claims['admin'] === true ? 'admin' : 'user';
  }
  private async ensureProfile(user: User): Promise<void> {
    const ref = doc(this.firebase.firestore, `users/${user.uid}`);
    if (!(await getDoc(ref)).exists())
      await setDoc(ref, {
        uid: user.uid,
        email: user.email,
        displayName: this.displayName(user),
        createdAt: serverTimestamp(),
        modifiedAt: serverTimestamp(),
      });
  }
  private displayName(user: User): string {
    return user.displayName || user.email?.split('@')[0] || 'Customer';
  }
}
