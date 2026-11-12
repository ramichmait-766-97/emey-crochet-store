import { LedgerOrder } from '../models/commerce.model';

export const FULFILLMENT_STATES: readonly LedgerOrder['fulfillmentStatus'][] = [
  'requested',
  'awaiting_confirmation',
  'confirmed',
  'in_production',
  'dispatched',
  'delivered',
  'cancelled',
  'expired',
];

/** Bounded loaded-order analysis, never a store-wide revenue or traffic assertion. */
export function analyzeOrders(
  orders: readonly LedgerOrder[],
  currency: string,
  days: number,
  now: number,
) {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const selected = orders.filter(
    (order) =>
      order.currency === currency && order.createdAt >= start.getTime() && order.createdAt <= now,
  );
  const active = selected.filter(
    (order) => !['cancelled', 'expired'].includes(order.fulfillmentStatus),
  );
  const orderValueCents = active.reduce((sum, order) => sum + order.totalCents, 0);
  const netPaymentsCents = selected.reduce(
    (sum, order) => sum + order.paidCents - order.refundedCents,
    0,
  );
  const awaiting = active.filter((order) =>
    ['requested', 'awaiting_confirmation'].includes(order.fulfillmentStatus),
  );
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const rows = active.filter(
      (order) => order.createdAt >= date.getTime() && order.createdAt < next.getTime(),
    );
    return {
      date: date.getTime(),
      count: rows.length,
      valueCents: rows.reduce((sum, order) => sum + order.totalCents, 0),
    };
  });
  const statuses = FULFILLMENT_STATES.map((status) => ({
    status,
    count: selected.filter((order) => order.fulfillmentStatus === status).length,
  }));
  return {
    count: selected.length,
    activeCount: active.length,
    orderValueCents,
    netPaymentsCents,
    awaitingCount: awaiting.length,
    outstandingCents: active.reduce(
      // A refund is a recorded adjustment, not a new debt owed by the customer.
      (sum, order) => sum + Math.max(0, order.totalCents - order.paidCents),
      0,
    ),
    refundedCents: selected.reduce((sum, order) => sum + order.refundedCents, 0),
    averageCents: active.length ? Math.round(orderValueCents / active.length) : 0,
    buckets,
    statuses,
    maxBucket: Math.max(1, ...buckets.map((bucket) => bucket.valueCents)),
    firstDate: start.getTime(),
  };
}
