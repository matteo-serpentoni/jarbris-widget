/**
 * Iframe Bridge Configuration
 * Defines security parameters for postMessage communication.
 */

export const BRIDGE_CONFIG = {
  // Allowed origins for incoming messages
  // In production, this should only include the merchant's domain and official previews
  whitelist: [
    'http://localhost:5173', // Local Dev
    'http://localhost:5001', // Local API
    'https://yuumechat.com',
    'https://widget.yuumechat.com',
    'https://jarbris-widget.vercel.app',
    'https://jarbris-dashboard.vercel.app',
    'https://cdn.shopify.com', // Shopify Previews
  ],

  // Prefix required for all Jarbris-related messages
  prefix: 'JARBRIS:',

  // Helper to validate origin
  isValidOrigin: (origin, authorizedDomain = null, messageType = null) => {
    if (import.meta.env.DEV) return true; // Relaxed for local dev

    // 1. Check official whitelist (Dashboard, CDN, etc.)
    const isWhitelisted = BRIDGE_CONFIG.whitelist.some((allowed) => origin.startsWith(allowed));
    if (isWhitelisted) return true;

    // 2. Secure Check: If we have a verified domain from the backend, we lock to it
    if (authorizedDomain) {
      const normalizedDomain = authorizedDomain.startsWith('http')
        ? authorizedDomain
        : `https://${authorizedDomain}`;
      return origin === normalizedDomain;
    }

    // 3. Bootstrap Handshake: If we don't have an authorized domain yet,
    // we allow messages that follow our protocol (JARBRIS: prefix).
    // This allows custom domains to initiate the handshake.
    if (!authorizedDomain && messageType && BRIDGE_CONFIG.hasPrefix(messageType)) {
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
