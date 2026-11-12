import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Store management">
      <a routerLink="/admin/dashboard" routerLinkActive="active" ariaCurrentWhenActive="page">
        Overview
      </a>
      <a
        routerLink="/admin"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
      >
        Products & store
      </a>
      <a routerLink="/admin/orders" routerLinkActive="active" ariaCurrentWhenActive="page">
        Orders
      </a>
      <a routerLink="/admin/settings" routerLinkActive="active" ariaCurrentWhenActive="page">
        Delivery & payment
      </a>
      <a routerLink="/shop">View storefront ↗</a>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 1.75rem;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding: 0.4rem;
      background: var(--soft);
      border: 1px solid var(--line);
      border-radius: 16px;
    }
    a {
      padding: 0.7rem 0.9rem;
      min-height: 44px;
      display: flex;
      align-items: center;
      font-size: 0.82rem;
      color: var(--ink);
      border-radius: 10px;
    }
    a:hover {
      background: var(--cream);
    }
    a.active {
      background: var(--ink);
      color: white;
    }
    a:last-child {
      margin-left: auto;
    }
    @media (max-width: 520px) {
      a {
        flex: 1 1 40%;
        justify-content: center;
        padding-inline: 0.5rem;
      }
      a:last-child {
        margin: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNavComponent {}
