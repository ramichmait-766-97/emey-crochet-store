import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { firstValueFrom, filter, timeout } from 'rxjs';
import { loginDestination } from '../../core/utils/auth-navigation';

type AuthMode = 'login' | 'register';

@Component({
  standalone: true,
  imports: [AsyncPipe, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  readonly settings = inject(SiteSettingsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  mode: AuthMode = 'login';
  email = '';
  password = '';
  confirmation = '';
  notice = '';
  busy = false;
  error = '';

  async submit(): Promise<void> {
    if (
      !this.email.trim() ||
      !this.password ||
      (this.mode === 'register' && this.password !== this.confirmation)
    ) {
      this.error =
        this.mode === 'register'
          ? 'Enter your email and matching passwords.'
          : 'Enter your email and password.';
      return;
    }
    await this.runAuth(async () => {
      if (this.mode === 'login') {
        await this.auth.login(this.email, this.password);
      } else {
        await this.auth.register(this.email, this.password);
      }
    });
  }

  async google(): Promise<void> {
    await this.runAuth(() => this.auth.loginWithGoogle());
  }

  async apple(): Promise<void> {
    await this.runAuth(() => this.auth.loginWithApple());
  }

  toggleMode(): void {
    this.mode = this.mode === 'login' ? 'register' : 'login';
    this.error = '';
    this.notice = '';
    this.password = '';
    this.confirmation = '';
  }

  async resetPassword(): Promise<void> {
    if (this.busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error = 'Enter your email address above first.';
      return;
    }
    this.busy = true;
    this.error = '';
    this.notice = '';
    try {
      await this.auth.resetPassword(this.email);
      this.notice =
        'If an account exists for this email, a password reset link will be sent. Check your inbox and spam folder.';
    } catch (error) {
      this.error = this.friendlyError(error);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  private async runAuth(action: () => Promise<unknown>): Promise<void> {
    if (this.busy) {
      return;
    }

    this.busy = true;
    this.error = '';
    this.notice = '';

    try {
      await action();
      const role = await this.auth.currentRole();
      const user = await firstValueFrom(
        this.auth.user$.pipe(
          filter((user) => !!user && user.role === role),
          timeout(15000),
        ),
      );
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      this.password = '';
      this.confirmation = '';
      await this.router.navigateByUrl(loginDestination(user!.role, returnUrl));
    } catch (error) {
      this.error = this.friendlyError(error);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  private friendlyError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('auth/invalid-credential')) return 'The email or password is incorrect.';
    if (message.includes('auth/email-already-in-use'))
      return 'An account already exists for this email.';
    if (message.includes('auth/weak-password')) return 'Please choose a stronger password.';
    if (message.includes('auth/popup-closed-by-user'))
      return 'The sign-in window was closed before completion.';
    if (message.includes('auth/too-many-requests'))
      return 'Too many attempts. Please wait a few minutes and try again.';
    if (message.includes('auth/network-request-failed'))
      return 'Unable to connect. Check your connection and try again.';
    if (message.includes('auth/user-disabled'))
      return 'This account is disabled. Please contact the store.';
    if (message.includes('auth/operation-not-allowed'))
      return 'This sign-in method is not enabled yet. Please use email and password.';
    if (message.includes('auth/unauthorized-domain'))
      return 'Sign-in is not configured for this website. Please contact the store.';
    if (message.includes('auth/popup-blocked'))
      return 'Allow popups for this website and try again.';
    if (message.includes('auth/invalid-email')) return 'Enter a valid email address.';
    return 'Unable to complete sign-in. Please try again.';
  }
}
