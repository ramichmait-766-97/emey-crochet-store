export interface CheckoutContact {
  fullName: string;
  email: string;
  phone: string;
  address?: string;
  notes?: string;
}

export interface OrderResult {
  orderId: string;
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
}
