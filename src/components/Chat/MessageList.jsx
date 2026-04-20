import { useRef, useEffect, useCallback, memo, useState } from 'react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { AnimatePresence, motion } from 'framer-motion';
import './MessageList.css';
import CategoryCards from '../Message/CategoryCards';
import ProductCards from '../Message/ProductCards';
import OrderCards from '../Message/OrderCards';
import DynamicForm from '../Message/DynamicForm';
import TextMessage from '../Message/TextMessage';
import Suggestions from '../Message/Suggestions';
import PromoCards from '../Message/PromoCards';
import CartAction from '../Message/CartAction';
import CrossSellBlock from '../Message/CrossSellBlock';
import ErrorBoundary from '../UI/ErrorBoundary';
import { useI18n } from '../../hooks/useI18n';
import MessageFallback from './MessageFallback';
import MessageBubble from './MessageBubble';
import HumanThinking from './HumanThinking';
import ProfileCardMessage from '../Message/ProfileCardMessage';
import { MoreDotsIcon } from '../UI/Icons';

/**
 * MessageList
 * Handles the iterative rendering of chat messages and specialized blocks.
 */
const MessageList = memo(
  ({
    chatBlocks,
    chatColors,
    loading,
    isThinking,
    thinkingIntent,
    shopDomain,
    sessionId,
    visitorId,
    bootProfile,
    bootConsent,
    handleProfileUpdate,
    activeProduct,
    setActiveProduct,
    activeOrder,
    setActiveOrder,
    sendMessage,
    handleSuggestionClick,
    sendFeedback,
    onImageClick,
    onProductAction,
    onExpand,
  }) => {
    // Pre-compute the ID of the last message that has hasMore=true,
    // so the expand button is only rendered on the most recent product page.
    const lastExpandableId = (() => {
      for (let i = chatBlocks.length - 1; i >= 0; i--) {
        const b = chatBlocks[i];
        if (b.type?.toLowerCase() === 'product_cards' && b.hasMore) return b.id;
      }
      return null;
    })();
    const messagesAreaRef = useRef(null);
    const lastMessageRef = useRef(null);
    const lastMessageIdRef = useRef(null);
    const prevThinkingRef = useRef(isThinking);
    const prevLoadingRef = useRef(loading);
    // 2a: Track IDs present at first render — these are hydrated from boot/localStorage
    // and should NOT animate in (they were already "seen" before reload).
    // Only truly new messages arriving after mount get the entrance animation.
    const [hydratedIds] = useState(() => new Set(chatBlocks.map((b) => String(b.id))));

    const t = useI18n();

    const scrollToBottom = (behavior = 'auto') => {
      if (messagesAreaRef.current) {
        messagesAreaRef.current.scrollTo({
          top: messagesAreaRef.current.scrollHeight,
          behavior: behavior,
        });
      }
    };

    const scrollToNewMessage = useCallback(
      (behavior = 'smooth') => {
        if (lastMessageRef.current && messagesAreaRef.current) {
          const containerHeight = messagesAreaRef.current.clientHeight;
          const messageHeight = lastMessageRef.current.offsetHeight;
          const lastBlock = chatBlocks[chatBlocks.length - 1];

          // Never scroll to top for forms or specific action-oriented intents
          // These should behave like standard messages and stay at the bottom
          const isInteraction =
            lastBlock?.type?.toLowerCase() === 'form_request' ||
            lastBlock?.detectedIntent === 'REFUND_ACTION' ||
            lastBlock?.detectedIntent === 'ORDER_TRACK_ACTION';

          // Threshold: if message is taller than 40% of the viewport AND not an interaction (like a form)
          // We prioritize showing the START of informational responses so the user doesn't miss the beginning.
          if (!isInteraction && messageHeight > containerHeight * 0.4) {
            lastMessageRef.current.scrollIntoView({
              behavior,
              block: 'start',
            });
          } else {
            scrollToBottom(behavior);
          }
        } else {
          scrollToBottom(behavior);
        }
      },
      [chatBlocks],
    );

    // Autoscroll logic
    useEffect(() => {
      const lastBlock = chatBlocks[chatBlocks.length - 1];
      const lastId = lastBlock?.id;
      const justStartedThinking = isThinking && !prevThinkingRef.current;
      const justStartedLoading = loading && !prevLoadingRef.current;

      // Detect if we just stopped thinking (response arrived)
      if (lastId !== lastMessageIdRef.current) {
        if (!lastMessageIdRef.current) {
          scrollToBottom('auto');
        } else {
          // Wait for DOM to stabilize before scrolling
          const timer = setTimeout(() => {
            scrollToNewMessage('smooth');
          }, 100);
          return () => clearTimeout(timer);
        }
        lastMessageIdRef.current = lastId;
      } else if (justStartedThinking || justStartedLoading) {
        // While thinking/loading, keep it pinned strongly ONLY when we transition to these states
        scrollToBottom('auto');
      }

      // Sync refs for next render
      prevThinkingRef.current = isThinking;
      prevLoadingRef.current = loading;
    }, [chatBlocks, loading, isThinking, scrollToNewMessage]);

    const renderMessageContent = (msg) => {
      // 1. Category Cards
      if (msg.type?.toLowerCase() === 'category_cards') {
        return (
          <CategoryCards
            message={msg}
            onCategoryClick={(category) =>
              sendMessage(`Mostrami i prodotti della categoria ${category.title}`, {
                collectionHandle: category.handle,
              })
            }
          />
        );
      }

      // 2. Product Cards
      if (msg.type?.toLowerCase() === 'product_cards') {
        return (
          <ProductCards
            message={msg}
            shopDomain={shopDomain}
            onOpen={setActiveProduct}
            onImageClick={onImageClick}
            activeProduct={activeProduct}
            chatColors={chatColors}
            sendFeedback={sendFeedback}
            onProductAction={onProductAction}
            sendMessage={sendMessage}
          />
        );
      }

      // 4. Order Details/Lists
      if (
        [
          'order_detail',
          'order_list',
          'order_cards',
          'order_detail_response',
          'order_list_response',
          'order_response',
        ].includes(msg.type?.toLowerCase())
      ) {
        return (
          <OrderCards
            message={msg}
            onOrderClick={(order, email) => {
              if (typeof order === 'object') {
                setActiveOrder(order);
              } else {
                sendMessage(`ORDER_LOOKUP:${email}:${order}`, {
                  hidden: true,
                });
              }
            }}
          />
        );
      }

      // 5.5 Promo Cards (OFFERS intent - no text, only cards)
      if (msg.type?.toLowerCase() === 'promo_cards') {
        return <PromoCards message={msg} onSearch={sendMessage} />;
      }

      // 5.6 Cart Action (ADD_TO_CART_ACTION — auto add-to-cart for no-variant products)
      if (msg.type?.toLowerCase() === 'add_to_cart_action') {
        return (
          <>
            <CartAction
              actionId={msg.actionId}
              variantId={msg.variantId}
              quantity={msg.quantity || 1}
              pendingMessage={msg.pendingMessage}
              successMessage={msg.message || msg.text}
              errorMessage={msg.errorMessage}
            />
            {msg.crossSell && (
              <CrossSellBlock
                data={msg.crossSell}
                shopDomain={shopDomain}
                onOpen={setActiveProduct}
              />
            )}
          </>
        );
      }

      // 5.7 Cross Sell Block (Standalone V2/V1 recommendations rendering)
      if (msg.type?.toLowerCase() === 'cross_sell_block') {
        return msg.crossSell ? (
          <CrossSellBlock data={msg.crossSell} shopDomain={shopDomain} onOpen={setActiveProduct} />
        ) : null;
      }

      // 6. Return Submitted (Final Step)
      if (msg.type?.toLowerCase() === 'return_submitted') {
        return (
          <div className="jarbris-return-success-block">
            <div className="jarbris-return-success-glow" />
            <div className="jarbris-success-check-wrapper">
              <div className="jarbris-success-check">
                <svg viewBox="0 0 52 52">
                  <title>{t('ui.success')}</title>
                  <circle cx="26" cy="26" r="25" fill="none" />
                  <path fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                </svg>
              </div>
            </div>
            <div className="jarbris-return-success-text">
              <h4>{t('ui.request_received')}</h4>
              <p>{msg.message}</p>
            </div>
          </div>
        );
      }

      // 7. Dynamic Form (New Engine)
      if (msg.type?.toLowerCase() === 'form_request') {
        const results = msg.results;
        const resultType = results?.type?.toLowerCase();

        // Check if we have a specialized result to show inside the form
        const hasSpecializedResult = [
          'order_detail',
          'order_list',
          'order_cards',
          'product_cards',
          'category_cards',
          'return_submitted',
        ].includes(resultType);

        return (
          <DynamicForm
            message={msg}
            onSubmit={(signal) => sendMessage(signal, { hidden: true })}
            loading={loading}
          >
            {hasSpecializedResult && renderMessageContent(results)}
          </DynamicForm>
        );
      }

      // 8. Profile Card
      if (msg.type?.toLowerCase() === 'profile_card') {
        const isLastMessage = msg.id === chatBlocks[chatBlocks.length - 1]?.id;
        return (
          <ProfileCardMessage
            message={msg}
            chatColors={chatColors}
            isLastMessage={isLastMessage}
            sessionId={sessionId}
            shopDomain={shopDomain}
            visitorId={visitorId}
            bootProfile={bootProfile}
            bootConsent={bootConsent}
            handleProfileUpdate={handleProfileUpdate}
          />
        );
      }

      return (
        <>
          <TextMessage message={msg} />
          {msg.promos && msg.promos.length > 0 && (
            <PromoCards message={msg} onSearch={sendMessage} />
          )}
        </>
      );
    };

    const renderMessage = (msg) => {
      const content = renderMessageContent(msg);
      let type = 'default';

      if (msg.type?.toLowerCase() === 'category_cards') {
        type = 'category_cards';
      } else if (msg.type?.toLowerCase() === 'product_cards') {
        type = 'product_cards';
      } else if (
        [
          'order_detail',
          'order_list',
          'order_cards',
          'order_detail_response',
          'order_list_response',
          'order_response',
        ].includes(msg.type?.toLowerCase())
      ) {
        type = 'order_cards';
      } else if (msg.type?.toLowerCase() === 'return_submitted') {
        type = 'return_submitted';
      } else if (msg.type?.toLowerCase() === 'form_request') {
        type = 'form_request';
      } else if (msg.type?.toLowerCase() === 'promo_cards') {
        type = 'promo_cards';
      } else if (msg.type?.toLowerCase() === 'cross_sell_block') {
        type = 'cross_sell_block';
      } else if (msg.type?.toLowerCase() === 'profile_card') {
        type = 'profile_card';
      }

      const isStandalone = [
        'product_cards',
        'return_form',
        'return_submitted',
        'form_request',
        'promo_cards',
        'cross_sell_block',
        'profile_card',
      ].includes(type?.toLowerCase());

      return (
        <div className={`jarbris-message-block ${isStandalone ? 'standalone' : ''}`}>
          {!isStandalone ? (
            <MessageBubble
              sender={msg.sender}
              timestamp={msg.timestamp}
              chatColors={chatColors}
              type={type}
              feedback={msg.feedback}
              onFeedback={(type) => sendFeedback(msg.id, type, msg.text)}
              showFeedback={msg.sender === 'assistant' && !msg.error && !msg.disableFeedback}
            >
              {content}
            </MessageBubble>
          ) : (
            <>
              {/* Bubble + standalone split: show text bubble above standalone content */}
              {msg.text && type === 'form_request' && (
                <MessageBubble
                  sender={msg.sender}
                  timestamp={msg.timestamp}
                  chatColors={chatColors}
                  type="default"
                  showFeedback={false}
                >
                  <TextMessage message={{ text: msg.text }} />
                </MessageBubble>
              )}
              <div className="jarbris-standalone-content">{content}</div>
            </>
          )}

          {/* Suggestion Chips - External to Bubble */}
          {msg.suggestions && msg.suggestions.length > 0 && (
            <Suggestions suggestions={msg.suggestions} onSuggestionClick={handleSuggestionClick} />
          )}

          {/* Product Expand Button — rendered only on the last product page with hasMore */}
          {msg.id === lastExpandableId && (
            <button
              id="product-expand-btn"
              type="button"
              className="jarbris-suggestion-chip overflow"
              onClick={onExpand}
              disabled={loading}
              aria-label={t('ui.show_more')}
            >
              <MoreDotsIcon />
              {t('ui.show_more')}
            </button>
          )}
        </div>
      );
    };

    // Determine if we should show the global typing indicator.
    // We hide it if an order lookup is active via the form, as the form shows its own loader.
    const isFormLoading =
      loading &&
      chatBlocks.length > 0 &&
      ['form_request', 'order_form', 'return_form', 'return_items', 'return_reason'].includes(
        chatBlocks[chatBlocks.length - 1].type,
      );

    return (
      <div
        ref={messagesAreaRef}
        className={`messages-area ${activeProduct || activeOrder ? 'jarbris-drawer-active' : ''}`}
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {chatBlocks.map((msg, index) => {
            // 2a: Skip entrance animation for messages that were already present on mount
            // (hydrated from localStorage or boot API). Only animate genuinely new messages.
            const isHydrated = hydratedIds.has(String(msg.id));
            return (
              <motion.div
                key={msg.id}
                ref={index === chatBlocks.length - 1 ? lastMessageRef : null}
                className="jarbris-message-wrapper"
                initial={isHydrated ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  opacity: { duration: 0.25 },
                  y: { duration: 0.3, ease: 'easeOut' },
                }}
              >
                <ErrorBoundary fallback={<MessageFallback />}>{renderMessage(msg)}</ErrorBoundary>
              </motion.div>
            );
          })}

          {isThinking && !isFormLoading && (
            <motion.div
              key="thinking-indicator"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <HumanThinking chatColors={chatColors} intent={thinkingIntent} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

export default MessageList;
