import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { sendMessage, ChatApiError, bootSession, submitFeedback } from '../services/chatApi';
import { reportError } from '../services/errorApi';
import { predictIntent } from '../utils/messageHelpers';
import { broadcastConsentChange } from '../utils/consentBridge';
import storage from '../utils/storage';
import { t, setLng } from '../i18n';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Technical events that bypass analytics consent — mirrors backend privacyUtils.TECHNICAL_EVENTS_WHITELIST.
// SCALE-LIMIT: keep this list tiny and in sync with the backend. Product + Legal sign-off required to add entries.
const CONSENT_EXEMPT_EVENTS = new Set(['jarbris_session_started', 'privacy_consent_updated']);

const buildWelcomeMessage = (profileOverride = null) => {
  const profile = profileOverride || storage.getProfile();
  let welcomeText = t('welcome');
  if (profile?.name) {
    const firstName = profile.name.trim().split(' ')[0];
    if (firstName) {
      welcomeText = t('welcome_named', { name: firstName });
    }
  }

  return {
    id: 'welcome', // B25: Stable constant ID prevents duplication
    sender: 'assistant',
    text: welcomeText,
    timestamp: new Date().toISOString(),
    disableFeedback: true,
  };
};

export const useChat = (devShopDomain, customer, options = {}) => {
  const { disabled = false } = options;

  // B22: sessionId is received from parent via postMessage.
  // Boot-time: try cached value for instant render, parent will confirm/override.
  const [sessionId, setSessionId] = useState(() => {
    if (disabled) return 'preview-session';
    return storage.get('session_id') || null;
  });

  // B22: Identity readiness gate — true when parent has sent visitorId + sessionId
  const [identityReady, setIdentityReady] = useState(disabled);
  const [visitorId, setVisitorId] = useState(null);
  // Track boot data for ProfileView props
  const [bootProfile, setBootProfile] = useState(() => storage.getProfile());
  const [bootConsent, setBootConsent] = useState(null);
  const [requiresReConsent, setRequiresReConsent] = useState(false);

  const [messages, setMessages] = useState(() => {
    try {
      const saved = !disabled ? storage.getJSON('messages') : null;
      if (saved) {
        return saved;
      }

      // Personalized Welcome: Check if we have a saved name from Jarbris Profile
      return [buildWelcomeMessage()];
    } catch {
      return [buildWelcomeMessage()];
    }
  });

  // Session Status State
  const [sessionStatus, setSessionStatus] = useState(() => {
    if (disabled) return 'active';
    return storage.get('session_status') || 'active';
  });

  // Connection Status logic
  const [connectionStatus, setConnectionStatus] = useState('online');
  const [cartCount, setCartCount] = useState(0);
  const [checkoutUrl, setCheckoutUrl] = useState(null);

  useEffect(() => {
    if (disabled) return;

    // Named handlers so the same reference is used for add and remove
    const handleOnline = () => setConnectionStatus('online');
    const handleOffline = () => setConnectionStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set initial status
    if (!window.navigator.onLine) {
      setConnectionStatus('offline');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [disabled]);

  const [assignedTo, setAssignedTo] = useState(null);
  const [shopifyCustomer, setShopifyCustomer] = useState(null); // In-memory only (GDPR: PII not persisted to localStorage)
  const [analyticsConsent, setAnalyticsConsent] = useState(false); // Controlled by storefront parent postMessage
  const [initialSuggestions, setInitialSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingIntent, setThinkingIntent] = useState(null);
  const socketRef = useRef(null);
  // Stores a message sent when session was completed, to be auto-sent after session renewal.
  const pendingAfterResetRef = useRef(null); // { text, options, fromSessionId }

  const [shopDomain, setShopDomain] = useState(() => {
    if (disabled) return 'preview-shop.myshopify.com';
    return devShopDomain || storage.get('dev_shop_domain') || null;
  });

  // -------------------------------------
  // HELPER FUNCTIONS (Defined before usage in Effects)
  // -------------------------------------

  const clearChat = useCallback(() => {
    const welcomeMsg = buildWelcomeMessage();

    // B22: Delegate session creation to parent — it manages sessionId lifecycle
    storage.clearSession();
    storage.setJSON('messages', [welcomeMsg]);

    setMessages([welcomeMsg]);
    setSessionStatus('active');
    setAssignedTo(null);
    setInitialSuggestions([]);
    setBootProfile(null);
    setBootConsent(null);

    // Request new session from parent (embed.js)
    window.parent?.postMessage({ type: 'JARBRIS:requestNewSession' }, '*');
  }, []);

  const addUserMessage = useCallback((text, id = Date.now(), hidden = false) => {
    const userMessage = {
      id: String(id),
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
      hidden,
    };
    setMessages((prev) => [...prev, userMessage]);
    return userMessage;
  }, []);

  const addAssistantMessage = useCallback((data) => {
    const assistantMessage = {
      id: data.id || Date.now() + 1,
      sender: 'assistant',
      timestamp: new Date().toISOString(),
      text: data.message || data.text,
      ...data,
    };
    setMessages((prev) => {
      const exists = prev.some((m) => String(m.id || '') === String(assistantMessage.id || ''));
      if (exists) return prev;
      return [...prev, assistantMessage];
    });
    return assistantMessage;
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // EFFECTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Reset session when shopDomain changes (Site Switching)
  const prevShopDomain = useRef(shopDomain);
  useEffect(() => {
    if (shopDomain && prevShopDomain.current && shopDomain !== prevShopDomain.current) {
      clearChat();
    }
    prevShopDomain.current = shopDomain;
  }, [shopDomain, clearChat]);

  // Sync internal shopDomain when prop changes
  useEffect(() => {
    if (devShopDomain && devShopDomain !== shopDomain) {
      setShopDomain(devShopDomain);
    }
  }, [devShopDomain, shopDomain]);

  // B25: Debounce localStorage writes to avoid main-thread blocking on every message append.
  // A 500ms delay collapses rapid consecutive updates (e.g. user msg + AI msg) into one write.
  // Flush immediately on visibilitychange so the cache is always fresh when the user navigates away.
  const debouncedSaveRef = useRef(null);
  useEffect(() => {
    if (disabled) return;

    clearTimeout(debouncedSaveRef.current);
    debouncedSaveRef.current = setTimeout(() => {
      storage.setJSON('messages', messages);
    }, 500);

    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(debouncedSaveRef.current);
        storage.setJSON('messages', messages);
      }
    };
    document.addEventListener('visibilitychange', flushOnHide);

    return () => {
      clearTimeout(debouncedSaveRef.current);
      document.removeEventListener('visibilitychange', flushOnHide);
    };
  }, [messages, disabled]);

  // Persist session status
  useEffect(() => {
    if (disabled) return;
    storage.set('session_status', sessionStatus);
  }, [sessionStatus, disabled]);

  // B22: Timeout check REMOVED — session timeout is now managed by parent (embed.js getOrCreateSessionId).

  // Listen for Identity and Cart from Parent (Shopify Storefront)
  useEffect(() => {
    if (disabled) return;

    const handleMessage = (event) => {
      // 1. Identity & ShopDomain — parent is source of truth for visitorId + sessionId
      if (event.data?.type === 'JARBRIS:identity' || event.data?.type === 'JARBRIS:shopDomain') {
        // B22: Receive persistent identity from parent (1st-party localStorage)
        if (event.data.visitorId) setVisitorId(event.data.visitorId);
        if (event.data.sessionId) {
          const storedSessionId = storage.get('session_id');
          const incomingSessionId = event.data.sessionId;

          // B27: Detect passive session rotation (e.g. 30-min timeout).
          // If the parent sends a sessionId different from the cached one, the old session
          // has expired. Clear local message history NOW — before updating sessionId state —
          // so the subsequent bootSession() call starts from a clean slate and ghost
          // messages from the previous session are never shown.
          if (incomingSessionId && storedSessionId && incomingSessionId !== storedSessionId) {
            storage.clearSession();
            setMessages([buildWelcomeMessage()]);
            setSessionStatus('active');
          }

          setSessionId(incomingSessionId);
          storage.set('session_id', incomingSessionId);
        }

        const customer = event.data.customer || event.data.shopifyCustomer;
        if (typeof event.data.analyticsConsent === 'boolean') {
          setAnalyticsConsent(event.data.analyticsConsent);
        }

        if (customer) {
          setShopifyCustomer(customer);
          // GDPR: shopifyCustomer stays in-memory only (PII received passively — no localStorage)
        } else {
          // LOGOUT SYNC: Clear identity if parent sends null/undefined
          setShopifyCustomer(null);
        }

        // Mark identity as ready — triggers boot API call
        setIdentityReady(true);
      }

      if (event.data?.type === 'JARBRIS:devResetSession') {
        clearChat();
        setTimeout(() => window.location.reload(), 100);
      }

      // 2. Cart Updates (initial or after add-to-cart)
      if (
        event.data?.type === 'JARBRIS:cartUpdate' ||
        event.data?.type === 'JARBRIS:addToCartResponse'
      ) {
        const cart = event.data.cart || event.data.data?.cart;
        if (cart) {
          setCartCount(cart.item_count || 0);
          // Track checkout URL for embedded checkout flow
          if (cart.checkout_url) {
            setCheckoutUrl(cart.checkout_url);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Request identity and current cart status from parent
    window.parent?.postMessage({ type: 'JARBRIS:ready' }, '*');
    window.parent?.postMessage({ type: 'JARBRIS:getCart' }, '*');

    return () => window.removeEventListener('message', handleMessage);
  }, [disabled, clearChat]);

  // Sync bootConsent when the user toggles the privacy preference in ProfileView.
  // broadcastConsentChange dispatches 'jarbris:analytics-consent-changed' so we
  // update bootConsent here; ProfileView will receive the fresh value on next mount.
  useEffect(() => {
    const handleConsentChange = (e) => {
      setBootConsent((prev) => ({ ...(prev || {}), analytics: e.detail.analyticsConsent }));
      setAnalyticsConsent(e.detail.analyticsConsent);
    };
    window.addEventListener('jarbris:analytics-consent-changed', handleConsentChange);
    return () =>
      window.removeEventListener('jarbris:analytics-consent-changed', handleConsentChange);
  }, []);

  // B22: Unified Boot — replaces getSessionStatus + getProfile + getConsent
  useEffect(() => {
    if (disabled || !identityReady || !sessionId || !shopDomain) return;

    bootSession(sessionId, shopDomain, visitorId)
      .then((bootData) => {
        if (!bootData) return;

        // Session resume: server found an active session for this visitor
        if (bootData.resolvedSessionId && bootData.resolvedSessionId !== sessionId) {
          setSessionId(bootData.resolvedSessionId);
          storage.set('session_id', bootData.resolvedSessionId);
        }

        if (bootData.status) setSessionStatus(bootData.status);
        if (bootData.assignedTo) setAssignedTo(bootData.assignedTo);
        if (bootData.initialSuggestions) setInitialSuggestions(bootData.initialSuggestions);

        // Profile from server (source of truth for cross-device auto-populate)
        if (bootData.profile?.name || bootData.profile?.email) {
          storage.setProfile(bootData.profile);
          setBootProfile(bootData.profile);
        }

        // Language override: API language takes priority over navigator.language
        if (bootData.lng) {
          setLng(bootData.lng);
        }

        // Welcome personalization
        if (bootData.profile?.name) {
          setMessages((prev) => {
            if (prev.length === 1 && prev[0].disableFeedback) {
              const firstName = bootData.profile.name.trim().split(' ')[0];
              const personalizedText = t('welcome_named', { name: firstName });
              if (prev[0].text !== personalizedText) {
                return [{ ...prev[0], text: personalizedText }];
              }
            }
            return prev;
          });
        }

        // Consent sync
        if (bootData.consent) {
          setBootConsent(bootData.consent);
          broadcastConsentChange(bootData.consent.analytics === true);
        }

        if (bootData.requiresReConsent) {
          setRequiresReConsent(true);
        }

        // Sync message history if available
        if (bootData.messages && bootData.messages.length > 0) {
          setMessages((prev) => {
            const serverMessages = bootData.messages;

            // 1. Build lookup maps from server messages.
            // Index by both id and clientMessageId to catch all ID formats.
            const serverIds = new Set();
            serverMessages.forEach((msg) => {
              if (msg.id) serverIds.add(String(msg.id));
              if (msg.clientMessageId) serverIds.add(String(msg.clientMessageId));
            });

            // 2. Keep only local messages that the server does NOT have.
            // Frontend-only messages to preserve:
            //   - The welcome singleton (id: 'welcome') — never in DB, always client-side
            //   - Error/expired messages shown to the user locally
            // All others that exist on the server are dropped — server is source of truth.
            const localToKeep = prev.filter((localMsg) => {
              const localIdStr = String(localMsg.id || '');

              // Welcome singleton: always keep, will be deduped by ID if somehow duplicated
              if (localIdStr === 'welcome') return true;

              // Local-only error/system messages flagged explicitly
              if (localMsg._localOnly === true) return true;

              // Drop anything the server already has
              return !serverIds.has(localIdStr);
            });

            // 3. Merge: local-only messages first, then server messages (server wins for overlaps)
            const merged = [...localToKeep, ...serverMessages].sort((a, b) => {
              const timeA = new Date(a.timestamp || 0).getTime();
              const timeB = new Date(b.timestamp || 0).getTime();
              return timeA - timeB;
            });

            // 4. Final deduplication by ID — handles any edge case where the same id appears twice.
            // This is the safety net that prevents BUG-1/BUG-2 even if IDs somehow align.
            const final = [];
            const seenIds = new Set();
            merged.forEach((m) => {
              const idStr = String(m.id || '');
              if (idStr && !seenIds.has(idStr)) {
                final.push(m);
                seenIds.add(idStr);
              } else if (!idStr) {
                // Messages without an id are always included (edge case for very old records)
                final.push(m);
              }
            });

            return final;
          });
        }
      })
      .catch(() => {
        // Silently fail if boot doesn't exist yet (backward compat during rollout)
      });

    // Connect Socket with Reconnection Logic
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('online');
      socket.emit('join_session', sessionId);
    });

    socket.on('disconnect', () => {
      // If client is still online, means it's a server/socket issue
      if (window.navigator.onLine) {
        setConnectionStatus('reconnecting');
      }
    });

    socket.on('reconnect_attempt', () => {
      if (window.navigator.onLine) {
        setConnectionStatus('reconnecting');
      }
    });

    socket.on('connect_error', () => {
      if (window.navigator.onLine) {
        setConnectionStatus('reconnecting');
      }
    });

    socket.on('message:received', (message) => {
      // SAFETY OVERRIDE: Assistant responses should NEVER be hidden in the widget
      const isAssistant =
        message.sender === 'assistant' || message.sender === 'ai' || message.role === 'assistant';

      if (
        !isAssistant &&
        (message.sender === 'system' || message.role === 'system' || message.hidden)
      ) {
        return;
      }

      setMessages((prev) => {
        // Robust duplicate prevention
        const msgId = String(message.id || '');
        const exists = prev.some((m) => {
          if (!m.id) return false;
          return String(m.id) === msgId;
        });

        if (exists) return prev;
        return [...prev, message];
      });

      // If message is from assistant, stop loading
      if (isAssistant) {
        setLoading(false);
        setIsThinking(false);
        setThinkingIntent(null);
      }
    });

    socket.on('thinking:start', (data) => {
      setIsThinking(true);
      setThinkingIntent(data.intent);
    });

    socket.on('session:updated', (data) => {
      if (data.status) setSessionStatus(data.status);
      if (data.assignedTo !== undefined) setAssignedTo(data.assignedTo);
    });

    return () => {
      socket.disconnect();
    };
  }, [identityReady, sessionId, visitorId, disabled, shopDomain]);

  // Widget Event Emitter
  const trackWidgetEvent = useCallback(
    (eventType, properties = {}) => {
      const isTechnical = CONSENT_EXEMPT_EVENTS.has(eventType);
      if (!isTechnical && (!analyticsConsent || disabled)) return;
      if (disabled) return; // Even technical events are suppressed in preview/disabled mode
      // B23: suppress events until identity is ready — prevents null sessionId/anonId 500s
      if (!identityReady) return;

      const payload = {
        siteId: shopDomain || 'unknown', // Proxy used by middleware
        sessionId,
        source: 'widget',
        identity: {
          anonId: visitorId || sessionId, // B22: visitorId is persistent, sessionId is fallback
          shopifyCustomerId: shopifyCustomer?.id?.toString() || undefined,
        },
        events: [{ eventType, ...properties }],
      };

      fetch(`${API_URL}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Token': new URLSearchParams(window.location.search).get('widgetToken') || '',
        },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
    [analyticsConsent, disabled, identityReady, shopDomain, sessionId, visitorId, shopifyCustomer],
  );

  const sendChatMessage = useCallback(
    async (text, options = {}) => {
      if (!text.trim() || loading) return;

      const currentShop = devShopDomain || shopDomain;
      if (!currentShop) {
        reportError({
          message: `Missing shopDomain in sendChatMessage. Prop: ${devShopDomain || 'null'}, State: ${shopDomain || 'null'}`,
          shopDomain: 'missing',
          userAgent: navigator.userAgent,
          url: window.location.href,
        });
        throw new Error(t('errors.config'));
      }

      let currentSessionId = sessionId;

      // AUTO-START NEW SESSION IF COMPLETED
      if (sessionStatus === 'completed' || sessionStatus === 'abandoned') {
        // B22: queue the pending message so it auto-sends after the new sessionId arrives.
        // clearChat() resets state + welcome message + sends JARBRIS:requestNewSession.
        pendingAfterResetRef.current = { text, options, fromSessionId: sessionId };
        clearChat();
        return;
      }

      // Clear initial suggestions on any explicit message
      setInitialSuggestions([]);

      setLoading(true);

      // Local Prediction: Show thinking indicator immediately.
      // Chip clicks (suggestionAction present) always show thinking since
      // chip values (e.g. "dangle") won't match Italian predictIntent patterns.
      // For regular text, predictIntent pattern-matches to set the right intent label.
      if (options.suggestionAction) {
        setIsThinking(true);
        setThinkingIntent('PRODUCT_SEARCH');
      } else {
        const predicted = predictIntent(text);
        if (predicted) {
          setIsThinking(true);
          setThinkingIntent(predicted);
        }
      }

      const userMsgId = Date.now(); // Generate ID here
      addUserMessage(options.displayText ?? text, userMsgId, options.hidden);

      try {
        const response = await sendMessage(
          text,
          currentSessionId, // Use the correct ID (current or new)
          devShopDomain || shopDomain,
          {
            customer,
            shopifyCustomer, // Pass certified identity
            anonId: visitorId, // B22: persistent cross-session identity
            ...options,
          },
          userMsgId,
        );

        if (response.message) {
          // B25 Approach B: the server returns the same deterministic messageId (`ai_${sessionId}_${ts}`)
          // that it also broadcasts via socket. We add the message here for zero-latency feedback.
          // If the socket event arrives later with the same id, addAssistantMessage silently deduplicates it.
          addAssistantMessage(response.message);

          // Update status from response
          if (response.status) {
            setSessionStatus(response.status);
          }
        }
      } catch (error) {
        if (error.status === 410 || error.message?.includes('session_expired')) {
          clearChat();

          addAssistantMessage({
            type: 'text',
            title: t('session.expired_title'),
            message: t('session.expired_message'),
            format: 'plain',
            _localOnly: true,
          });

          return;
        }

        // Determine appropriate error message based on error type
        let errorMessage;
        if (error instanceof ChatApiError) {
          if (error.status === 0) {
            // Network error (offline, timeout, DNS failure)
            errorMessage = t('errors.network');
          } else if (error.status >= 500) {
            // Server error (internal bug, overload)
            errorMessage = t('errors.server');
          } else {
            // Other API errors
            errorMessage = t('errors.generic');
          }
        } else {
          errorMessage = t('errors.unexpected');
        }

        addAssistantMessage({
          type: 'text',
          message: errorMessage,
          format: 'plain',
          _localOnly: true,
        });
      } finally {
        setLoading(false);
      }

      // Telemetry
      if (!options.suggestionAction) {
        trackWidgetEvent('jarbris_message_sent', { query: text, eventData: { isChip: false } });
      }
    },
    [
      sessionId,
      loading,
      shopDomain,
      devShopDomain, // Added prop dependency
      visitorId, // B22: needed for anonId in meta
      addUserMessage,
      addAssistantMessage,
      customer,
      shopifyCustomer, // Fix stale closure: add dependency
      sessionStatus,
      setSessionStatus,
      clearChat,
      trackWidgetEvent,
    ],
  );

  // Track session start when chat is genuinely opened and connected.
  // Fires for both 'new' and 'active' sessions — 'new' is the initial state from localStorage
  // before the boot API response resolves.
  useEffect(() => {
    const isLiveSession = sessionStatus !== 'completed' && sessionStatus !== 'abandoned';
    if (connectionStatus === 'online' && isLiveSession && messages.length <= 1) {
      // Fire and forget after delay to ensure consent state parsed
      const t = setTimeout(() => {
        trackWidgetEvent('jarbris_session_started');
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [connectionStatus, sessionStatus, messages.length, trackWidgetEvent]);

  // Centralized suggestion click handler (Chip System v2)
  // Extracts label/value and structured action from chip object.
  // - label: translated display text shown in the user bubble
  // - value: raw query/payload sent to the API for routing and search
  //
  // B28: System chips (ADD_TO_CART, OPEN_VARIANT_DRAWER) with _SYS_ prefix
  // are intercepted client-side — they never reach the backend.
  const handleSuggestionClick = useCallback(
    (suggestion, onSystemChipAction) => {
      const queryText = suggestion.value || suggestion.label;

      // B28: Intercept client-only system chip actions
      if (queryText?.startsWith('_SYS_ADD_TO_CART_:') || queryText?.startsWith('_SYS_OPEN_DRAWER_:')) {
        if (onSystemChipAction) {
          onSystemChipAction(suggestion.action, suggestion.payload || {});
        }
        return;
      }

      const displayText = suggestion.label || suggestion.value;
      const options = {};
      if (suggestion.action) options.suggestionAction = suggestion.action;
      if (suggestion.meta) options.facetMeta = suggestion.meta;
      if (suggestion.payload) options.chipPayload = suggestion.payload;
      // Show translated label in the bubble but send raw value to the API
      if (displayText !== queryText) options.displayText = displayText;
      sendChatMessage(queryText, options);

      // Telemety tracker
      trackWidgetEvent('jarbris_message_sent', { query: queryText, eventData: { isChip: true } });
    },
    [sendChatMessage, trackWidgetEvent],
  );

  const sendFeedback = useCallback(
    async (messageId, rating, aiMessageText, type = 'message') => {
      // 1. Optimistic UI Update (Only for message feedback)
      if (type === 'message') {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? { ...msg, feedback: rating } : msg)),
        );
      }

      // 2. Find context (user query)
      let userQuery = 'N/A';
      if (type === 'message') {
        const messageIndex = messages.findIndex((m) => m.id === messageId);
        if (messageIndex > 0) {
          const prevMsg = messages[messageIndex - 1];
          if (prevMsg.sender === 'user') {
            userQuery = prevMsg.text;
          }
        }
      }

      // 3. Send to backend
      try {
        await submitFeedback({
          shopDomain,
          sessionId,
          messageId,
          userQuery,
          aiResponse: aiMessageText,
          rating,
          type,
        });
      } catch {
        // Feedback is best-effort, don't block UX
      }
    },
    [messages, shopDomain, sessionId],
  );

  /**
   * Propagates a profile save from ProfileView back into useChat state.
   * Called via the onProfileUpdate prop so bootProfile stays fresh
   * and ProfileView displays the correct values on subsequent mounts.
   */
  const handleProfileUpdate = useCallback((newProfile) => {
    setBootProfile(newProfile);
    // User saved their profile → backend updated privacyPolicyVersion to current version.
    // Clear the re-consent banner so it doesn't persist after the user has acknowledged.
    setRequiresReConsent(false);
  }, []);

  /**
   * Resets cart state after checkout completion.
   * Called by useCheckout when payment succeeds.
   */
  const resetCart = useCallback(() => {
    setCartCount(0);
    setCheckoutUrl(null);
  }, []);

  // Drain pending message after session renewal.
  // Fires when sendChatMessage recreates (sessionId changed after JARBRIS:identity).
  // The fromSessionId guard prevents premature send while still on the old session.
  useEffect(() => {
    const pending = pendingAfterResetRef.current;
    if (!pending) return;
    if (sessionId === pending.fromSessionId) return;
    pendingAfterResetRef.current = null;
    sendChatMessage(pending.text, pending.options);
  }, [sessionId, sendChatMessage]);

  return {
    messages,
    loading,
    shopDomain,
    connectionStatus,
    cartCount,
    checkoutUrl,
    sessionId,
    sessionStatus,
    assignedTo, // Return assignedTo
    shopifyCustomer, // Return certified identity
    visitorId, // B22: For ProfileView and consent API calls
    bootProfile, // B22: Profile from boot for ProfileView props
    bootConsent, // B22: Consent from boot for ProfileView props
    requiresReConsent, // G3: GDPR Privacy Policy bump
    initialSuggestions, // Return initial suggestions
    sendMessage: sendChatMessage,
    handleSuggestionClick, // Centralized suggestion handler
    clearChat,
    resetCart,
    handleProfileUpdate, // Propagate ProfileView saves back into bootProfile state
    sendFeedback,
    isThinking,
    thinkingIntent,
    socketRef, // Exposed for idle nudge
    trackWidgetEvent, // Expose for external button clicks in UI (e.g. products)
  };
};
