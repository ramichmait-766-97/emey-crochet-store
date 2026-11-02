export interface DeliveryZone {
  id: string;
  label: string;
  feeCents: number;
  estimate: string;
  enabled: boolean;
}
export interface PaymentMethod {
  id: string;
  label: string;
  instructions: string;
  enabled: boolean;
}
export interface CheckoutSettings {
  enabled: boolean;
  currency: string;
  reservationMinutes: number;
  freeShippingThresholdCents: number | null;
  zones: DeliveryZone[];
  pickup: { enabled: boolean; details: string };
  paymentMethods: PaymentMethod[];
  version: number;
}
export interface LedgerLine {
  productId: string;
  variantId: string;
  quantity: number;
  name: string;
  option: string;
  unitPriceCents: number;
  lineTotalCents: number;
}
export interface OrderQuote {
  lines: LedgerLine[];
  subtotalCents: number;
  discountCents: number;
  deliveryCents: number;
  totalCents: number;
  currency: string;
  reservationMinutes: number;
  delivery: { id: string; label: string; estimate: string };
  payment: { id: string; label: string; instructions: string };
  quoteFingerprint: string;
}
export interface LedgerOrder extends Omit<OrderQuote, 'quoteFingerprint' | 'reservationMinutes'> {
  id: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  fulfillmentStatus:
    | 'requested'
    | 'awaiting_confirmation'
    | 'confirmed'
    | 'in_production'
    | 'dispatched'
    | 'delivered'
    | 'cancelled'
    | 'expired';
  paymentStatus: 'unpaid' | 'deposit_paid' | 'fully_paid' | 'partially_refunded' | 'refunded';
  paidCents: number;
  refundedCents: number;
  reservationState: 'held' | 'committed' | 'released';
  reservationExpiresAt: number;
  contact?: {
    fullName: string;
    phone: string;
    email: string;
    address: string;
    building: string;
    notes: string;
  };
}
export interface OrderPage {
  orders: LedgerOrder[];
  cursor: { createdAt: number; id: string } | null;
}
