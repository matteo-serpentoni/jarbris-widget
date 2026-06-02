/**
 * CheckoutEmbedService
 *
 * Manages the Shopify checkout presentation inside the widget.
 *
 * Architecture:
 *   - V1 (current): Popup checkout with new-tab fallback
 *   - V2 (future):  Shopify Checkout Kit Web (<shopify-checkout> web component)
 *                    via official CDN or npm when stable release is available.
 *                    See: https://shopify.dev/docs/storefronts/mobile/checkout-kit
 *                    See: https://shopify.engineering/ucp (ECP section)
 *
 * The service handles:
 *   a) Requesting checkout URL from host via bridge
 *   b) Requesting checkout config from jarbris-api (for future inline mode)
 *   c) Presenting checkout (popup or new tab)
 *   d) Listening for checkout lifecycle events
 *   e) Cleanup on close/complete
 *
 * CHECKOUT KIT INTEGRATION POINT:
 *   When @shopify/checkout-kit becomes available on npm (or the CDN path
 *   moves from /unstable/ to a stable version), replace openCheckoutPopup()
 *   with the official <shopify-checkout> web component:
 *
 *     const checkout = document.createElement('shopify-checkout');
 *     checkout.src = checkoutUrl;
 *     checkout.open();
 *
 *   The useCheckout hook and CheckoutView component are already architected
 *   to support inline mode — only this service file needs to change.
 */

import { BRIDGE_CONFIG, postToParent } from '../config/bridge';
import { getWidgetToken } from './widgetTokenStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Pending bridge response callback — stores { resolve, reject } for the active request
let pendingCallback = null;

/**
 * Listens for the JARBRIS:checkoutUrlResponse bridge message (one-shot).
 *
 * @returns {Promise<{ checkoutUrl: string|null, itemCount: number }>}
 */
function requestCheckoutUrl() {
  return new Promise((resolve, reject) => {
    // Supersede any stale request
    pendingCallback = { resolve, reject };

    // Request from host
    postToParent({ type: BRIDGE_CONFIG.checkoutMessages.GET_URL });

    // Timeout after 8 seconds
    setTimeout(() => {
      if (pendingCallback?.resolve === resolve) {
        pendingCallback = null;
        reject(new Error('checkout_url_timeout'));
      }
    }, 8000);
  });
}

// Bridge listener — registered once
let bridgeListenerRegistered = false;

function ensureBridgeListener() {
  if (bridgeListenerRegistered) return;
  bridgeListenerRegistered = true;

  window.addEventListener('message', (event) => {
    if (!BRIDGE_CONFIG.isValidOrigin(event.origin, null, event.data?.type)) return;

    if (event.data?.type === BRIDGE_CONFIG.checkoutMessages.URL_RESPONSE) {
      if (pendingCallback) {
        const { resolve } = pendingCallback;
        pendingCallback = null;
        resolve({
          checkoutUrl: event.data.checkoutUrl || null,
          itemCount: event.data.itemCount || 0,
          error: event.data.error || null,
        });
      }
    }
  });
}

/**
 * Fetches checkout configuration from the API.
 * Returns the checkout mode and optional config for future inline support.
 *
 * V1: Always returns 'popup' mode (inline not yet available).
 * V2: Will return 'inline' when Checkout Kit Web is stable and merchant
 *     has configured storefrontAccessToken + inlineEnabled.
 *
 * @returns {Promise<{ mode: 'inline' | 'popup', accessToken?: string }>}
 */
async function fetchCheckoutConfig() {
  try {
    const token = getWidgetToken();
    const response = await fetch(`${API_URL}/api/widget/checkout-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Widget-Token': token } : {}),
      },
    });

    if (!response.ok) {
      return { mode: 'popup' };
    }

    const data = await response.json();
    if (data.success) {
      return {
        mode: data.mode || 'popup',
        accessToken: data.accessToken || null,
      };
    }

    return { mode: 'popup' };
  } catch {
    // Network error — degrade to popup
    return { mode: 'popup' };
  }
}

/**
 * Attempts to open checkout in a popup window.
 * Returns the popup window reference, or null if blocked by browser.
 *
 * @param {string} url - The checkout URL
 * @returns {Window|null}
 */
function openCheckoutPopup(url) {
  const width = 480;
  const height = 720;
  const left = Math.max(0, (window.screen.width - width) / 2);
  const top = Math.max(0, (window.screen.height - height) / 2);

  const popup = window.open(
    url,
    'jarbris_checkout',
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
  );

  return popup;
}

/**
 * Sends the checkout fallback message to the host
 * (opens checkout in a new tab via embed.js).
 */
function openCheckoutNewTab() {
  postToParent({ type: BRIDGE_CONFIG.checkoutMessages.FALLBACK });
}

/**
 * Notifies the host that checkout completed.
 * Triggers cart resync on the storefront side.
 */
function notifyCheckoutComplete() {
  postToParent({ type: BRIDGE_CONFIG.checkoutMessages.COMPLETE });
}

/**
 * Monitors a popup window for closure.
 * Calls the callback when the popup is closed.
 *
 * @param {Window} popup
 * @param {function} onClosed
 * @returns {function} cleanup — call to stop monitoring
 */
function monitorPopup(popup, onClosed) {
  const interval = setInterval(() => {
    if (!popup || popup.closed) {
      clearInterval(interval);
      onClosed();
    }
  }, 500);

  return () => clearInterval(interval);
}

export {
  requestCheckoutUrl,
  fetchCheckoutConfig,
  openCheckoutPopup,
  openCheckoutNewTab,
  notifyCheckoutComplete,
  monitorPopup,
  ensureBridgeListener,
};
