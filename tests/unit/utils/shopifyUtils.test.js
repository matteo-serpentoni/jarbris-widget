import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  normalizeStorefrontProduct,
  isDefaultVariant,
  normalizeOrderNumber,
  getOrderStatusClass,
  extractVariantId,
  extractShopifyId,
  formatPromoExpiry,
} from '../../../src/utils/shopifyUtils';

// TEST-WIDGET — Tier-3 (pure util). Normalizers/extractors over Shopify data: many branches where a
// wrong default (availability, inventory, discount, GID parsing) shows wrong info to the shopper.

describe('normalizeStorefrontProduct', () => {
  it('returns null for nullish input', () => {
    expect(normalizeStorefrontProduct(null)).toBeNull();
  });

  it('normalizes images to URL strings with a primaryImage', () => {
    const out = normalizeStorefrontProduct({ images: [{ url: 'a.jpg' }, { url: 'b.jpg' }] });
    expect(out.images).toEqual(['a.jpg', 'b.jpg']);
    expect(out.primaryImage).toBe('a.jpg');
  });

  it('resolves availability via the cascade (default true)', () => {
    expect(normalizeStorefrontProduct({ available: false }).isAvailable).toBe(false);
    expect(normalizeStorefrontProduct({ availableForSale: true }).isAvailable).toBe(true);
    expect(normalizeStorefrontProduct({}).isAvailable).toBe(true);
  });

  it('computes the discount percentage when compareAtPrice > price', () => {
    expect(
      normalizeStorefrontProduct({ price: '80', compareAtPrice: '100' }).discountPercentage,
    ).toBe(20);
    expect(normalizeStorefrontProduct({ price: '100' }).discountPercentage).toBe(0);
  });

  it('sums tracked inventory across variants, falling back to root quantity', () => {
    expect(
      normalizeStorefrontProduct({ variants: [{ inventoryQuantity: 3 }, { inventoryQuantity: 4 }] })
        .totalInventory,
    ).toBe(7);
    expect(normalizeStorefrontProduct({ stock: 5 }).totalInventory).toBe(5);
  });

  it('flags hasVariants only for non-default options, and coerces edges to an array', () => {
    expect(
      normalizeStorefrontProduct({ options: [{ name: 'Color', values: ['Red'] }] }).hasVariants,
    ).toBe(true);
    expect(
      normalizeStorefrontProduct({ options: [{ name: 'Title', values: ['Default Title'] }] })
        .hasVariants,
    ).toBe(false);

    const out = normalizeStorefrontProduct({ variants: { edges: [{ node: { id: 'v1' } }] } });
    expect(out.variants).toEqual([{ id: 'v1' }]);
  });
});

describe('isDefaultVariant', () => {
  it('detects the Shopify default Title/Default Title option', () => {
    expect(isDefaultVariant({ name: 'Title', values: ['Default Title'] })).toBe(true);
    expect(isDefaultVariant({ name: 'Color', values: ['Red'] })).toBe(false);
    expect(isDefaultVariant(null)).toBe(false);
  });
});

describe('normalizeOrderNumber', () => {
  it('strips leading # characters', () => {
    expect(normalizeOrderNumber('#1001')).toBe('1001');
    expect(normalizeOrderNumber('##5')).toBe('5');
    expect(normalizeOrderNumber(1001)).toBe('1001');
    expect(normalizeOrderNumber(null)).toBe('');
  });
});

describe('getOrderStatusClass', () => {
  it('maps known statuses (slugified) and defaults unknowns', () => {
    expect(getOrderStatusClass('Paid')).toBe('paid');
    expect(getOrderStatusClass('In Preparazione')).toBe('in_preparazione');
    expect(getOrderStatusClass('something-else')).toBe('default');
    expect(getOrderStatusClass(null)).toBe('default');
  });
});

describe('extractVariantId', () => {
  it('extracts a numeric id from numbers, numeric strings and GIDs; null otherwise', () => {
    expect(extractVariantId(123)).toBe(123);
    expect(extractVariantId('456')).toBe(456);
    expect(extractVariantId('gid://shopify/ProductVariant/789')).toBe(789);
    expect(extractVariantId('abc')).toBeNull();
    expect(extractVariantId(null)).toBeNull();
  });
});

describe('extractShopifyId', () => {
  it('returns the trailing id segment, empty string for falsy', () => {
    expect(extractShopifyId('gid://shopify/Product/123')).toBe('123');
    expect(extractShopifyId(123)).toBe('123');
    expect(extractShopifyId(null)).toBe('');
  });
});

describe('formatPromoExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('describes the expiry relative to now', () => {
    expect(formatPromoExpiry('2026-06-20T12:00:00.000Z')).toBe('Scaduto');
    expect(formatPromoExpiry('2026-06-24T06:00:00.000Z')).toBe('Scade oggi ⏳');
    expect(formatPromoExpiry('2026-06-25T12:00:00.000Z')).toBe('Scade domani');
    expect(formatPromoExpiry('2026-06-28T12:00:00.000Z')).toBe('Scade tra 4 giorni');
    expect(formatPromoExpiry('2026-07-15T12:00:00.000Z')).toMatch(/^Valido fino al /);
  });

  it('returns null for an absent date', () => {
    expect(formatPromoExpiry(null)).toBeNull();
  });
});
