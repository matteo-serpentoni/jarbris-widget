/**
 * jarbris-tracker.js
 *
 * Lightweight, zero-dependency tracking script for Shopify storefronts.
 * Budget: strictly < 5KB.
 *
 * Capabilities:
 * - Queueing and batching telemetry events (5s flush or 25 item max)
 * - sendBeacon offload on beforeunload
 * - Storefront Authentication via short-lived public ingest tokens
 * - Strict Shopify GDPR Privacy API enforcement
 */

(function () {
  if (window.JarbrisTracker) return;

  const CONFIG = window.JarbrisConfig || {};
  const SITE_ID = CONFIG.siteId;
  const API_BASE = CONFIG.apiBase || 'https://api.yuume.ai';

  if (!SITE_ID) {
    console.warn('[Jarbris] Missing siteId in configuration');
    return;
  }

  // Session Management
  const SESSION_KEY = 'jarbris_sess_id';
  const ANON_KEY = 'jarbris_visitor_id'; // Unified with embed.js for cross-system identity stitching
  const TOKEN_KEY = `jarbris_ingest_${SITE_ID}`;
  // Phase 3: Jarbris analytics consent key (set by widget consentBridge.js)
  const JARBRIS_CONSENT_KEY = 'jarbris_analytics_consent';

  const getSessionId = () => {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = 'sess_' + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  };

  const getAnonId = () => {
    // Migration: rename legacy key to unified name
    var legacy = localStorage.getItem('jarbris_anon_id');
    if (legacy) {
      localStorage.setItem(ANON_KEY, legacy);
      localStorage.removeItem('jarbris_anon_id');
      return legacy;
    }
    let aid = localStorage.getItem(ANON_KEY);
    if (!aid) {
      aid = 'visitor_' + Math.random().toString(36).substr(2, 9) + Date.now();
      localStorage.setItem(ANON_KEY, aid);
    }
    return aid;
  };

  // Phase 3: Boot-time Jarbris consent state.
  // Reads window.JARBRIS_PRIVACY (set after widget backend sync) first,
  // then falls back to localStorage (set by consentBridge on toggle).
  // Default: false (opt-in required, never opt-out by default).
  let jarbrisConsentGranted = (() => {
    if (window.JARBRIS_PRIVACY?.analyticsConsent === true) return true;
    if (window.JARBRIS_PRIVACY?.analyticsConsent === false) return false;
    try {
      return localStorage.getItem(JARBRIS_CONSENT_KEY) === 'true';
    } catch {
      return false;
    }
  })();

  // Phase 3: React instantly to consent changes from the widget
  window.addEventListener('jarbris:analytics-consent-changed', (e) => {
    jarbrisConsentGranted = e.detail?.analyticsConsent === true;
    if (!jarbrisConsentGranted) {
      queue = []; // Hard drop: clear pending analytics events immediately
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }
    }
  });

  // State
  let ingestToken = localStorage.getItem(TOKEN_KEY);
  let queue = [];
  let flushTimeout = null;

  // --- Auth & Token Management ---
  const fetchIngestToken = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/events/token/${SITE_ID}`);
      const data = await res.json();
      if (data.success && data.token) {
        ingestToken = data.token;
        // Cache token, expiring 5 minutes before real expiration
        const expireTime = new Date().getTime() + (data.expiresIn - 300) * 1000;
        localStorage.setItem(TOKEN_KEY, ingestToken);
        localStorage.setItem(TOKEN_KEY + '_exp', expireTime);
        return true;
      }
    } catch (_) {
      // Failed silently to avoid console spam
    }
    return false;
  };

  const ensureValidToken = async () => {
    const exp = localStorage.getItem(TOKEN_KEY + '_exp');
    if (!ingestToken || !exp || new Date().getTime() > parseInt(exp, 10)) {
      await fetchIngestToken();
    }
    return ingestToken != null;
  };

  // --- GDPR Consent ---
  const hasConsent = () => {
    // Check Shopify Customer Privacy API first
    const shopifyPrivacy = window.Shopify && window.Shopify.customerPrivacy;
    if (shopifyPrivacy && typeof shopifyPrivacy.analyticsProcessingAllowed === 'function') {
      return shopifyPrivacy.analyticsProcessingAllowed() === true;
    }
    // Fallback if API not ready or non-Shopify: assume implicit false if strict GDPR is enabled,
    // but typically Shopify loads this immediately. If missing, we track conservatively based on config.
    return CONFIG.defaultConsent === true;
  };

  // --- Network ---
  const flushQueue = async (useBeacon = false) => {
    if (queue.length === 0) return;
    if (!hasConsent()) {
      queue = []; // Drop silently
      return;
    }

    const hasToken = await ensureValidToken();
    if (!hasToken) return;

    const currentBatch = queue.splice(0, 25);

    // Attempt fallback to Shopify customer if available in global object
    let customerRef = null;
    if (window.meta && window.meta.page && window.meta.page.customerId) {
      customerRef = window.meta.page.customerId.toString(); // this is shopify id, backend identityService will parse it
    }

    const payload = {
      siteId: SITE_ID,
      sessionId: getSessionId(),
      source: 'storefront',
      identity: { anonId: getAnonId(), shopifyCustomerId: customerRef },
      events: currentBatch,
    };

    const url = `${API_BASE}/api/events`;

    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }

    try {
      if (useBeacon) {
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Ingest-Token': ingestToken,
          },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      } else {
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Ingest-Token': ingestToken,
          },
          body: JSON.stringify(payload),
        });
      }
    } catch (_) {
      // In case of network error, re-queue if not unload
      if (!useBeacon) queue.push(...currentBatch);
    }
  };

  // --- Core API ---
  const track = (eventType, properties = {}) => {
    // Phase 3 Gate 1 (Primary): Jarbris opt-in consent must be explicitly granted.
    // Default is false — no tracking without explicit user action.
    if (!jarbrisConsentGranted) return;

    // Gate 2 (Secondary): Shopify Customer Privacy API compliance.
    // Both gates must pass — the more restrictive one wins.
    if (!hasConsent()) return;

    queue.push({
      eventType,
      ...properties,
    });

    if (queue.length >= 25) {
      clearTimeout(flushTimeout);
      flushQueue();
    } else if (!flushTimeout) {
      flushTimeout = setTimeout(() => {
        flushTimeout = null;
        flushQueue();
      }, 5000);
    }
  };

  // --- Automatic Collectors ---
  const collectPageView = () => {
    const properties = {
      url: window.location.href,
      path: window.location.pathname,
    };

    // Shopify meta parsing for pageType
    if (window.meta && window.meta.page) {
      properties.pageType = window.meta.page.pageType;

      // Hoist product details if on product page
      if (properties.pageType === 'product') {
        const productInfo = window.meta.product || {};
        properties.productId = productInfo.id ? productInfo.id.toString() : null;
        properties.variantId =
          productInfo.variants && productInfo.variants[0]
            ? productInfo.variants[0].id.toString()
            : null;
      }
    }

    track('page_viewed', properties);
  };

  const setupListeners = () => {
    // Handle unload explicitly via beacon
    window.addEventListener('beforeunload', () => {
      flushQueue(true);
    });

    // Add to cart interception (Basic fallback over DOM)
    document.addEventListener('submit', (e) => {
      if (e.target && e.target.action && e.target.action.includes('/cart/add')) {
        const formData = new FormData(e.target);
        const productInfo = (window.meta && window.meta.product) || {};
        track('add_to_cart', {
          productId: productInfo.id ? productInfo.id.toString() : null,
          variantId: formData.get('id') || null,
          eventData: {
            quantity: parseInt(formData.get('quantity'), 10) || 1,
            productTitle: productInfo.title || null,
            variantTitle:
              productInfo.variants && productInfo.variants[0]
                ? productInfo.variants[0].title
                : null,
            price: productInfo.price ? productInfo.price / 100 : null,
            productType: productInfo.type || null,
          },
        });
      }
    });

    // Search form interception
    document.addEventListener('submit', (e) => {
      if (e.target && e.target.action && e.target.action.includes('/search')) {
        const formData = new FormData(e.target);
        track('search_submitted', {
          query: formData.get('q') || '',
        });
      }
    });

    // Handle AJAX Add to Cart (overriding fetch/XHR is risky, better to use Shopify Web Pixels but we do minimal fetch wrap for V1)
    const originalFetch = window.fetch;
    window.fetch = async function () {
      const args = arguments;
      if (typeof args[0] === 'string' && args[0].includes('/cart/add.js')) {
        try {
          const body = args[1]?.body ? JSON.parse(args[1].body) : {};
          // Fire tracking from request body first (immediate signal)
          const productInfo = (window.meta && window.meta.product) || {};
          track('add_to_cart', {
            productId: body.product_id
              ? body.product_id.toString()
              : productInfo.id
                ? productInfo.id.toString()
                : null,
            variantId: body.id?.toString() || null,
            eventData: {
              quantity: parseInt(body.quantity, 10) || 1,
              productTitle: productInfo.title || null,
              variantTitle: body.title || null,
              price: body.price ? body.price / 100 : null,
              productType: productInfo.type || null,
            },
          });
        } catch {
          /* fetch body parse failed — skip cart tracking */
        }
      }
      return originalFetch.apply(this, args);
    };
  };

  // --- Initialize ---
  window.JarbrisTracker = { track };
  collectPageView();
  setupListeners();
})();
