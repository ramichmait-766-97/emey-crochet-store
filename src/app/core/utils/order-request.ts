import { CheckoutContact, OrderRequestEstimate } from '../models/order.model';
import { CartLine } from '../models/product.model';
import { SiteSettings } from '../models/site-settings.model';
export function prepareOrderRequest(
  lines: CartLine[],
  contact: CheckoutContact,
  site: SiteSettings,
  member: boolean,
): OrderRequestEstimate {
  const whatsapp = site.contacts.find((c) => c.enabled && c.type === 'whatsapp');
  const raw = whatsapp?.value.replace(/\D/g, '') ?? '';
  const fromUrl = whatsapp?.url?.match(/^https:\/\/(?:www\.)?wa\.me\/(\d{8,15})(?:\?|$)/)?.[1];
  const phone = fromUrl || raw;
  if (!/^\d{8,15}$/.test(phone) || phone === '96100000000' || /^0+$/.test(phone))
    throw new Error(
      'Order requests are not available yet. Please use the contact details at the bottom of the page.',
    );
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const subtotal = money(lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0));
  const rate = member
    ? Math.min(100, Math.max(0, Number(site.memberDiscountPercent) || 0)) / 100
    : 0;
  const discount = money(subtotal * rate);
  const total = money(subtotal - discount);
  const message = [
    `Hello ${site.storeName}, I'd like to request these pieces:`,
    ...lines.map(
      (l) =>
        `${l.quantity} × ${l.product.name} (${l.product.id}) — ${site.currency} ${money(l.product.price * l.quantity).toFixed(2)}`,
    ),
    `Subtotal: ${site.currency} ${subtotal.toFixed(2)}`,
    ...(discount ? [`Member saving: ${site.currency} ${discount.toFixed(2)}`] : []),
    `Estimated total: ${site.currency} ${total.toFixed(2)} (delivery to be confirmed)`,
    `Name: ${contact.fullName.trim()}`,
    `Phone: ${contact.phone.trim()}`,
    ...(contact.email.trim() ? [`Email: ${contact.email.trim()}`] : []),
    ...(contact.address?.trim() ? [`Delivery: ${contact.address.trim()}`] : []),
    ...(contact.notes?.trim() ? [`Notes: ${contact.notes.trim()}`] : []),
    'Please confirm availability, delivery and payment details.',
  ].join('\n');
  return {
    subtotal,
    discount,
    total,
    currency: site.currency,
    whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
  };
}
