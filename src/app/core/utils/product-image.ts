export const MAX_PRODUCT_IMAGE_BYTES = 700 * 1024;

export function toUint8Array(value: unknown): Uint8Array | null {
  if (!value) {
    return null;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    const maybeBytes = value as {
      toUint8Array?: () => Uint8Array;
      toBase64?: () => string;
      data?: number[];
      bytes?: Uint8Array | number[];
    };

    if (typeof maybeBytes.toUint8Array === 'function') {
      return maybeBytes.toUint8Array();
    }

    if (typeof maybeBytes.toBase64 === 'function') {
      return Uint8Array.from(atob(maybeBytes.toBase64()), (char) => char.charCodeAt(0));
    }

    const nested = maybeBytes.bytes ?? maybeBytes.data;
    if (nested instanceof Uint8Array) {
      return nested;
    }
    if (Array.isArray(nested)) {
      return Uint8Array.from(nested);
    }
  }

  return null;
}

export function bytesToDataUrl(value: unknown, contentType = 'image/webp'): string {
  const bytes = toUint8Array(value);
  if (!bytes?.length) {
    return '';
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:${contentType || 'image/webp'};base64,${btoa(binary)}`;
}

export function productImageSrc(product: {
  imageUrl?: string;
  imageContentType?: string;
  imageData?: unknown;
}): string {
  const fromBytes = bytesToDataUrl(product.imageData, product.imageContentType);
  if (fromBytes) {
    return fromBytes;
  }

  return product.imageUrl || '';
}
