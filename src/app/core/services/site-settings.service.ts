import { docData } from '../utils/firestore-streams';
import { FirebaseService } from './firebase.service';
import { Injectable, inject, signal } from '@angular/core';
import { doc } from 'firebase/firestore';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { DEFAULT_SITE_SETTINGS } from '../constants/store.constants';
import { ContactMethod, SiteSettings } from '../models/site-settings.model';

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private readonly firestore = inject(FirebaseService).firestore;
  readonly loadError = signal(false);

  readonly settings$ = this.createSettingsStream();

  get(): Observable<SiteSettings> {
    return this.settings$;
  }

  contact(type: ContactMethod['type']): Observable<ContactMethod | undefined> {
    return this.settings$.pipe(
      map((settings) => settings.contacts.find((item) => item.type === type && item.enabled)),
    );
  }

  private createSettingsStream(): Observable<SiteSettings> {
    return (docData(doc(this.firestore, 'siteSettings/public')) as Observable<SiteSettings>).pipe(
      map((settings) => {
        this.loadError.set(false);
        return { ...DEFAULT_SITE_SETTINGS, ...settings, contacts: settings?.contacts ?? [] };
      }),
      catchError(() => {
        this.loadError.set(true);
        return of({ ...DEFAULT_SITE_SETTINGS, contacts: [] });
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
