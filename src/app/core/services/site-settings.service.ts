import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DEFAULT_SITE_SETTINGS } from '../constants/store.constants';
import { ContactMethod, SiteSettings } from '../models/site-settings.model';

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private readonly firestore = inject(Firestore);

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
    if (environment.demoMode) {
      return of(DEFAULT_SITE_SETTINGS);
    }

    return (docData(doc(this.firestore, 'siteSettings/public')) as Observable<SiteSettings>).pipe(
      map((settings) => ({ ...DEFAULT_SITE_SETTINGS, ...settings })),
      catchError(() => of(DEFAULT_SITE_SETTINGS)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
