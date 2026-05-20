/**
 * Dev-only mock for the Shopify cart bridge and embed.js parent identity.
 * Intercepts JARBRIS:addToCart and JARBRIS:getCheckoutUrl messages
 * and responds with simulated success.
 *
 * Also simulates the JARBRIS:identity postMessage that embed.js sends in production.
 * Without this, identityReady stays false in local dev and the widget never boots.
 *
 * Active ONLY in development (import.meta.env.DEV).
 * Has zero impact in production — the import is tree-shaken out.
 */

if (import.meta.env.DEV) {
  // -- Identity mock (simulates embed.js) --

  const DEV_VISITOR_KEY = 'jarbris_visitor_id';
  const DEV_SESSION_KEY = 'jarbris_session_id';

  const DEV_SESSION_TIME_KEY = 'jarbris_session_time';

  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — mirrors embed.js

  const getOrCreate = (key) => {
    try {
      let val = localStorage.getItem(key);
      if (!val) {
        val = 'dev-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(key, val);
      }
      return val;
    } catch {
      return 'dev-fallback-' + key;
    }
  };

  const touchSessionTime = () => {
    try {
      localStorage.setItem(DEV_SESSION_TIME_KEY, Date.now().toString());
    } catch {
      /* silent */
    }
  };

  // Check if current session has timed out (mirrors embed.js getOrCreateSessionId logic)
  const isSessionExpired = () => {
    try {
      const last = parseInt(localStorage.getItem(DEV_SESSION_TIME_KEY) || '0', 10);
      return Date.now() - last > SESSION_TIMEOUT_MS;
    } catch {
      return false;
    }
  };

  const devVisitorId = getOrCreate(DEV_VISITOR_KEY);

  // Rotate session if expired
  let devSessionId;
  if (isSessionExpired()) {
    devSessionId = 'dev-' + Math.random().toString(36).slice(2, 10);
    try {
      localStorage.setItem(DEV_SESSION_KEY, devSessionId);
    } catch {
      /* silent */
    }
    console.log('[DEV MOCK] Session expired — new sessionId:', devSessionId);
  } else {
    devSessionId = getOrCreate(DEV_SESSION_KEY);
  }
  touchSessionTime(); // Refresh timestamp on each load

  const devShopDomain = import.meta.env.VITE_DEV_SHOP_DOMAIN || 'tito-sport-6129.myshopify.com';

  // Mirror prod embed.js: respond to JARBRIS:ready with identity.
  // useChat.js sends JARBRIS:ready after registering its message listener.
  // This guarantees the identity arrives AFTER the listener is ready — no timing issues.
  const sendIdentity = (sessionId) => {
    window.postMessage(
      { type: 'JARBRIS:shopDomain', shopDomain: devShopDomain, visitorId: devVisitorId, sessionId },
      '*',
    );
    window.postMessage({ type: 'JARBRIS:identity', visitorId: devVisitorId, sessionId }, '*');
  };

  // Handle JARBRIS:requestNewSession (clearChat delegates to parent in B22)
  window.addEventListener('message', (event) => {
    // JARBRIS:ready — widget signals its listener is registered, respond with identity
    // This mirrors embed.js prod behavior (embed.js line 341)
    if (event.data?.type === 'JARBRIS:ready') {
      sendIdentity(devSessionId);
    }

    // JARBRIS:fatalError — widget crashed, hide it (mirrors embed.js removing the iframe in prod)
    if (event.data?.type === 'JARBRIS:fatalError') {
      const root = document.getElementById('root');
      if (root) root.style.display = 'none';
      console.warn('[DEV MOCK] Widget fatal error — widget hidden. Reload to restore.');
    }

    if (event.data?.type === 'JARBRIS:requestNewSession') {
      try {
        localStorage.removeItem(DEV_SESSION_KEY);
      } catch {
        // silent
      }
      const newSessionId = 'dev-' + Math.random().toString(36).slice(2, 10);
      try {
        localStorage.setItem(DEV_SESSION_KEY, newSessionId);
      } catch {
        // silent
      }
      touchSessionTime();
      setTimeout(() => {
        window.postMessage(
          { type: 'JARBRIS:identity', visitorId: devVisitorId, sessionId: newSessionId },
          '*',
        );
      }, 50);
    }

    // Mock: Add to Cart
    if (event.data?.type === 'JARBRIS:addToCart') {
      setTimeout(() => {
        window.postMessage({ type: 'JARBRIS:addToCartResponse', success: true }, '*');
      }, 600);
    }

    // Mock: Get Checkout URL
    if (event.data?.type === 'JARBRIS:getCheckoutUrl') {
      setTimeout(() => {
        window.postMessage(
          {
            type: 'JARBRIS:checkoutUrlResponse',
            checkoutUrl: 'https://example-store.myshopify.com/checkout',
            itemCount: 2,
          },
          '*',
        );
      }, 300);
    }
  });

  console.log(
    '[DEV MOCK] Identity mock active — visitorId:',
    devVisitorId,
    '| sessionId:',
    devSessionId,
  );
  console.log('[DEV MOCK] Shopify cart bridge mock active');

  // Dev helper: simulate passive session expiry (B27 test).
  // Call window.__jarbris_devRotateSession() from the browser console to trigger
  // the exact same flow that embed.js produces after a 30-min timeout:
  // a new sessionId is generated and sent via JARBRIS:identity, with the server
  // having no history for it.
  window.__jarbris_devRotateSession = () => {
    const newId = 'dev-rotated-' + Math.random().toString(36).slice(2, 10);
    try {
      localStorage.setItem(DEV_SESSION_KEY, newId);
      localStorage.setItem(DEV_SESSION_TIME_KEY, Date.now().toString());
    } catch {
      /* silent */
    }
    window.postMessage(
      { type: 'JARBRIS:identity', visitorId: devVisitorId, sessionId: newId },
      '*',
    );
    console.log('[DEV MOCK] Session rotated — new sessionId:', newId);
    console.log('[DEV MOCK] Expected: widget clears to welcome message only.');
  };
  console.log(
    '[DEV MOCK] Session rotation helper ready — call window.__jarbris_devRotateSession() to test B27',
  );
}
