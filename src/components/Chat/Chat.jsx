import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../../hooks/useChat';
import { useCheckout } from '../../hooks/useCheckout';
import { useIdleNudge } from '../../hooks/useIdleNudge';
import './Chat.css';

// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion, AnimatePresence } from 'framer-motion';
import MessageInput from './MessageInput';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import { ProductDrawer } from '../Message/ProductCards';
import { OrderDetailCard } from '../Message/OrderCards';
import { normalizeOrderNumber, extractShopifyId, extractVariantId } from '../../utils/shopifyUtils';
import Drawer from '../UI/Drawer';
import ProfileView from './ProfileView';
import StarRating from './StarRating';
import ImageLightbox from '../UI/ImageLightbox';
import Suggestions from '../Message/Suggestions';
import CheckoutView from './CheckoutView';

const Chat = ({
  onTyping,
  onMinimize,
  isMobile = false,
  chatColors = {
    header: '#667eea',
    sendButton: '#667eea',
    userMessage: '#667eea',
    aiMessage: '#4CC2E9',
    inputBorder: '#667eea',
    inputFocus: '#4CC2E9',
  },
  devShopDomain,
  isPreview = false,
  messages: previewMessages,
  loading: previewLoading,
  sessionStatus: previewSessionStatus,
  assignedTo: previewAssignedTo,
  shopDomain: previewShopDomain,
  connectionStatus: previewConnectionStatus = 'online',
}) => {
  const [view, setView] = useState('chat'); // 'chat' | 'profile'
  const [activeProduct, setActiveProduct] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [activeGallery, setActiveGallery] = useState(null); // { images: [], index: 0 }
  // Cart awareness: show checkout suggestion whenever cart has items
  const [hasActedOnProduct, setHasActedOnProduct] = useState(false);

  // DOM refs for idle nudge (scroll container + input element)
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Use custom hook for live chat logic, but ONLY if NOT in preview mode
  const liveChat = useChat(devShopDomain, null, { disabled: isPreview });

  // ✅ Source of truth: use host props if preview, otherwise use live hook results
  const messages = useMemo(
    () => (isPreview ? previewMessages || [] : liveChat.messages),
    [isPreview, previewMessages, liveChat.messages],
  );
  const loading = isPreview ? previewLoading || false : liveChat.loading;
  const shopDomain = isPreview ? previewShopDomain || 'preview-shop' : liveChat.shopDomain;
  const sessionId = isPreview ? 'preview-session' : liveChat.sessionId;
  const sessionStatus = isPreview ? previewSessionStatus || 'active' : liveChat.sessionStatus;
  const connectionStatus = isPreview ? previewConnectionStatus : liveChat.connectionStatus;
  const assignedTo = isPreview ? previewAssignedTo || null : liveChat.assignedTo;
  const initialSuggestions = isPreview ? [] : liveChat.initialSuggestions;
  const cartCount = isPreview ? 0 : liveChat.cartCount;
  const resetCart = isPreview ? () => {} : liveChat.resetCart;
  const showCheckoutSuggestion = cartCount > 0;
  const socketRef = isPreview ? { current: null } : liveChat.socketRef;
  const requiresReConsent = isPreview ? false : liveChat.requiresReConsent;

  // Checkout: add confirmation message to chat on completion
  const addSystemMessage = useCallback(
    (msgData) => {
      if (isPreview || !liveChat.messages) return;
      // Use sendMessage with a special _SYS_CHECKOUT_ flag to inject message locally
      // This is handled as a local-only message injection
      liveChat.sendMessage('_SYS_CHECKOUT_COMPLETE_', { hidden: false, ...msgData });
    },
    [isPreview, liveChat],
  );

  // Checkout flow state machine
  const {
    checkoutState,
    checkoutMode,
    error: checkoutError,
    startCheckout,
    closeCheckout,
  } = useCheckout({
    onCartReset: resetCart,
    onAddMessage: addSystemMessage,
  });

  const isThinking = isPreview ? false : liveChat.isThinking;
  const thinkingIntent = isPreview ? null : liveChat.thinkingIntent;

  const sendMessage = isPreview ? () => {} : liveChat.sendMessage;
  const sendFeedback = isPreview ? () => {} : liveChat.sendFeedback;

  // Shared handler for ATC events: notifies backend to trigger cross-sell.
  // Called by the chip action, card button, and drawer button — single source of truth.
  const handleProductCartAction = useCallback(
    (productId) => {
      if (isPreview) return;
      setHasActedOnProduct(true);
      if (productId) {
        liveChat.sendMessage('_SYS_EVENT_', {
          hidden: true,
          systemAction: 'ADD_TO_CART_MANUAL',
          payload: { productId },
        });
      }
    },
    [isPreview, liveChat, setHasActedOnProduct],
  );

  // B28: Handler for system chip actions (ADD_TO_CART, OPEN_VARIANT_DRAWER).
  // These are intercepted client-side — they never reach the backend as chat messages.
  const handleSystemChipAction = useCallback(
    (action, payload) => {
      if (action === 'ADD_TO_CART') {
        // Resolve variantId: use payload value if present, otherwise fall back to the
        // first variant of the matching product in the message history (same lookup as
        // OPEN_VARIANT_DRAWER). This mirrors the card AddToCartButton behavior for
        // no-variant products where the API payload may omit variantId.
        let resolvedVariantId = payload.variantId;
        if (!resolvedVariantId && payload.productId) {
          const allProducts = liveChat.messages
            .flatMap((m) => m.products || m.cards || [])
            .filter(Boolean);
          const match = allProducts.find(
            (p) => extractShopifyId(p.productId || p.id) === extractShopifyId(payload.productId),
          );
          resolvedVariantId = match?.variants?.[0]?.id || match?.variantId;
        }

        // Extract numeric ID from GID (gid://shopify/ProductVariant/123) — Shopify's
        // cart/add.js requires a numeric variantId. Mirrors AddToCartButton behavior.
        const numericVariantId = extractVariantId(resolvedVariantId);
        if (numericVariantId) {
          window.parent?.postMessage(
            { type: 'JARBRIS:addToCart', variantId: numericVariantId, quantity: payload.quantity || 1 },
            '*',
          );
        }

        // Always notify backend so cross-sell is triggered, regardless of variantId.
        // This matches the card AddToCartButton flow where onAnimationComplete fires
        // handleProductCartAction unconditionally after the postMessage.
        if (payload.productId) {
          handleProductCartAction(payload.productId);
        }
      } else if (action === 'OPEN_VARIANT_DRAWER') {
        const allProducts = liveChat.messages
          .flatMap((m) => m.products || m.cards || [])
          .filter(Boolean);
        const target = allProducts.find(
          (p) => extractShopifyId(p.productId || p.id) === extractShopifyId(payload.productId),
        );
        if (target) {
          setActiveProduct(target);
        }
      }
    },
    [liveChat.messages, handleProductCartAction],
  );

  const handleSuggestionClick = isPreview
    ? () => {}
    : (suggestion) => liveChat.handleSuggestionClick(suggestion, handleSystemChipAction);

  // Product expand: sends 'mostra altri' (pre-router catches it deterministically via EXPAND pattern).
  // Does NOT use handleSuggestionClick — avoids adding 'suggestionAction: expand' to options which
  // would route through _routeToHandler → handleUnknownAction instead of the agent runtime.
  const liveExpandSend = isPreview ? null : liveChat.sendMessage;
  const onExpand = useCallback(() => {
    if (!liveExpandSend || loading) return;
    liveExpandSend('__expand__', { displayText: 'Mostra altri' });
  }, [liveExpandSend, loading]);

  // Capture DOM refs for idle nudge after mount
  useEffect(() => {
    const wrapper = document.querySelector('.chat-content-wrapper');
    if (wrapper) {
      scrollRef.current = wrapper.querySelector('.messages-area');
      inputRef.current = wrapper.querySelector('textarea');
    }
  });

  // Idle nudge: triggers after product cards shown with no user interaction
  useIdleNudge({
    messages,
    socketRef,
    sessionId,
    isOpen: !isPreview,
    scrollRef,
    inputRef,
  });

  // Group messages to handle "transforming" components (like OrderLookupForm).
  // 2e: Keyed on (length + last id) instead of the full messages array reference —
  // prevents recomputation on unrelated state changes that don't touch the message list.
  const lastMessageId = messages[messages.length - 1]?.id;
  const chatBlocks = useMemo(() => {
    const blocks = [];
    // 2d: Use a separate Set instead of mutating the filtered array objects.
    // filtered[j].isResultSource = true was a silent mutation of React state — illegal.
    const sourceIndices = new Set();
    const filtered = messages.filter((msg) => !msg.hidden);

    for (let i = 0; i < filtered.length; i++) {
      const msg = filtered[i];

      // Try to merge lookup or return forms with their subsequent response(s)
      const isForm = [
        'form_request',
        'order_form',
        'return_form',
        'return_items',
        'return_reason',
      ].some((t) => t.toLowerCase() === msg.type?.toLowerCase());

      if (isForm) {
        let lastResultIndex = -1;
        let finalResults = null;

        // Infinite lookahead: search for any sequence of results or updated forms until a USER message
        for (let j = i + 1; j < filtered.length; j++) {
          const nextMsg = filtered[j];

          // Stop if the next message is from the user (visible user intervention)
          if (nextMsg.sender === 'user') {
            break;
          }

          if (nextMsg.sender === 'assistant' || nextMsg.sender === 'ai') {
            const nextTypeLower = nextMsg.type?.toLowerCase() || '';

            const isOrderResult = [
              'order_list',
              'order_detail',
              'order_cards',
              'order_detail_response',
              'order_list_response',
              'order_response',
            ].includes(nextTypeLower);

            const isProductResult = ['product_cards', 'category_cards'].includes(nextTypeLower);
            const isFormRetry = nextTypeLower === 'form_request';
            const isReturnSuccess = nextTypeLower === 'return_submitted';

            const isResultError =
              (nextTypeLower === 'text' ||
                nextTypeLower === 'return_form' ||
                nextTypeLower === 'form_request' ||
                !nextTypeLower) &&
              (nextMsg.text || nextMsg.message || nextMsg.results) &&
              (nextMsg.text?.toLowerCase().includes('non ho trovato') ||
                nextMsg.message?.toLowerCase().includes('non ho trovato') ||
                nextMsg.results?.text?.toLowerCase().includes('non ho trovato') ||
                nextMsg.text?.toLowerCase().includes('spiacenti') ||
                nextMsg.text?.toLowerCase().includes('a questa email'));

            if (
              isOrderResult ||
              isProductResult ||
              isFormRetry ||
              isReturnSuccess ||
              isResultError
            ) {
              lastResultIndex = j;
              finalResults = nextMsg;
              sourceIndices.add(j); // Mark as consumed — no mutation of the message object
              // Continue looking to pick the LATEST result in the chain
              continue;
            }

            // If we found an AI message that ISN'T a result, stop merging
            break;
          }
        }

        if (lastResultIndex !== -1) {
          const results = { ...finalResults };

          // Inherit email from the user's lookup message (somewhere between form and results)
          if (!results.email && msg.type?.toLowerCase() === 'order_form') {
            for (let k = i + 1; k < lastResultIndex; k++) {
              const prevMsg = filtered[k];
              if (prevMsg.text?.startsWith('ORDER_LOOKUP:')) {
                const parts = prevMsg.text.split(':');
                if (parts[1]) results.email = parts[1];
                break;
              }
            }
          }

          blocks.push({ ...msg, results });
          i = lastResultIndex; // Skip everything consumed by the merge
          continue;
        }
      }

      blocks.push(msg);
    }
    return blocks.filter((_, idx) => !sourceIndices.has(idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, lastMessageId]);

  return (
    <div className="chat-inner" style={{ '--chat-header-color': chatColors.header }}>
      <ChatHeader connectionStatus={connectionStatus} />

      {view === 'profile' ? (
        <ProfileView
          onBack={() => setView('chat')}
          sessionId={sessionId}
          shopDomain={shopDomain}
          visitorId={liveChat.visitorId}
          profile={liveChat.bootProfile}
          consent={liveChat.bootConsent}
          requiresReConsent={requiresReConsent}
          onProfileUpdate={(newProfile) => liveChat.handleProfileUpdate(newProfile)}
          colors={chatColors}
        />
      ) : (
        <>
          <div className="chat-content-wrapper">
            <MessageList
              chatBlocks={chatBlocks}
              chatColors={chatColors}
              loading={loading}
              isThinking={isThinking}
              thinkingIntent={thinkingIntent}
              shopDomain={shopDomain}
              sessionId={sessionId}
              visitorId={liveChat.visitorId}
              bootProfile={liveChat.bootProfile}
              bootConsent={liveChat.bootConsent}
              requiresReConsent={requiresReConsent}
              handleProfileUpdate={liveChat.handleProfileUpdate}
              activeProduct={activeProduct}
              setActiveProduct={setActiveProduct}
              activeOrder={activeOrder}
              setActiveOrder={setActiveOrder}
              sendMessage={sendMessage}
              handleSuggestionClick={handleSuggestionClick}
              sendFeedback={sendFeedback}
              onImageClick={setActiveGallery}
              onProductAction={(action, payloadData) => {
                if (action === 'add_to_cart') handleProductCartAction(payloadData?.id);
              }}
              onExpand={onExpand}
            />

            {/* Conversation Ended Separator & Rating */}
            {sessionStatus === 'completed' && (
              <div className="conversation-ended-container">
                <div className="conversation-ended-separator">
                  <div className="separator-line" />
                  <span className="separator-text">Conversazione Terminata</span>
                  <div className="separator-line" />
                </div>

                <StarRating onRate={(rating) => sendFeedback(null, rating, null, 'conversation')} />
              </div>
            )}

            {/* Global Suggestions Area (Initial or Action-based) */}
            {(initialSuggestions.length > 0 && messages.length <= 1 && !hasActedOnProduct) ||
            showCheckoutSuggestion ? (
              <div className="global-suggestions-container">
                <AnimatePresence mode="wait">
                  {showCheckoutSuggestion ? (
                    <motion.div
                      key="checkout-suggestion"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                    >
                      <Suggestions
                        suggestions={[
                          {
                            label: `Vai al checkout (${cartCount})`,
                            value: 'Checkout',
                            variant: 'checkout',
                          },
                        ]}
                        onSuggestionClick={() => startCheckout()}
                      />
                    </motion.div>
                  ) : (
                    messages.length <= 1 && (
                      <motion.div
                        key="initial-suggestions"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                      >
                        <Suggestions
                          suggestions={initialSuggestions}
                          onSuggestionClick={handleSuggestionClick}
                        />
                      </motion.div>
                    )
                  )}
                </AnimatePresence>
              </div>
            ) : null}

            <MessageInput
              onSendMessage={(text) => {
                if (!loading) {
                  sendMessage(text);
                  if (onTyping) onTyping(false);
                }
              }}
              loading={loading}
              placeholder={
                sessionStatus === 'escalated' && !assignedTo
                  ? "Attendi l'intervento."
                  : 'Scrivi qualcosa...'
              }
              connectionStatus={connectionStatus}
              disabled={sessionStatus === 'escalated' && !assignedTo}
              sendButtonColor={chatColors.sendButton}
              inputBorderColor={chatColors.inputBorder}
              inputFocusColor={chatColors.inputFocus}
              previewMode={isPreview}
              onProfileClick={isPreview ? null : () => setView('profile')}
            />

            {/* Legal Disclaimer */}
            <div className="legal-disclaimer">
              Chattando accetti la{' '}
              <a
                href="/policies/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Privacy Policy
              </a>{' '}
              e la{' '}
              <a
                href="/policies/cookie-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="legal-link"
              >
                Cookie Policy
              </a>
              .
            </div>
          </div>
        </>
      )}

      <div id="jarbris-drawer-portal" className="drawer-portal-container" />

      {/* Close button - Hidden in profile view */}
      {view !== 'profile' && (
        <button
          className="close-button"
          aria-label="Riduci chat"
          onClick={(e) => {
            e.stopPropagation();
            if (!isPreview && onMinimize) onMinimize();
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M18 6L6 18M6 6L18 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <AnimatePresence>
        {activeProduct && (
          <ProductDrawer
            product={activeProduct}
            onClose={() => setActiveProduct(null)}
            shopDomain={shopDomain}
            isMobile={isMobile}
            onProductAction={(action, payloadData) => {
              if (action === 'add_to_cart') handleProductCartAction(payloadData?.id);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeOrder && (
          <Drawer
            isOpen={!!activeOrder}
            onClose={() => setActiveOrder(null)}
            title={`Ordine #${normalizeOrderNumber(activeOrder.orderNumber)}`}
          >
            <OrderDetailCard order={activeOrder} theme="light" />
          </Drawer>
        )}
      </AnimatePresence>

      <ImageLightbox
        isOpen={!!activeGallery}
        images={activeGallery?.images}
        currentIndex={activeGallery?.index || 0}
        onClose={() => setActiveGallery(null)}
        onNavigate={(newIndex) => setActiveGallery({ ...activeGallery, index: newIndex })}
      />

      {/* Checkout overlay — renders above chat when checkout is active */}
      <AnimatePresence>
        {checkoutState !== 'idle' && (
          <CheckoutView
            checkoutState={checkoutState}
            checkoutMode={checkoutMode}
            error={checkoutError}
            onClose={closeCheckout}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Chat;
