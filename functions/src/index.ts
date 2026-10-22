import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore('maindb');

interface CreateOrderItem {
  productId: string;
  quantity: number;
}

interface CreateOrderContact {
  fullName: string;
  email?: string;
  phone: string;
  address?: string;
  notes?: string;
}

interface CreateOrderRequest {
  items: CreateOrderItem[];
  contact: CreateOrderContact;
}

const asTrimmedString = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const createOrder = onCall<CreateOrderRequest>(async (request) => {
  const data = request.data;

  if (!Array.isArray(data?.items) || data.items.length === 0 || data.items.length > 50) {
    throw new HttpsError('invalid-argument', 'Your bag is empty or contains too many lines.');
  }

  const contact = {
    fullName: asTrimmedString(data.contact?.fullName, 120),
    email: asTrimmedString(data.contact?.email, 200),
    phone: asTrimmedString(data.contact?.phone, 50),
    address: asTrimmedString(data.contact?.address, 500),
    notes: asTrimmedString(data.contact?.notes, 1000),
  };

  if (!contact.fullName || !contact.phone) {
    throw new HttpsError('invalid-argument', 'Full name and phone number are required.');
  }

  const userId = request.auth?.uid ?? null;
  const settingsSnapshot = await db.doc('siteSettings/public').get();
  const settings = settingsSnapshot.data() ?? {};
  const configuredDiscount = Number(settings['memberDiscountPercent'] ?? 10);
  const memberDiscountPercent = Math.min(100, Math.max(0, configuredDiscount));
  const currency = asTrimmedString(settings['currency'], 3).toUpperCase() || 'USD';
  const discountRate = userId ? memberDiscountPercent / 100 : 0;

  return db.runTransaction(async (transaction) => {
    let subtotal = 0;
    const lines: Array<{
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    for (const rawItem of data.items) {
      const productId = asTrimmedString(rawItem?.productId, 100);
      const quantity = Number(rawItem?.quantity);

      if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        throw new HttpsError('invalid-argument', 'One or more cart lines are invalid.');
      }

      const productRef = db.doc(`products/${productId}`);
      const productSnapshot = await transaction.get(productRef);

      if (!productSnapshot.exists) {
        throw new HttpsError('not-found', `Product ${productId} was not found.`);
      }

      const product = productSnapshot.data()!;
      const availableQuantity = Number(product['quantity'] ?? 0);
      const unitPrice = Number(product['price'] ?? 0);
      const productName = asTrimmedString(product['name'], 200) || productId;

      if (product['active'] !== true) {
        throw new HttpsError('failed-precondition', `${productName} is currently unavailable.`);
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new HttpsError('internal', `Invalid price configured for ${productName}.`);
      }
      if (availableQuantity < quantity) {
        throw new HttpsError('failed-precondition', `Not enough stock is available for ${productName}.`);
      }

      const lineTotal = money(unitPrice * quantity);
      subtotal = money(subtotal + lineTotal);
      lines.push({ productId, name: productName, quantity, unitPrice, lineTotal });

      transaction.update(productRef, {
        quantity: FieldValue.increment(-quantity),
        modifiedAt: FieldValue.serverTimestamp(),
      });
    }

    const discount = money(subtotal * discountRate);
    const total = money(subtotal - discount);
    const orderRef = db.collection('orders').doc();

    transaction.set(orderRef, {
      userId,
      contact,
      items: lines,
      subtotal,
      discountRate,
      memberDiscountPercent: userId ? memberDiscountPercent : 0,
      discount,
      total,
      currency,
      status: 'pending',
      channel: 'website-whatsapp',
      createdAt: FieldValue.serverTimestamp(),
      modifiedAt: FieldValue.serverTimestamp(),
    });

    return {
      orderId: orderRef.id,
      subtotal,
      discount,
      total,
      currency,
    };
  });
});
