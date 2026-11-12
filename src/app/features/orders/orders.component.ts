import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommerceService } from '../../core/services/commerce.service';
import { LedgerOrder, OrderPage } from '../../core/models/commerce.model';
import { decodeOrderResponse, decodeOrderPage } from '../../types/commerce.contracts';
import { AdminNavComponent } from '../../shared/components/admin-nav.component';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe, AdminNavComponent],
  templateUrl: './orders.component.html',
  styleUrl: '../commerce.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent {
  readonly api = inject(CommerceService);
  private readonly route = inject(ActivatedRoute);
  readonly admin = this.route.snapshot.data['admin'] === true;
  readonly statusOnly = !!this.route.snapshot.paramMap.get('id');
  readonly orders = signal<LedgerOrder[]>([]);
  readonly selected = signal<LedgerOrder | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  cursor: OrderPage['cursor'] = null;
  fulfillment = '';
  paid = 0;
  refunded = 0;
  note = '';
  filter = '';
  readonly statuses = [
    'requested',
    'awaiting_confirmation',
    'confirmed',
    'in_production',
    'dispatched',
    'delivered',
    'cancelled',
    'expired',
  ];
  constructor() {
    void this.load();
  }
  label(value: string): string {
    return value.replaceAll('_', ' ');
  }
  visible(): LedgerOrder[] {
    return this.orders().filter((order) => !this.filter || order.fulfillmentStatus === this.filter);
  }
  select(order: LedgerOrder): void {
    this.selected.set(order);
    this.fulfillment = order.fulfillmentStatus;
    this.paid = order.paidCents / 100;
    this.refunded = order.refundedCents / 100;
    this.note = '';
  }
  async load(more = false): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      if (this.statusOnly) {
        const access = new URLSearchParams(location.hash.slice(1)).get('access') || '';
        const result = await this.api.call(
          '/order-status',
          {
            id: this.route.snapshot.paramMap.get('id'),
            access,
          },
          decodeOrderResponse,
        );
        this.select(result.order);
      } else {
        const result = await this.api.call(
          this.admin ? '/admin/orders' : '/my-orders',
          {
            cursor: more ? this.cursor : null,
          },
          decodeOrderPage,
        );
        this.orders.set(more ? [...this.orders(), ...result.orders] : result.orders);
        this.cursor = result.cursor;
        if (!more) this.selected.set(null);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load orders.');
    } finally {
      this.loading.set(false);
    }
  }
  async save(): Promise<void> {
    const order = this.selected();
    if (!order || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const result = await this.api.call(
        '/admin/order',
        {
          id: order.id,
          version: order.version,
          fulfillmentStatus: this.fulfillment,
          paidCents: Math.round(this.paid * 100),
          refundedCents: Math.round(this.refunded * 100),
          note: this.note,
        },
        decodeOrderResponse,
      );
      this.orders.update((orders) =>
        orders.map((item) => (item.id === result.order.id ? result.order : item)),
      );
      this.select(result.order);
      this.notice.set(
        result.order.fulfillmentStatus === 'expired'
          ? 'Reservation expired before this update. Stock was released; no payment was recorded.'
          : 'Order updated.',
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to update order.');
    } finally {
      this.loading.set(false);
    }
  }
}
