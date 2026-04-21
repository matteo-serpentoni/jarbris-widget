import { useState, useCallback } from 'react';
import { BRIDGE_CONFIG } from '../config/bridge.js';

// Lightweight DEV-only logger — no external dependency.
const isDev = import.meta.env.DEV;
const log = (level, msg, data) => {
  if (!isDev) return;
  console[level](`[usePurchaseOptions] ${msg}`, data ?? '');
};

/**
 * @typedef {Object} PurchaseSelectionState
 * @property {string|null}  productId     - Active product GID
 * @property {string|null}  variantId     - Selected variant GID (null = not yet chosen)
 * @property {string|null}  sellingPlanId - Selected selling plan GID (null = one-time)
 * @property {'one_time'|'subscription'} mode - Purchase mode
 * @property {Object|null}  purchaseOptions - Full normalized purchaseOptions from API
 * @property {boolean}      isDrawerOpen  - Whether the drawer is visible
 */

const INITIAL_STATE = {
  productId: null,
  variantId: null,
  sellingPlanId: null,
  mode: 'one_time',
  purchaseOptions: null,
  isDrawerOpen: false,
};

/**
 * usePurchaseOptions — manages selling plan selection state for the widget.
 *
 * Responsibilities:
 *  - Open/close the PurchaseOptionsDrawer with the correct product context
 *  - Track selected sellingPlanId and purchase mode
 *  - Guard add-to-cart when requiresSellingPlan = true and no plan is selected
 *  - Build the CartLineInput payload for JARBRIS:addToCart
 *
 * Does NOT send postMessage — callers (Chat.jsx) do the actual bridge send.
 */
