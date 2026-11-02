import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sourceLoader } from './load-typescript.mjs';
const angular = { Pipe: () => (target) => target };
const load = sourceLoader({ '@angular/core': angular });
const { ImageKitPipe, ImageKitSrcsetPipe } = load(
  fileURLToPath(new URL('../src/app/shared/pipes/imagekit.pipe.ts', import.meta.url)),
);
const { imageDeliveryUrl, IMAGE_PLACEHOLDER, imagePlaceholder } = load(
  fileURLToPath(new URL('../src/app/core/utils/product-image.ts', import.meta.url)),
);
const source = 'https://ik.imagekit.io/s5yr4ioi1/emey/products/photo.webp';
const pipe = new ImageKitPipe();
test('ImageKit pipe uses the configured account, preserves query parameters and replaces transforms', () => {
  const result = new URL(
    pipe.transform(source + '?v=2&tr=w-1200,q-99', { width: 400, quality: 70 }),
  );
  assert.equal(result.origin, 'https://ik.imagekit.io');
  assert.equal(result.searchParams.get('v'), '2');
  assert.equal(result.searchParams.get('tr'), 'w-400,q-70,f-auto');
  assert.equal(
    new URL(pipe.transform('emey/products/photo.webp', { width: 400 })).pathname,
    '/s5yr4ioi1/emey/products/photo.webp',
  );
  assert.equal(
    new URL(pipe.transform(source.replace('/emey/', '/tr:w-1200/emey/'), { width: 200 })).pathname,
    '/s5yr4ioi1/emey/products/photo.webp',
  );
  assert.equal(
    new URL(pipe.transform(source, { width: 32, quality: 20, blur: true })).searchParams.get('tr'),
    'w-32,q-20,f-auto,bl-30',
  );
});
test('missing, local, legacy data and external media are safe and invalid transforms are rejected', () => {
  assert.equal(pipe.transform(null, { width: 400 }), IMAGE_PLACEHOLDER);
  for (const url of [
    'assets/products/bag.webp',
    '/assets/products/bag.webp',
    'data:image/webp;base64,AQID',
    'https://external.test/image.webp',
    'https://ik.imagekit.io/other-account/image.webp',
  ])
    assert.equal(pipe.transform(url, { width: 400 }), url);
  assert.equal(pipe.transform('javascript:alert(1)', { width: 400 }), IMAGE_PLACEHOLDER);
  for (const width of [0, -1, Infinity, 1.5, 9000])
    assert.throws(() => imageDeliveryUrl(source, width));
  assert.throws(() => pipe.transform(source, { width: 400, quality: 101 }));
});
test('srcset has parseable width candidates, no transform comma ambiguity, and no fake local variants', () => {
  const srcset = new ImageKitSrcsetPipe().transform(source, [800, 400, 400, 200]);
  const candidates = srcset.split(', ');
  assert.equal(candidates.length, 3);
  assert.deepEqual(
    candidates.map((candidate) => candidate.split(' ')[1]),
    ['200w', '400w', '800w'],
  );
  for (const candidate of candidates) {
    const [url, width] = candidate.split(' ');
    assert.ok(!url.includes(','));
    assert.equal(new URL(url).searchParams.get('tr'), `w-${parseInt(width)},q-80,f-auto`);
  }
  for (const url of [
    null,
    'assets/photo.webp',
    'data:image/png;base64,AQID',
    'https://external.test/image.webp',
  ])
    assert.equal(new ImageKitSrcsetPipe().transform(url, [400, 800]), null);
  assert.equal(new URL(imagePlaceholder(source)).searchParams.get('tr'), 'w-32,q-20,f-auto,bl-30');
  assert.equal(imagePlaceholder('assets/photo.webp'), null);
});
test('image fallback clears srcset and LQIP once, without looping if the fallback itself fails', () => {
  class ElementRef {}
  class Renderer2 {}
  const attributes = new Map([
    ['src', source],
    ['srcset', 'remote 400w'],
  ]);
  const styles = new Map();
  const image = { getAttribute: (name) => attributes.get(name) };
  const renderer = {
    setStyle: (_el, name, value) => styles.set(name, value),
    removeStyle: (_el, name) => styles.delete(name),
    setAttribute: (_el, name, value) => attributes.set(name, value),
    removeAttribute: (_el, name) => attributes.delete(name),
  };
  const loader = sourceLoader({
    '@angular/core': {
      Directive: () => (target) => target,
      Input: () => () => {},
      HostListener: () => () => {},
      ElementRef,
      Renderer2,
      inject: (token) => (token === ElementRef ? { nativeElement: image } : renderer),
    },
  });
  const { ImageFallbackDirective } = loader(
    fileURLToPath(
      new URL('../src/app/shared/directives/image-fallback.directive.ts', import.meta.url),
    ),
  );
  const directive = new ImageFallbackDirective();
  directive.appImageFallback = source;
  directive.ngOnChanges();
  assert.ok(styles.has('background-image'));
  directive.loaded();
  assert.ok(!styles.has('background-image'));
  directive.failed();
  assert.ok(!attributes.has('srcset'));
  assert.equal(attributes.get('src'), IMAGE_PLACEHOLDER);
  directive.failed();
  assert.equal(attributes.get('src'), IMAGE_PLACEHOLDER);
});
