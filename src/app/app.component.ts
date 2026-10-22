import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CartService } from './core/services/cart.service';
import { NavigationService } from './core/services/navigation.service';
import { AuthService } from './core/services/auth.service';
import { FooterComponent } from './core/layout/footer/footer.component';
import { HeaderComponent } from './core/layout/header/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  template: `
    <app-header />
    <div class="bag-notice" role="status" aria-live="polite">{{ cart.announcement() }}</div>
    <main id="main-content" tabindex="-1"><router-outlet /></main>
    <app-footer />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly cart = inject(CartService);
  constructor() {
    inject(NavigationService);
    const router = inject(Router);
    inject(AuthService)
      .user$.pipe(takeUntilDestroyed())
      .subscribe((user) => {
        const path = router.url.split(/[?#]/)[0];
        if (!user && /^\/(account|profile|admin)(?:\/|;|$)/.test(path)) {
          void router.navigate(['/login']);
        } else if (user && user.role !== 'admin' && /^\/admin(?:\/|;|$)/.test(path)) {
          void router.navigate(['/account']);
        }
      });
  }
}
