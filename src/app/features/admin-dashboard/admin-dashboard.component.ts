import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CommerceService } from '../../core/services/commerce.service';
import { LedgerOrder, OrderPage } from '../../core/models/commerce.model';
import { decodeOrderPage } from '../../types/commerce.contracts';
import { analyzeOrders } from '../../core/utils/admin-analytics';
import { AdminNavComponent } from '../../shared/components/admin-nav.component';

@Component({
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, AdminNavComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent {
  private readonly api = inject(CommerceService);
  private readonly destroy = inject(DestroyRef);
  readonly orders = signal<LedgerOrder[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly loadedAt = signal<number | null>(null);
  readonly currency = signal('USD');
  readonly days = signal(30);
  readonly hasMore = signal(false);
  readonly currencies = computed(() =>
    [...new Set(this.orders().map((order) => order.currency))].sort(),
  );
  readonly analysis = computed(() =>
    analyzeOrders(this.orders(), this.currency(), this.days(), this.loadedAt() ?? Date.now()),
  );
  readonly recent = computed(() =>
    this.orders()
      .filter((order) => order.currency === this.currency())
      .slice(0, 5),
  );
  private cursor: OrderPage['cursor'] = null;
  readonly limit = 250;
  private lastMore = false;
  retry(): void {
    void this.load(this.lastMore);
  }
  constructor() {
    void this.load();
  }
  label(value: string): string {
    return value.replaceAll('_', ' ');
  }
  async load(more = false): Promise<void> {
    if (this.loading() || (more && (!this.hasMore() || this.orders().length >= this.limit))) return;
    this.loading.set(true);
    this.lastMore = more;
    this.error.set('');
    try {
      const result = await this.api.call(
        '/admin/orders',
        { cursor: more ? this.cursor : null },
        decodeOrderPage,
      );
      if (this.destroy.destroyed) return;
      const rows = new Map((more ? this.orders() : []).map((order) => [order.id, order]));
      result.orders.forEach((order) => rows.set(order.id, order));
      this.orders.set([...rows.values()].slice(0, this.limit));
      this.cursor = result.cursor;
      this.hasMore.set(!!result.cursor);
      this.loadedAt.set(Date.now());
      if (!this.currencies().includes(this.currency()))
        this.currency.set(this.currencies()[0] ?? 'USD');
    } catch (error) {
      if (!this.destroy.destroyed)
        this.error.set(
          error instanceof Error ? error.message : 'Overview could not load. Try again.',
        );
    } finally {
      if (!this.destroy.destroyed) this.loading.set(false);
    }
  }
}
