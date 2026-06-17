/**
 * Iframe Bridge Configuration
 * Defines security parameters for postMessage communication.
 */

let parentOrigin = null;

function setParentOrigin(origin) {
  if (origin && typeof origin === 'string' && origin.startsWith('http')) {
    parentOrigin = origin;
  }
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
 * A payload-less bootstrap signal — a message with only a `type` field and no data.
 * Until the handshake resolves the real parent origin, only these may broadcast to '*': they must
 * reach the parent (including custom-domain storefronts) to START the handshake, and broadcasting
 * them leaks nothing but their type (e.g. JARBRIS:ready / getCart / requestShopDomain).
 */
function isBootstrapSignal(message) {
  return (
    !!message &&
    typeof message === 'object' &&
    'type' in message &&
    Object.keys(message).length === 1
  );
}

/**
 * Safely posts a message to the parent window.
 *
 * SEC-07b (#2): once the handshake has resolved the real parent origin (`parentOrigin`), every
 * message goes to that exact origin. Before then, only payload-less bootstrap signals may broadcast
 * to '*'; a message carrying DATA never goes to '*' — it falls back to the ?shop-derived origin, or
 * is dropped. (The definitive fix — embed.js passing window.location.origin to the iframe so even
 * the first signal targets the real origin on custom domains — is tracked separately.)
 *
 * @param {object} message - Message payload to send
 */
export function postToParent(message) {
  if (typeof window === 'undefined' || !window.parent) return;

  // Post-handshake: the real parent origin is known — always target it exactly.
  if (parentOrigin) {
    window.parent.postMessage(message, parentOrigin);
    return;
  }

  // Pre-handshake: only payload-less signals may broadcast to '*' (to start the handshake).
  if (isBootstrapSignal(message)) {
    window.parent.postMessage(message, '*');
    return;
  }

  // A message carrying data, before the origin is known: try the ?shop-derived origin, never '*'.
  const urlParams = new URLSearchParams(window.location.search);
  const shop = urlParams.get('shop') || urlParams.get('shopDomain');
  if (shop) {
    window.parent.postMessage(message, shop.startsWith('http') ? shop : `https://${shop}`);
    return;
  }

  // No trusted origin and not a bootstrap signal → drop rather than leak data to '*'.
  if (import.meta.env?.DEV) {
    console.warn('[bridge] postToParent dropped (no trusted origin):', message?.type);
  }
}
