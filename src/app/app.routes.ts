import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'admin/dashboard',
    title: 'Store overview · Emey',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin-dashboard/admin-dashboard.component').then(
        (m) => m.AdminDashboardComponent,
      ),
  },
  {
    path: 'order/:id',
    title: 'Order status · Emey',
    loadComponent: () =>
      import('./features/orders/orders.component').then((m) => m.OrdersComponent),
  },
  {
    path: 'account/orders',
    title: 'Your orders · Emey',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/orders/orders.component').then((m) => m.OrdersComponent),
  },
  {
    path: 'admin/orders',
    title: 'Order control room · Emey',
    canActivate: [authGuard, adminGuard],
    data: { admin: true },
    loadComponent: () =>
      import('./features/orders/orders.component').then((m) => m.OrdersComponent),
  },
  {
    path: 'admin/settings',
    title: 'Checkout settings · Emey',
    canActivate: [authGuard, adminGuard],
    canDeactivate: [
      (component: { canLeave: () => boolean | Promise<boolean> }) => component.canLeave(),
    ],
    loadComponent: () =>
      import('./features/checkout-settings/checkout-settings.component').then(
        (m) => m.CheckoutSettingsComponent,
      ),
  },
  {
    path: '',
    title: 'Emey Crochet Store · Handmade with heart',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'shop',
    title: 'Shop · Emey Crochet Store',
    loadComponent: () => import('./features/shop/shop.component').then((m) => m.ShopComponent),
  },
  {
    path: 'product/:slug',
    loadComponent: () =>
      import('./features/product-detail/product-detail.component').then(
        (m) => m.ProductDetailComponent,
      ),
  },
  {
    path: 'cart',
    title: 'Your Bag · Emey Crochet Store',
    loadComponent: () => import('./features/cart/cart.component').then((m) => m.CartComponent),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · Emey Crochet Store',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'account',
    title: 'My Emey · Emey Crochet Store',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/account/account.component').then((m) => m.AccountComponent),
  },
  { path: 'profile', redirectTo: 'account', pathMatch: 'full' },
  {
    path: 'admin',
    title: 'Store Management · Emey Crochet Store',
    canActivate: [authGuard, adminGuard],
    canDeactivate: [
      (component: { canLeave: () => boolean | Promise<boolean> }) => component.canLeave(),
    ],
    loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent),
  },
  {
    path: '**',
    title: 'Page not found · Emey',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
