export class CommerceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const requireThat = (condition, message, status) => {
  if (!condition) throw new CommerceError(message, status);
};
export const text = (value, max, label, required = false) => {
  requireThat(
    typeof value === 'string' && value.length <= max && (!required || value.trim()),
    `Check ${label}.`,
  );
  return value.trim();
};
export function cents(value) {
  requireThat(
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000,
    'Invalid price.',
  );
  const result = Math.round(value * 100);
  requireThat(
    Math.abs(result / 100 - value) < 0.000001,
    'Prices support at most two decimal places.',
  );
  return result;
}
export const DEFAULT_CHECKOUT = {
  enabled: false,
  currency: 'USD',
  reservationMinutes: 1440,
  freeShippingThresholdCents: null,
  zones: [
    {
      id: 'local',
      label: 'Local / capital city — draft',
      feeCents: 300,
      estimate: '1–2 days — confirm',
      enabled: false,
    },
    {
      id: 'national',
      label: 'Nationwide — draft',
      feeCents: 700,
      estimate: '3–5 days — confirm',
      enabled: false,
    },
  ],
  pickup: { enabled: false, details: 'Coordinates shared upon order confirmation via WhatsApp' },
  paymentMethods: [
    {
      id: 'cod',
      label: 'Cash on delivery — draft',
      instructions: 'Pay the confirmed total on delivery.',
      enabled: false,
    },
    {
      id: 'transfer',
      label: 'Manual transfer — draft',
      instructions:
        'Request verified transfer details from the store. Never send money to details supplied by another customer.',
      enabled: false,
    },
  ],
  version: 1,
};
export function validateSettings(input) {
  requireThat(
    typeof input.enabled === 'boolean' && /^[A-Z]{3}$/.test(input.currency),
    'Check checkout currency and enabled state.',
  );
  requireThat(
    Number.isInteger(input.reservationMinutes) &&
      input.reservationMinutes >= 15 &&
      input.reservationMinutes <= 10080,
    'Hold duration must be 15–10080 minutes.',
  );
  const money = (value) => Number.isInteger(value) && value >= 0 && value <= 10000000;
  requireThat(
    input.freeShippingThresholdCents === null || money(input.freeShippingThresholdCents),
    'Check free shipping threshold.',
  );
  requireThat(
    Array.isArray(input.zones) &&
      input.zones.length <= 20 &&
      Array.isArray(input.paymentMethods) &&
      input.paymentMethods.length <= 10,
    'Too many delivery zones or payment methods.',
  );
  const ids = (rows) => {
    requireThat(
      new Set(rows.map((row) => row.id)).size === rows.length &&
        rows.every((row) => /^[a-z0-9_-]{1,40}$/.test(row.id) && typeof row.enabled === 'boolean'),
      'Use unique option IDs.',
    );
  };
  ids(input.zones);
  ids(input.paymentMethods);
  const zones = input.zones.map((zone) => {
    requireThat(money(zone.feeCents), 'Zone fee must be a nonnegative amount in cents.');
    return {
      id: zone.id,
      label: text(zone.label, 120, 'zone name', true),
      feeCents: zone.feeCents,
      estimate: text(zone.estimate, 120, 'delivery estimate', true),
      enabled: zone.enabled,
    };
  });
  const paymentMethods = input.paymentMethods.map((method) => ({
    id: method.id,
    label: text(method.label, 120, 'payment name', true),
    instructions: text(method.instructions, 500, 'payment instructions', true),
    enabled: method.enabled,
  }));
  requireThat(input.pickup && typeof input.pickup.enabled === 'boolean', 'Check pickup settings.');
  const pickup = {
    enabled: input.pickup.enabled,
    details: text(input.pickup.details, 300, 'pickup location', input.pickup.enabled),
  };
  if (input.enabled)
    requireThat(
      (pickup.enabled || zones.some((zone) => zone.enabled)) &&
        paymentMethods.some((method) => method.enabled),
      'Enable a delivery/pickup option and a payment method first.',
    );
  return {
    enabled: input.enabled,
    currency: input.currency,
    reservationMinutes: input.reservationMinutes,
    freeShippingThresholdCents: input.freeShippingThresholdCents,
    zones,
    pickup,
    paymentMethods,
  };
}
export function checkoutInput(input) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  requireThat(object(input), 'Invalid checkout payload.');
  requireThat(
    typeof input.checkoutKey === 'string' && /^[a-f0-9]{64}$/.test(input.checkoutKey),
    'Invalid checkout session.',
  );
  requireThat(
    Array.isArray(input.lines) && input.lines.length > 0 && input.lines.length <= 15,
    'Your bag must contain 1–15 selections.',
  );
  const combined = new Map();
  for (const line of input.lines) {
    requireThat(object(line), 'Invalid bag selection.');
    requireThat(
      typeof line.productId === 'string' &&
        /^[A-Z0-9_-]{1,128}$/.test(line.productId) &&
        (line.variantId === null ||
          line.variantId === undefined ||
          (typeof line.variantId === 'string' &&
            /^(?:[a-zA-Z0-9_-]{1,64})?$/.test(line.variantId))) &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0 &&
        line.quantity <= 20,
      'Check bag quantities and selections.',
    );
    const key = `${line.productId}:${line.variantId || ''}`;
    const prior = combined.get(key);
    combined.set(key, {
      productId: line.productId,
      variantId: line.variantId || '',
      quantity: line.quantity + (prior?.quantity || 0),
    });
    requireThat(combined.get(key).quantity <= 20, 'Limit 20 per selection.');
  }
  const raw = input.contact || {};
  requireThat(object(raw), 'Invalid contact details.');
  for (const field of ['email', 'address', 'building', 'notes'])
    requireThat(
      raw[field] === undefined || typeof raw[field] === 'string',
      'Invalid contact details.',
    );
  const contact = {
    fullName: text(raw.fullName, 120, 'name', true),
    phone: text(raw.phone, 40, 'phone', true),
    email: text(raw.email || '', 200, 'email'),
    address: text(raw.address || '', 500, 'street address', input.deliveryId !== 'pickup'),
    building: text(raw.building || '', 120, 'building/apartment', input.deliveryId !== 'pickup'),
    notes: text(raw.notes || '', 1000, 'delivery notes'),
  };
  requireThat(/^[+\d\s().-]{6,40}$/.test(contact.phone), 'Enter a valid phone number.');
  requireThat(
    !contact.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email),
    'Enter a valid email.',
  );
  return {
    checkoutKey: input.checkoutKey,
    lines: [...combined.values()].sort((a, b) =>
      `${a.productId}:${a.variantId}`.localeCompare(`${b.productId}:${b.variantId}`),
    ),
    contact,
    deliveryId: text(input.deliveryId, 40, 'delivery option', true),
    paymentId: text(input.paymentId, 40, 'payment method', true),
  };
}
export function priceOrder(input, settings, site, products, member) {
  requireThat(settings?.enabled, 'Checkout is not open yet. Please contact the store.', 503);
  validateSettings(settings);
  requireThat(
    Number.isInteger(settings.version) && settings.version > 0,
    'Checkout configuration needs confirmation.',
    503,
  );
  requireThat(
    settings.currency === site?.currency && /^[A-Z]{3}$/.test(site?.currency),
    'Store currency needs confirmation.',
    503,
  );
  requireThat(
    Number.isFinite(site.memberDiscountPercent) &&
      site.memberDiscountPercent >= 0 &&
      site.memberDiscountPercent <= 100,
    'Member pricing needs confirmation.',
    503,
  );
  const payment = settings.paymentMethods.find(
    (method) => method.id === input.paymentId && method.enabled,
  );
  requireThat(payment, 'Choose an available payment method.');
  const zone = settings.zones.find((item) => item.id === input.deliveryId && item.enabled);
  requireThat(
    input.deliveryId === 'pickup' ? settings.pickup.enabled : !!zone,
    'Choose an available delivery option.',
  );
  const lines = input.lines.map((line) => {
    const product = products.get(line.productId);
    requireThat(product?.active, 'A selected piece is no longer available.', 409);
    const variant = product.variants?.length
      ? product.variants.find((item) => item.id === line.variantId)
      : null;
    requireThat(
      product.variants?.length ? !!variant : !line.variantId,
      `Choose an available option for ${product.name}.`,
      409,
    );
    const stock = variant ? variant.quantity : product.quantity;
    requireThat(
      Number.isInteger(stock) && stock >= line.quantity,
      `${product.name} no longer has the requested stock.`,
      409,
    );
    const unitPriceCents = cents(variant?.price ?? product.price);
    requireThat(unitPriceCents > 0, `${product.name} needs a confirmed price.`, 409);
    return {
      ...line,
      name: product.name,
      option: variant ? `${variant.color} / ${variant.size}` : '',
      unitPriceCents,
      lineTotalCents: unitPriceCents * line.quantity,
    };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const discountCents = member ? Math.round((subtotalCents * site.memberDiscountPercent) / 100) : 0;
  const merchandiseCents = subtotalCents - discountCents;
  const deliveryCents =
    input.deliveryId === 'pickup' ||
    (settings.freeShippingThresholdCents !== null &&
      merchandiseCents >= settings.freeShippingThresholdCents)
      ? 0
      : zone.feeCents;
  return {
    lines,
    subtotalCents,
    discountCents,
    deliveryCents,
    totalCents: merchandiseCents + deliveryCents,
    currency: settings.currency,
    settingsVersion: settings.version,
    reservationMinutes: settings.reservationMinutes,
    delivery: {
      id: input.deliveryId,
      label: zone?.label || 'Pickup',
      estimate: zone?.estimate || settings.pickup.details,
    },
    payment: { id: payment.id, label: payment.label, instructions: payment.instructions },
  };
}
export function stockChanges(lines, products, direction) {
  const changed = new Map();
  for (const line of lines) {
    const product = changed.get(line.productId) || structuredClone(products.get(line.productId));
    requireThat(product, 'Inventory needs administrator attention.', 409);
    if (line.variantId) {
      const variant = product.variants?.find((item) => item.id === line.variantId);
      requireThat(
        variant,
        'A reserved variant was removed; restore it before releasing stock.',
        409,
      );
      variant.quantity += direction * line.quantity;
      requireThat(variant.quantity >= 0, 'Stock changed. Review your bag.', 409);
      product.quantity = product.variants.reduce((sum, item) => sum + item.quantity, 0);
    } else {
      requireThat(
        !product.variants?.length,
        'Restore the reserved product configuration before releasing stock.',
        409,
      );
      product.quantity += direction * line.quantity;
      requireThat(product.quantity >= 0, 'Stock changed. Review your bag.', 409);
    }
    product.reservedUnits = (product.reservedUnits || 0) - direction * line.quantity;
    requireThat(product.reservedUnits >= 0, 'Reserved stock needs administrator attention.', 409);
    changed.set(line.productId, product);
  }
  return [...changed].map(([id, product]) => [
    id,
    {
      quantity: product.quantity,
      reservedUnits: product.reservedUnits,
      ...(product.variants ? { variants: product.variants } : {}),
      inventoryVersion: (product.inventoryVersion || 0) + 1,
    },
  ]);
}
export const FULFILLMENT = [
  'requested',
  'awaiting_confirmation',
  'confirmed',
  'in_production',
  'dispatched',
  'delivered',
  'cancelled',
  'expired',
];
export function transition(order, input, now, actor) {
  requireThat(order.version === input.version, 'This order changed. Refresh before saving.', 409);
  const next = input.fulfillmentStatus;
  const allowed = {
    requested: ['requested', 'awaiting_confirmation', 'confirmed', 'cancelled'],
    awaiting_confirmation: ['awaiting_confirmation', 'confirmed', 'cancelled'],
    confirmed: ['confirmed', 'in_production', 'dispatched', 'cancelled'],
    in_production: ['in_production', 'dispatched', 'cancelled'],
    dispatched: ['dispatched', 'delivered'],
    delivered: ['delivered'],
    cancelled: ['cancelled'],
    expired: ['expired'],
  };
  requireThat(
    allowed[order.fulfillmentStatus]?.includes(next),
    'That fulfillment transition is not allowed.',
  );
  requireThat(
    Number.isInteger(input.paidCents) &&
      input.paidCents >= order.paidCents &&
      input.paidCents <= order.totalCents,
    'Paid amount must be cumulative and cannot decrease or exceed the total.',
  );
  requireThat(
    Number.isInteger(input.refundedCents) &&
      input.refundedCents >= order.refundedCents &&
      input.refundedCents <= input.paidCents,
    'Refund amount must be cumulative and cannot exceed payments.',
  );
  requireThat(
    !['cancelled', 'expired'].includes(next) || input.paidCents === order.paidCents,
    'Closed orders cannot accept new payments.',
  );
  requireThat(
    next !== 'delivered' || input.paidCents - input.refundedCents === order.totalCents,
    'Record full payment before marking delivered.',
  );
  const note = text(input.note || '', 500, 'update note');
  requireThat(note, 'Add a note explaining this update or payment.');
  const paymentStatus =
    input.refundedCents === input.paidCents && input.paidCents > 0
      ? 'refunded'
      : input.refundedCents > 0
        ? 'partially_refunded'
        : input.paidCents === 0
          ? 'unpaid'
          : input.paidCents === order.totalCents
            ? 'fully_paid'
            : 'deposit_paid';
  let reservationState = order.reservationState;
  if (next === 'cancelled') reservationState = 'released';
  else if (
    ['confirmed', 'in_production', 'dispatched', 'delivered'].includes(next) ||
    input.paidCents > 0
  )
    reservationState = 'committed';
  return {
    ...order,
    fulfillmentStatus: next,
    paymentStatus,
    paidCents: input.paidCents,
    refundedCents: input.refundedCents,
    reservationState,
    version: order.version + 1,
    updatedAt: now,
    lastUpdate: { actor, note, at: now },
  };
}
