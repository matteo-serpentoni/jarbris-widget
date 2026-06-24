import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// TEST-WIDGET — Tier-2. usePurchaseOptions manages selling-plan selection state and builds the
// JARBRIS:addToCart / cartLineUpdate bridge payloads. The commerce-critical bits: the add-to-cart
// guard (block when a selling plan is required but none chosen) and the cart-line payload shape
// (subscription via sellingPlanId). Pure state hook — only config/bridge is mocked.

vi.mock('../../../src/config/bridge.js', () => ({
  BRIDGE_CONFIG: {
    cartMessages: { ADD_TO_CART: 'JARBRIS:addToCart', CART_LINE_UPDATE: 'JARBRIS:cartLineUpdate' },
  },
  postToParent: vi.fn(),
}));

import { postToParent, BRIDGE_CONFIG } from '../../../src/config/bridge.js';
import { usePurchaseOptions } from '../../../src/hooks/usePurchaseOptions';

// Subscription-required product: one variant-specific allocation + one product-level (variantId null).
const product = {
  productId: 'gid://Product/1',
  requiresSellingPlan: true,
  purchaseOptions: {
    requiresSellingPlan: true,
    hasOneTimePurchase: false,
    allocations: [
      { variantId: 'gid://Variant/1', sellingPlanId: 'gid://Plan/v1' },
      { variantId: null, sellingPlanId: 'gid://Plan/product' },
    ],
  },
};

beforeEach(() => {
  // Silence the hook's DEV logger to keep test output clean.
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('usePurchaseOptions — drawer & selection', () => {
  it('openDrawer sets the product context, opens the drawer, and resets the selection', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product, 'gid://Variant/1'));

    expect(result.current.isDrawerOpen).toBe(true);
    expect(result.current.productId).toBe('gid://Product/1');
    expect(result.current.variantId).toBe('gid://Variant/1');
    expect(result.current.sellingPlanId).toBeNull();
    expect(result.current.mode).toBe('one_time');
  });

  it('openDrawer is a no-op when the product has no purchaseOptions', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer({ productId: 'x' }));

    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.productId).toBeNull();
  });

  it('selectPlan switches to subscription; selectOneTime switches back', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product, 'gid://Variant/1'));

    act(() => result.current.selectPlan('gid://Plan/v1'));
    expect(result.current.sellingPlanId).toBe('gid://Plan/v1');
    expect(result.current.mode).toBe('subscription');

    act(() => result.current.selectOneTime());
    expect(result.current.sellingPlanId).toBeNull();
    expect(result.current.mode).toBe('one_time');
  });

  it('selectVariant resets the plan (allocations are variant-specific)', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product, 'gid://Variant/1'));
    act(() => result.current.selectPlan('gid://Plan/v1'));

    act(() => result.current.selectVariant('gid://Variant/2'));
    expect(result.current.variantId).toBe('gid://Variant/2');
    expect(result.current.sellingPlanId).toBeNull();
    expect(result.current.mode).toBe('one_time');
  });

  it('closeDrawer hides the drawer but keeps the selection', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product, 'gid://Variant/1'));
    act(() => result.current.selectPlan('gid://Plan/v1'));

    act(() => result.current.closeDrawer());
    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.sellingPlanId).toBe('gid://Plan/v1'); // selection kept
  });
});

describe('usePurchaseOptions — cart line', () => {
  it('buildCartLine returns merchandiseId+quantity (+sellingPlanId when set), null without a variant', () => {
    const { result } = renderHook(() => usePurchaseOptions());

    expect(result.current.buildCartLine(1)).toBeNull(); // no variant yet

    act(() => result.current.openDrawer(product, 'gid://Variant/1'));
    expect(result.current.buildCartLine(2)).toEqual({
      merchandiseId: 'gid://Variant/1',
      quantity: 2,
    });

    act(() => result.current.selectPlan('gid://Plan/v1'));
    expect(result.current.buildCartLine(1)).toEqual({
      merchandiseId: 'gid://Variant/1',
      quantity: 1,
      sellingPlanId: 'gid://Plan/v1',
    });
  });
});

describe('usePurchaseOptions — add-to-cart guard (commerce)', () => {
  it('blocks add-to-cart when a selling plan is required but none is selected', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product, 'gid://Variant/1'));

    expect(result.current.addToCartBlocked).toBe(true);
    expect(result.current.sendAddToCart(1)).toBe(false);
    expect(postToParent).not.toHaveBeenCalled();
  });

  it('unblocks and sends JARBRIS:addToCart once a plan is selected', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product, 'gid://Variant/1'));
    act(() => result.current.selectPlan('gid://Plan/v1'));

    expect(result.current.addToCartBlocked).toBe(false);
    expect(result.current.sendAddToCart(3)).toBe(true);
    expect(postToParent).toHaveBeenCalledWith({
      type: BRIDGE_CONFIG.cartMessages.ADD_TO_CART,
      merchandiseId: 'gid://Variant/1',
      quantity: 3,
      sellingPlanId: 'gid://Plan/v1',
    });
  });

  it('is never blocked when the product does not require a selling plan', () => {
    const oneTimeProduct = {
      productId: 'gid://Product/2',
      purchaseOptions: { requiresSellingPlan: false, hasOneTimePurchase: true, allocations: [] },
    };
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(oneTimeProduct, 'gid://Variant/9'));

    expect(result.current.addToCartBlocked).toBe(false);
    expect(result.current.sendAddToCart(1)).toBe(true);
    expect(postToParent).toHaveBeenCalledTimes(1);
  });
});

describe('usePurchaseOptions — cart line update', () => {
  it('sends cartLineUpdate with the selected plan; refuses without cartLineId or plan', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product, 'gid://Variant/1'));

    expect(result.current.sendCartLineUpdate('line-1', 2)).toBe(false); // no plan yet
    expect(postToParent).not.toHaveBeenCalled();

    act(() => result.current.selectPlan('gid://Plan/v1'));

    expect(result.current.sendCartLineUpdate('', 2)).toBe(false); // missing cartLineId
    expect(postToParent).not.toHaveBeenCalled();

    expect(result.current.sendCartLineUpdate('line-1', 2)).toBe(true);
    expect(postToParent).toHaveBeenCalledTimes(1);
    expect(postToParent).toHaveBeenCalledWith({
      type: BRIDGE_CONFIG.cartMessages.CART_LINE_UPDATE,
      id: 'line-1',
      sellingPlanId: 'gid://Plan/v1',
      quantity: 2,
    });
  });
});

describe('usePurchaseOptions — availablePlans', () => {
  it('returns all allocations before a variant is chosen', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product)); // no preselected variant
    expect(result.current.availablePlans).toHaveLength(2);
  });

  it('returns the variant-specific allocations when the variant has them', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product, 'gid://Variant/1'));
    expect(result.current.availablePlans).toEqual([
      { variantId: 'gid://Variant/1', sellingPlanId: 'gid://Plan/v1' },
    ]);
  });

  it('falls back to product-level allocations (variantId null) for a variant with none', () => {
    const { result } = renderHook(() => usePurchaseOptions());
    act(() => result.current.openDrawer(product, 'gid://Variant/NONE'));
    expect(result.current.availablePlans).toEqual([
      { variantId: null, sellingPlanId: 'gid://Plan/product' },
    ]);
  });
});