export function usePurchaseOptions() {
  const [state, setState] = useState(INITIAL_STATE);

  /**
   * Open the purchase options drawer for a product.
   * Resets any previous selection.
   *
   * @param {Object} product - Widget-formatted product (from formatMongoProduct)
   * @param {string|null} [variantId] - Pre-selected variant GID (optional)
   */
  const openDrawer = useCallback((product, variantId = null) => {
    const canonicalId = product?.productId || product?.id;
    if (!canonicalId || !product?.purchaseOptions) {
      log('warn', 'openDrawer: missing product or purchaseOptions', {
        productId: canonicalId,
        hasPurchaseOptions: !!product?.purchaseOptions,
      });
      return;
    }

    log('info', 'open_purchase_options_drawer', {
      productId: canonicalId,
      variantId,
      requiresSellingPlan: product.requiresSellingPlan,
      allocationCount: product.purchaseOptions?.allocations?.length ?? 0,
    });

    setState({
      productId: canonicalId,
      variantId: variantId || null,
      sellingPlanId: null,
      mode: 'one_time',
      purchaseOptions: product.purchaseOptions,
      isDrawerOpen: true,
    });
  }, []);

  /**
   * Close the drawer and reset state.
   */
  const closeDrawer = useCallback(() => {
    setState((prev) => ({ ...prev, isDrawerOpen: false }));
  }, []);

  /**
   * Select a specific selling plan.
   * @param {string} sellingPlanId - Shopify SellingPlan GID
   */
  const selectPlan = useCallback((sellingPlanId) => {
    log('info', 'select_selling_plan', { sellingPlanId });
    setState((prev) => ({
      ...prev,
      sellingPlanId,
      mode: 'subscription',
    }));
  }, []);

  /**
   * Switch back to one-time purchase mode.
   */
  const selectOneTime = useCallback(() => {
    log('info', 'select_one_time_purchase', {});
    setState((prev) => ({
      ...prev,
      sellingPlanId: null,
      mode: 'one_time',
    }));
  }, []);

  /**
   * Select a variant. Resets plan selection since allocations are variant-specific.
   * @param {string} variantId - Shopify ProductVariant GID
   */
  const selectVariant = useCallback((variantId) => {
    setState((prev) => ({
      ...prev,
      variantId,
      sellingPlanId: null,
      mode: 'one_time',
    }));
  }, []);

  /**
   * Build the CartLineInput payload for JARBRIS:addToCart.
   * @param {number} [quantity=1]
   * @returns {{ merchandiseId: string, quantity: number, sellingPlanId?: string } | null}
   */
  const buildCartLine = useCallback(
    (quantity = 1) => {
      if (!state.variantId) {
        log('warn', 'buildCartLine: no variantId selected', { productId: state.productId });
        return null;
      }

      const cartLine = { merchandiseId: state.variantId, quantity };
      if (state.sellingPlanId) cartLine.sellingPlanId = state.sellingPlanId;

      log('info', 'build_cart_line', {
        productId: state.productId,
        variantId: state.variantId,
        sellingPlanId: state.sellingPlanId || null,
        mode: state.mode,
      });

      return cartLine;
    },
    [state.productId, state.variantId, state.sellingPlanId, state.mode],
  );

  /**
   * Derive available selling plan allocations for the currently selected variant.
   * Returns all allocations if no variantId is set yet.
   */
  const availablePlans = (() => {
    const allocations = state.purchaseOptions?.allocations || [];
    if (!state.variantId) return allocations;
    // Shopify Admin API returns allocations with variantId: null (product-level plans).
    // These apply to all variants, so we include them alongside variant-specific ones.
    const variantSpecific = allocations.filter((a) => a.variantId === state.variantId);
    if (variantSpecific.length > 0) return variantSpecific;
    return allocations.filter((a) => a.variantId === null || a.variantId === undefined);
  })();

  /**
   * Guard: true when requiresSellingPlan = true and no plan is selected.
   */
  const requiresSellingPlan = state.purchaseOptions?.requiresSellingPlan === true;
  const addToCartBlocked =
    requiresSellingPlan && state.mode === 'one_time' && state.sellingPlanId === null;

  /**
   * Convenience: send JARBRIS:addToCart via bridge for the current selection.
   * @param {number} [quantity=1]
   * @returns {boolean} Whether the message was sent
   */
  const sendAddToCart = useCallback(
    (quantity = 1) => {
      if (addToCartBlocked) {
        log('warn', 'sendAddToCart blocked: no plan selected', { productId: state.productId });
        return false;
      }

      const cartLine = buildCartLine(quantity);
      if (!cartLine) return false;

      log('info', 'send_add_to_cart', {
        productId: state.productId,
        variantId: cartLine.merchandiseId,
        sellingPlanId: cartLine.sellingPlanId || null,
        quantity,
      });

      window.parent.postMessage({ type: BRIDGE_CONFIG.cartMessages.ADD_TO_CART, ...cartLine }, '*');
      return true;
    },
    [addToCartBlocked, buildCartLine, state.productId],
  );

  /**
   * Send JARBRIS:cartLineUpdate via bridge (plan change after item added to cart).
   * @param {string} cartLineId - Shopify CartLine ID
   * @param {number} [quantity]
   * @returns {boolean} Whether the message was sent
   */
  const sendCartLineUpdate = useCallback(
    (cartLineId, quantity) => {
      if (!cartLineId || !state.sellingPlanId) {
        log('warn', 'sendCartLineUpdate: missing cartLineId or sellingPlanId', { cartLineId });
        return false;
      }

      const payload = {
        type: BRIDGE_CONFIG.cartMessages.CART_LINE_UPDATE,
        id: cartLineId,
        sellingPlanId: state.sellingPlanId,
        ...(quantity != null ? { quantity } : {}),
      };

      log('info', 'send_cart_line_update', {
        cartLineId,
        sellingPlanId: state.sellingPlanId,
        quantity,
      });

      window.parent.postMessage(payload, '*');
      return true;
    },
    [state.sellingPlanId],
  );

  return {
    // State
    productId: state.productId,
    variantId: state.variantId,
    sellingPlanId: state.sellingPlanId,
    mode: state.mode,
    isDrawerOpen: state.isDrawerOpen,
    availablePlans,
    addToCartBlocked,
    requiresSellingPlan,
    hasOneTimePurchase: state.purchaseOptions?.hasOneTimePurchase ?? true,

    // Actions
    openDrawer,
    closeDrawer,
    selectPlan,
    selectOneTime,
    selectVariant,
    buildCartLine,
    sendAddToCart,
    sendCartLineUpdate,
  };
}
