import { environment } from '../../../environments/environment';

export const IMAGE_PLACEHOLDER = 'assets/branding/placeholder-image.svg';
export interface ImageKitOptions {
  readonly width: number;
  readonly quality?: number;
  readonly blur?: boolean;
}

function hostedImage(source: string): URL | null {
  const endpoint = new URL(environment.images.urlEndpoint + '/');
  try {
    const url = new URL(
      /^https?:\/\//i.test(source) ? source : source.replace(/^\/+/, ''),
      endpoint,
    );
    if (
      url.origin !== endpoint.origin ||
      !url.pathname.startsWith(endpoint.pathname) ||
      url.username ||
      url.password
    )
      return null;
    // Replace a previous path-based transform instead of stacking two resizes.
    const path = url.pathname.slice(endpoint.pathname.length);
    if (path.startsWith('tr:') && path.includes('/'))
      url.pathname = endpoint.pathname + path.slice(path.indexOf('/') + 1);
    return url;
  } catch {
    return null;
  }
}

export function imageDeliveryUrl(source: string, width = 1200, quality = 80, blur = false): string {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    width > 8192 ||
    !Number.isInteger(quality) ||
    quality < 1 ||
    quality > 100
  )
    throw new RangeError('Invalid ImageKit dimensions or quality.');
  if (!source) return IMAGE_PLACEHOLDER;
  if (/^(\/?assets\/|data:image\/)/i.test(source)) return source;
  if (/^(data:|javascript:|blob:)/i.test(source)) return IMAGE_PLACEHOLDER;
  const url = hostedImage(source);
  if (!url) return /^https?:\/\//i.test(source) ? source : IMAGE_PLACEHOLDER;
  url.searchParams.set('tr', `w-${width},q-${quality},f-auto${blur ? ',bl-30' : ''}`);
  // URLSearchParams escapes commas so native srcset does not split inside tr=.
  return url.toString();
}

export function imageSrcset(source: string, widths: readonly number[]): string | null {
  if (!source || /^(\/?assets\/|data:)/i.test(source) || !hostedImage(source)) return null;
  return [...new Set(widths)]
    .sort((a, b) => a - b)
    .map((width) => `${imageDeliveryUrl(source, width)} ${width}w`)
    .join(', ');
}

export function imagePlaceholder(source: string): string | null {
  if (!source || /^(\/?assets\/|data:)/i.test(source) || !hostedImage(source)) return null;
  return imageDeliveryUrl(source, 32, 20, true);
}

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
