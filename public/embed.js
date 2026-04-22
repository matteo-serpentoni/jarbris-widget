(function () {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CONFIGURAZIONE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const currentScript = document.currentScript || document.querySelector('script[src*="embed.js"]');
  const scriptUrl = currentScript?.src;

  let shopParam = '';
  let siteIdParam = '';

  // Theme App Extension: read from data attributes (set by Liquid block)
  if (currentScript) {
    shopParam = currentScript.getAttribute('data-shop') || '';
    tokenParam = currentScript.getAttribute('data-token') || '';
    siteIdParam = currentScript.getAttribute('data-site-id') || '';
  }

  // Fallback: legacy URL params (ScriptTag transition period)
  if (!shopParam && scriptUrl) {
    try {
      const url = new URL(scriptUrl);
      shopParam = url.searchParams.get('shop') || '';
      siteIdParam = url.searchParams.get('siteId') || '';
      tokenParam = tokenParam || url.searchParams.get('token') || '';
    } catch (e) {
      // Error parsing script URL
    }
  }

  const SHOP_DOMAIN = shopParam || window.location.hostname;
  const SITE_ID = siteIdParam || 'shopify_' + SHOP_DOMAIN.split('.')[0];
  var tokenParam = tokenParam || '';

  const isDevelopment =
    ['localhost', '127.0.0.1', ''].includes(window.location.hostname) ||
    ['8080', '3000', '5173'].includes(window.location.port);

  const config = {
    development: {
      widgetUrl: 'http://localhost:5173/?embed=true',
      apiUrl: 'http://localhost:5001',
    },
    production: {
      widgetUrl: 'https://yuumechat.com/widget/?embed=true',
      apiUrl: 'https://yuume-backend-production.up.railway.app',
    },
  };

  const env = isDevelopment ? 'development' : 'production';
  const API_URL = config[env].apiUrl;
  const WIDGET_URL = config[env].widgetUrl;
  const WIDGET_ORIGIN = new URL(WIDGET_URL).origin;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IDENTITY & SESSION MANAGEMENT (Parent-side — source of truth)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  var SESSION_KEY = 'jarbris_session_id';
  var SESSION_TIME_KEY = 'jarbris_session_time';
  var SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  function getVisitorId() {
    try {
      // Migration: rename legacy keys to unified name
      var legacy = localStorage.getItem('jarbris_visitor_id');
      if (legacy) {
        localStorage.setItem('jarbris_visitor_id', legacy);
        localStorage.removeItem('jarbris_visitor_id');
        return legacy;
      }
      var legacyAnon = localStorage.getItem('jarbris_anon_id');
      if (legacyAnon) {
        localStorage.setItem('jarbris_visitor_id', legacyAnon);
        localStorage.removeItem('jarbris_anon_id');
        return legacyAnon;
      }
      var id = localStorage.getItem('jarbris_visitor_id');
      if (!id) {
        id = 'visitor_' + Math.random().toString(36).substr(2, 9) + Date.now();
        localStorage.setItem('jarbris_visitor_id', id);
      }
      return id;
    } catch (e) {
      // localStorage blocked (extreme privacy settings) — ephemeral in-memory only
      return 'visitor_' + Math.random().toString(36).substr(2, 9) + Date.now();
    }
  }

  function getOrCreateSessionId() {
    try {
      var existing = localStorage.getItem(SESSION_KEY);
      var savedTime = localStorage.getItem(SESSION_TIME_KEY);
      if (existing && savedTime) {
        var elapsed = Date.now() - parseInt(savedTime, 10);
        if (elapsed < SESSION_TIMEOUT) {
          localStorage.setItem(SESSION_TIME_KEY, Date.now().toString());
          return existing;
        }
      }
      var id = 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now();
      localStorage.setItem(SESSION_KEY, id);
      localStorage.setItem(SESSION_TIME_KEY, Date.now().toString());
      return id;
    } catch (e) {
      // localStorage blocked — generate ephemeral session per pageview
      return 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now();
    }
  }

  function touchSessionTime() {
    try {
      localStorage.setItem(SESSION_TIME_KEY, Date.now().toString());
    } catch (e) {
      // Silent — localStorage may be blocked
    }
  }

  // Persistent cross-session visitor ID (1st-party localStorage)
  var VISITOR_ID = getVisitorId();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // UTILITY FUNCTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function getShopifyIdentity() {
    try {
      // 1. Standard Shopify Analytics (ID only)
      const customerId = window.ShopifyAnalytics?.meta?.page?.customerId;

      // 2. Extended Shopify object (some themes include this)
      const customer = window.Shopify?.customer;

      // 3. Fallback: Shopify __st object
      const stCustomerId = window.__st?.cid;

      // 4. Fallback: Trekkie library (often present in Shopify stores)
      const trekkieId = window.ShopifyAnalytics?.lib?.trekkie?.customer?.id;

      const finalId = customerId || customer?.id || stCustomerId || trekkieId;
      const finalEmail =
        customer?.email || window.ShopifyAnalytics?.lib?.trekkie?.customer?.email || null;

      if (finalId) {
        return {
          id: finalId,
          email: finalEmail ? finalEmail.toLowerCase() : null, // Normalize email
          isVerified: true,
        };
      }
    } catch (e) {
      // Silent error for identity detection
    }
    return null;
  }

  function hasAnalyticsConsent() {
    // Check Shopify Customer Privacy API first
    const shopifyPrivacy = window.Shopify && window.Shopify.customerPrivacy;
    if (shopifyPrivacy && typeof shopifyPrivacy.analyticsProcessingAllowed === 'function') {
      return shopifyPrivacy.analyticsProcessingAllowed() === true;
    }
    // Fallback: If strict GDPR is enforced on a site, this API will be present.
    // If it's missing, it typically means the merchant hasn't enabled the strict cookie banner.
    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TRACKING FUNCTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function sendHeartbeat() {
    touchSessionTime(); // Keep session alive while storefront is active
    fetch(API_URL + '/api/tracking/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Widget-Token': tokenParam },
      body: JSON.stringify({
        siteId: SITE_ID,
        sessionId: getOrCreateSessionId(),
        currentPage: window.location.pathname,
        visitorId: VISITOR_ID,
      }),
    }).catch(() => {});
  }

  function notifyChatStart() {
    fetch(API_URL + '/api/tracking/chat-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getOrCreateSessionId() }),
    }).catch(() => {});
  }

  function notifyChatEnd() {
    fetch(API_URL + '/api/tracking/chat-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: getOrCreateSessionId() }),
    }).catch(() => {});
  }

  function notifyLeave() {
    // Usa sendBeacon per affidabilità (funziona anche durante beforeunload)
    const url = API_URL + '/api/tracking/leave';
    const data = JSON.stringify({ sessionId: getOrCreateSessionId() });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, data);
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: data,
        keepalive: true,
      }).catch(() => {});
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // IFRAME SETUP
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const iframe = document.createElement('iframe');
  // Add timestamp to prevent caching of the widget itself
  const widgetUrl = WIDGET_URL;
  const separator = widgetUrl.includes('?') ? '&' : '?';
  // Pass token + shop in iframe URL for immediate availability (no postMessage race condition)
  iframe.src =
    widgetUrl +
    separator +
    't=' +
    Date.now() +
    (tokenParam ? '&widgetToken=' + encodeURIComponent(tokenParam) : '') +
    '&shop=' +
    encodeURIComponent(SHOP_DOMAIN);

  iframe.id = 'jarbris-orb-iframe';
  iframe.allow = 'clipboard-write;';
  iframe.style.position = 'fixed';
  iframe.style.bottom = '0px';
  iframe.style.right = '0px';
  iframe.style.zIndex = '999999';
  iframe.style.background = 'transparent';
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.style.width = '250px';
  iframe.style.height = '250px';
  iframe.setAttribute('scrolling', 'no');

  // Send identity + session to widget when iframe is loaded
  iframe.onload = function () {
    iframe.contentWindow.postMessage(
      {
        type: 'JARBRIS:shopDomain',
        shopDomain: SHOP_DOMAIN,
        widgetToken: tokenParam,
        visitorId: VISITOR_ID,
        sessionId: getOrCreateSessionId(),
        shopifyCustomer: getShopifyIdentity(),
        analyticsConsent: hasAnalyticsConsent(),
      },
      WIDGET_ORIGIN,
    );
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TRACKING INITIALIZATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Tracking initialized

  // Heartbeat iniziale
  sendHeartbeat();

  // Heartbeat ogni 30 secondi
  const heartbeatInterval = setInterval(sendHeartbeat, 30000);

  // Heartbeat quando user torna sulla tab (visibilitychange)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      sendHeartbeat();
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CART SYNC (detect store-side changes)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let lastCartCount = -1;

  function syncCart() {
    fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (cart) {
        var count = cart.item_count || 0;
        // Only send update if item count actually changed
        if (count !== lastCartCount) {
          lastCartCount = count;
          iframe.contentWindow.postMessage(
            { type: 'JARBRIS:cartUpdate', cart: cart },
            WIDGET_ORIGIN,
          );
        }
      })
      .catch(function () {});
  }

  // Poll every 5 seconds (lightweight — /cart.js is cached by Shopify CDN)
  const cartSyncInterval = setInterval(syncCart, 5000);

  // Also sync on Shopify theme cart events
  ['cart:refresh', 'cart:updated', 'jarbris:cart-updated'].forEach(function (evt) {
    document.addEventListener(evt, syncCart);
  });

  // Sync on page focus (user comes back from another tab)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) syncCart();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MESSAGE LISTENER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  window.addEventListener('message', function (event) {
    // Verifica che il messaggio venga dall'origine corretta
    if (event.origin !== WIDGET_ORIGIN) return;

    // Verifica che il messaggio venga dall'iframe
    if (event.source !== iframe.contentWindow) return;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FATAL ERROR (Self-Destruct to avoid blocking UI)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:fatalError') {
      iframe.style.display = 'none';
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SHOP DOMAIN REQUEST
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:requestShopDomain') {
      iframe.contentWindow.postMessage(
        {
          type: 'JARBRIS:shopDomain',
          shopDomain: SHOP_DOMAIN,
          widgetToken: tokenParam,
        },
        WIDGET_ORIGIN,
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // IDENTITY REQUEST (from widget Ready)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:ready') {
      iframe.contentWindow.postMessage(
        {
          type: 'JARBRIS:identity',
          visitorId: VISITOR_ID,
          sessionId: getOrCreateSessionId(),
          customer: getShopifyIdentity(),
          analyticsConsent: hasAnalyticsConsent(),
        },
        WIDGET_ORIGIN,
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // NEW SESSION REQUEST (from widget clearChat)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:requestNewSession') {
      try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_TIME_KEY);
      } catch (e) {
        // Silent — localStorage may be blocked
      }
      iframe.contentWindow.postMessage(
        {
          type: 'JARBRIS:identity',
          visitorId: VISITOR_ID,
          sessionId: getOrCreateSessionId(),
          customer: getShopifyIdentity(),
          analyticsConsent: hasAnalyticsConsent(),
        },
        WIDGET_ORIGIN,
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CHAT OPENED (utente apre chat)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:chatOpened') {
      notifyChatStart();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CHAT CLOSED (utente chiude chat)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:chatClosed') {
      notifyChatEnd();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GET CART
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:getCart') {
      syncCart();
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ADD TO CART
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:addToCart') {
      let addDataCache = null;
      let cartCache = null;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          items: [
            {
              id: event.data.variantId,
              quantity: event.data.quantity,
            },
          ],
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error('Errore aggiunta al carrello');
          return response.json();
        })
        .then((addData) => {
          addDataCache = addData;
          return fetch('/cart.js', { credentials: 'same-origin' }).then((r) => r.json());
        })
        .then((cart) => {
          cartCache = cart;

          // Aggiorna badge numerici
          const itemCount = cart.item_count;
          const cartCountSelectors = [
            '.cart-count-bubble',
            '[data-cart-count]',
            '.cart-count',
            '.cart__count',
            '#CartCount',
            '.header__cart-count',
            '[id*="cart-count" i]',
            '[class*="cart-count" i]',
            '.cart-link__bubble',
            '[data-header-cart-count]',
            'span[data-cart-item-count]',
            '.cart-icon-bubble',
            '#cart-icon-bubble .cart-count-bubble',
          ];

          let badgesUpdated = 0;
          cartCountSelectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((element) => {
              if (element.classList.contains('cart-count-bubble')) {
                element.innerHTML = `
                  <span aria-hidden="true">${itemCount}</span>
                  <span class="visually-hidden">${itemCount} item${
                    itemCount !== 1 ? 's' : ''
                  }</span>
                `;
              } else {
                element.textContent = itemCount;
              }
              if (element.hasAttribute('data-cart-count')) {
                element.setAttribute('data-cart-count', itemCount);
              }
              badgesUpdated++;
            });
          });

          // Universal section detection — works across ALL Shopify themes
          const detectedSections = new Set();

          // 1. Find any shopify-section that contains cart-related elements
          document.querySelectorAll('[id^="shopify-section-"]').forEach(function (section) {
            var hasCartElement = section.querySelector(
              '[data-cart-count], [data-cart-item-count], [data-header-cart-count], ' +
                '.cart-count, .cart-count-bubble, .cart__count, .cart-link__bubble, .cart-icon-bubble, ' +
                '[class*="cart-count"], [class*="cart-drawer"], [class*="cart-icon"], ' +
                '[id*="cart"], [data-section-type*="cart"]',
            );
            if (hasCartElement) {
              detectedSections.add(section.id.replace('shopify-section-', ''));
            }
          });

          // 2. Also check for common section IDs that some themes use
          [
            'header',
            'cart-drawer',
            'cart-notification',
            'cart-icon-bubble',
            'announcement-bar',
          ].forEach(function (id) {
            if (document.getElementById('shopify-section-' + id)) detectedSections.add(id);
          });

          const ids = Array.from(detectedSections);

          if (ids.length) {
            return fetch(`/?sections=${ids.join(',')}`, {
              credentials: 'same-origin',
            })
              .then((r) => r.json())
              .then((json) => {
                ids.forEach((id) => {
                  const el = document.getElementById(`shopify-section-${id}`);
                  if (el && json[id]) el.innerHTML = json[id];
                });

                document.dispatchEvent(new Event('cart:refresh'));
                document.dispatchEvent(new Event('cart:updated'));
                document.dispatchEvent(new CustomEvent('jarbris:cart-updated', { detail: cart }));
              })
              .catch(() => {});
          }
        })
        .then(() => {
          iframe.contentWindow.postMessage(
            {
              type: 'JARBRIS:addToCartResponse',
              success: true,
              data: { addData: addDataCache, cart: cartCache },
            },
            WIDGET_ORIGIN,
          );
        })
        .catch((error) => {
          iframe.contentWindow.postMessage(
            {
              type: 'JARBRIS:addToCartResponse',
              success: false,
              error: error.message,
            },
            WIDGET_ORIGIN,
          );
        });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CHECKOUT — Get Checkout URL
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:getCheckoutUrl') {
      fetch('/cart.js', { credentials: 'same-origin' })
        .then(function (r) {
          return r.json();
        })
        .then(function (cart) {
          var checkoutUrl = null;
          if (cart && cart.items && cart.items.length > 0) {
            // Build permalink checkout URL from cart token
            checkoutUrl = '/checkout';
            if (cart.token) {
              checkoutUrl = '/cart/' + cart.token;
            }
          }
          iframe.contentWindow.postMessage(
            {
              type: 'JARBRIS:checkoutUrlResponse',
              checkoutUrl: checkoutUrl,
              itemCount: cart ? cart.item_count : 0,
            },
            WIDGET_ORIGIN,
          );
        })
        .catch(function () {
          iframe.contentWindow.postMessage(
            {
              type: 'JARBRIS:checkoutUrlResponse',
              checkoutUrl: null,
              error: 'cart_fetch_failed',
            },
            WIDGET_ORIGIN,
          );
        });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CHECKOUT — Fallback (open in new tab)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:checkoutFallback') {
      window.open('/checkout', '_blank');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CHECKOUT — Complete (resync cart)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:checkoutComplete') {
      lastCartCount = -1; // Force resync
      syncCart();
      document.dispatchEvent(new Event('cart:refresh'));
      document.dispatchEvent(new Event('cart:updated'));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // RESIZE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (event.data.type === 'JARBRIS:resize') {
      touchSessionTime(); // Keep session alive while widget is active
      const { enlarged, width, height } = event.data;

      if (enlarged) {
        // Robust mobile detection
        const isMobile = window.matchMedia
          ? window.matchMedia('(max-width: 768px)').matches
          : window.innerWidth <= 768;

        if (isMobile) {
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.bottom = '0px';
          iframe.style.right = '0px';
          iframe.style.top = '0px';
          iframe.style.left = '0px';
        } else {
          // Use provided dimensions or fallback to default enlarged size
          iframe.style.width = (width || 680) + 'px';
          iframe.style.height = (height || 680) + 'px';
          iframe.style.bottom = '0px';
          iframe.style.right = '0px';
          iframe.style.top = 'auto';
          iframe.style.left = 'auto';
        }
      } else {
        // Minimized state - increased area for glow and proactive cards
        // Increased from 250px to 350px to allow room for 'CIAO' cards and glow
        iframe.style.width = (width || 350) + 'px';
        iframe.style.height = (height || 350) + 'px';
        iframe.style.bottom = '0px';
        iframe.style.right = '0px';
        iframe.style.top = 'auto';
        iframe.style.left = 'auto';
      }
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CLEANUP ON LEAVE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  window.addEventListener('beforeunload', function () {
    clearInterval(heartbeatInterval);
    clearInterval(cartSyncInterval);
    notifyLeave();
  });

  // Anche quando tab viene chiusa (visibilitychange + pagehide come backup)
  window.addEventListener('pagehide', function () {
    notifyLeave();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MOUNT IFRAME
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  document.body.appendChild(iframe);
})();
