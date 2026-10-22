import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { ProfileService } from '../../core/services/profile.service';
import { CustomerProfile, emptyProfile } from '../../core/models/profile.model';
import { StoreUser } from '../../core/models/user.model';

@Component({
  standalone: true,
  imports: [AsyncPipe, FormsModule, RouterLink],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent {
  readonly auth = inject(AuthService);
  readonly settings = inject(SiteSettingsService);
  private readonly profiles = inject(ProfileService);
  private readonly destroyRef = inject(DestroyRef);
  readonly user = signal<StoreUser | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly securityBusy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly verified = signal(false);
  readonly loadFailed = signal(false);
  profile: CustomerProfile = emptyProfile();
  private loadedUid: string | null = null;

  constructor() {
    this.auth.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((user) => {
      this.user.set(user);
      if (user && user.uid !== this.loadedUid) {
        this.loadedUid = user.uid;
        void this.load(user);
      }
    });
    this.auth.firebaseUser$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((user) => {
      this.verified.set(user?.emailVerified ?? false);
    });
  }

  async retry(): Promise<void> {
    const user = this.user();
    if (user && !this.loading() && !this.saving()) await this.load(user);
  }

  private async load(user: StoreUser): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.loadFailed.set(false);
    try {
      this.profile = await this.profiles.load(user);
    } catch {
      this.loadFailed.set(true);
      this.error.set('We could not load your profile. Check your connection and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    const user = this.user();
    if (!user || this.saving() || this.loadFailed()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.profiles.save(user, this.profile);
      this.notice.set('Your profile and preferences have been saved.');
    } catch {
      this.error.set('We could not save your profile. Check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async security(action: 'password' | 'verify' | 'refresh'): Promise<void> {
    if (this.securityBusy()) return;
    this.securityBusy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      if (action === 'password') {
        await this.auth.resetPassword(this.user()?.email ?? '');
        this.notice.set('Password reset requested. Check your inbox and spam folder.');
      } else if (action === 'verify') {
        await this.auth.verifyEmail();
        this.notice.set('Verification email sent. Open its link, then select Check verification.');
      } else {
        await this.auth.refreshSession();
        this.notice.set(
          this.verified()
            ? 'Your email is verified.'
            : 'Your email is not verified yet. Check your inbox.',
        );
      }
    } catch {
      this.error.set('Unable to complete this request. Please wait a moment and try again.');
    } finally {
      this.securityBusy.set(false);
    }
  }
}
