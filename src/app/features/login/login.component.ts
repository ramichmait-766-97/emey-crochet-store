import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';

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

  mode: AuthMode = 'login';
  email = '';
  password = '';
  busy = false;
  error = '';

  async submit(): Promise<void> {
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
  }

  private async runAuth(action: () => Promise<unknown>): Promise<void> {
    if (this.busy) {
      return;
    }

    this.busy = true;
    this.error = '';

    try {
      await action();
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(this.safeReturnUrl(returnUrl));
    } catch (error) {
      this.error = this.friendlyError(error);
    } finally {
      this.busy = false;
    }
  }

  private safeReturnUrl(value: string | null): string {
    return value?.startsWith('/') && !value.startsWith('//') ? value : '/account';
  }

  private friendlyError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('auth/invalid-credential')) return 'The email or password is incorrect.';
    if (message.includes('auth/email-already-in-use')) return 'An account already exists for this email.';
    if (message.includes('auth/weak-password')) return 'Please choose a stronger password.';
    if (message.includes('auth/popup-closed-by-user')) return 'The sign-in window was closed before completion.';
    return message || 'Authentication failed. Please try again.';
  }
}
