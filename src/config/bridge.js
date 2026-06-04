/**
 * Iframe Bridge Configuration
 * Defines security parameters for postMessage communication.
 */

let parentOrigin = null;

export function setParentOrigin(origin) {
  if (origin && typeof origin === 'string' && origin.startsWith('http')) {
    parentOrigin = origin;
  }
}

export function getParentOrigin() {
  return parentOrigin;
}

export const BRIDGE_CONFIG = {
  // Allowed origins for incoming messages
  // In production, this should only include the merchant's domain and official previews
  whitelist: [
    'http://localhost:5173', // Local Dev
    'http://localhost:5001', // Local API
    'https://app.jarbris.com',
    'https://widget.jarbris.com',
    'https://jarbris-widget.vercel.app',
    'https://jarbris-app.vercel.app',
    'https://cdn.shopify.com', // Shopify Previews
  ],

  // Prefix required for all Jarbris-related messages
  prefix: 'JARBRIS:',

  // Helper to validate origin
  isValidOrigin: (origin, authorizedDomain = null, messageType = null) => {
    if (import.meta.env.DEV) {
      setParentOrigin(origin);
      return true; // Relaxed for local dev
    }

    // 1. Check official whitelist (Dashboard, CDN, etc.)
    const isWhitelisted = BRIDGE_CONFIG.whitelist.some((allowed) => origin.startsWith(allowed));
    if (isWhitelisted) {
      setParentOrigin(origin);
      return true;
    }

    // 2. Secure Check: If we have a verified domain from the backend, we lock to it
    if (authorizedDomain) {
      const normalizedDomain = authorizedDomain.startsWith('http')
        ? authorizedDomain
        : `https://${authorizedDomain}`;
      if (origin === normalizedDomain) {
        setParentOrigin(origin);
        return true;
      }
      return false;
    }

    // 3. Bootstrap Handshake: If we don't have an authorized domain yet,
    // we allow messages that follow our protocol (JARBRIS: prefix).
    // This allows custom domains to initiate the handshake.
    if (!authorizedDomain && messageType && BRIDGE_CONFIG.hasPrefix(messageType)) {
      setParentOrigin(origin);
      return true;
    }

    return false;
  },

  // Helper to check if message has correct prefix
  hasPrefix: (messageType) => {
    return typeof messageType === 'string' && messageType.startsWith(BRIDGE_CONFIG.prefix);
  },

  // Standard checkout message types (for reference / documentation)
  checkoutMessages: {
    GET_URL: 'JARBRIS:getCheckoutUrl',
    URL_RESPONSE: 'JARBRIS:checkoutUrlResponse',
    FALLBACK: 'JARBRIS:checkoutFallback',
    COMPLETE: 'JARBRIS:checkoutComplete',
  },

  // Cart message types — used by usePurchaseOptions + useChat
  cartMessages: {
    ADD_TO_CART: 'JARBRIS:addToCart',
    CART_LINE_UPDATE: 'JARBRIS:cartLineUpdate',
  },

  // Widget-internal action signals (not postMessage — consumed by useChat)
  widgetActions: {
    OPEN_PURCHASE_OPTIONS_DRAWER: 'OPEN_PURCHASE_OPTIONS_DRAWER',
  },
};

/**
 * Safely posts a message to the parent window.
 * Resolves the parent origin from the URL query parameters synchronously.
 * Falls back to '*' if no valid origin can be resolved from the URL.
 *
 * @param {object} message - Message payload to send
 */
export function postToParent(message) {
  if (typeof window === 'undefined' || !window.parent) return;

  const urlParams = new URLSearchParams(window.location.search);
  const shop = urlParams.get('shop') || urlParams.get('shopDomain');

  let targetOrigin = parentOrigin;
  if (!targetOrigin && shop) {
    targetOrigin = shop.startsWith('http') ? shop : `https://${shop}`;
  }
  if (!targetOrigin) {
    targetOrigin = '*';
  }

  window.parent.postMessage(message, targetOrigin);
}
