import { useState, useCallback, useEffect, useRef } from 'react';
import {
  requestCheckoutUrl,
  fetchCheckoutConfig,
  openCheckoutPopup,
  openCheckoutNewTab,
  notifyCheckoutComplete,
  monitorPopup,
  ensureBridgeListener,
} from '../services/checkoutService';
import { trackEvent } from '../services/trackingService.js';
import { postToParent } from '../config/bridge';

/**
 * useCheckout — Manages the Shopify checkout lifecycle.
 *
 * V1 state machine (popup-only):
 *   idle → loading → presenting (popup|newtab) → completed → idle
 *                  → error → idle
 *
 * V2 (future — Checkout Kit Web):
 *   idle → loading → presenting (inline|popup|newtab) → completed → idle
 *   When Checkout Kit Web goes stable, add 'inline' mode here.
 *   The CheckoutView component already has the inline rendering slot.
 *
 * @param {object} options
 * @param {function} options.onCartReset - Called when checkout completes to reset cart state
 * @param {function} options.onAddMessage - Called to add a confirmation message to chat
 * @returns {{ checkoutState, checkoutMode, startCheckout, closeCheckout, error }}
 */
export function useCheckout({ onCartReset, onAddMessage } = {}) {
  const [checkoutState, setCheckoutState] = useState('idle');
  const [checkoutMode, setCheckoutMode] = useState(null); // 'popup' | 'newtab' | (future: 'inline')
  const [error, setError] = useState(null);

  // Cleanup refs
  const popupRef = useRef(null);
  const popupCleanupRef = useRef(null);
  const completionTimerRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    ensureBridgeListener();
    return () => {
      isMounted.current = false;
      if (popupCleanupRef.current) {
        popupCleanupRef.current();
        popupCleanupRef.current = null;
      }
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, []);

  /**
   * Handles successful checkout completion.
   * Shows confirmation state for ~3.5 seconds, then returns to idle.
   */
  const handleCheckoutComplete = useCallback(() => {
    if (!isMounted.current) return;

    setCheckoutState('completed');

    // Notify host to resync cart
    notifyCheckoutComplete();

    // Reset cart in widget
    if (onCartReset) onCartReset();

    // Add confirmation message to chat
    if (onAddMessage) {
      onAddMessage({
        type: 'text',
        message:
          '**Pagamento completato con successo.**\nVuoi continuare a guardare altri prodotti?',
        format: 'markdown',
        disableFeedback: true,
      });
    }

    // Return to idle after 3.5 seconds
    completionTimerRef.current = setTimeout(() => {
      if (isMounted.current) {
        setCheckoutState('idle');
        setCheckoutMode(null);
        setError(null);
      }
    }, 3500);
  }, [onCartReset, onAddMessage]);

  /**
   * Handles popup closure — could be completion or user dismiss.
   */
  const handlePopupClosed = useCallback(() => {
    if (!isMounted.current) return;
    if (checkoutState === 'completed') return; // Already handled

    // Popup was closed — return to chat and let cart sync determine the outcome
    setCheckoutState('idle');
    setCheckoutMode(null);

    // Request cart resync — embed.js will send JARBRIS:cartUpdate
    postToParent({ type: 'JARBRIS:getCart' });
  }, [checkoutState]);

  /**
   * Starts the checkout flow. Entry point from UI.
   *
   * Flow:
   *   1. Request checkout URL from host (bridge)
   *   2. Request checkout config from API (for future inline mode)
   *   3. Present checkout as popup (or new tab if popup blocked)
   */
  const startCheckout = useCallback(async () => {
    if (checkoutState !== 'idle') return;

    setCheckoutState('loading');
    setError(null);

    try {
      // Parallel: get checkout URL and config
      const [urlResult] = await Promise.all([
        requestCheckoutUrl(),
        // Config fetched for future use — currently always returns 'popup'
        fetchCheckoutConfig(),
      ]);

      if (!isMounted.current) return;

      if (!urlResult.checkoutUrl) {
        throw new Error(urlResult.error || 'checkout_url_unavailable');
      }

      if (urlResult.itemCount === 0) {
        throw new Error('cart_empty');
      }

      const checkoutUrl = urlResult.checkoutUrl;

      // ─────────────────────────────────────────────────────────
      // CHECKOUT KIT INTEGRATION POINT (V2 — future)
      //
      // When Shopify Checkout Kit Web is stable:
      //   if (config.mode === 'inline') {
      //     const checkout = document.createElement('shopify-checkout');
      //     checkout.src = checkoutUrl;
      //     checkout.addEventListener('checkout:complete', handleCheckoutComplete);
      //     checkout.addEventListener('checkout:close', closeCheckout);
      //     checkout.open();
      //     setCheckoutMode('inline');
      //     setCheckoutState('presenting');
      //     return;
      //   }
      // ─────────────────────────────────────────────────────────

      // V1: Open checkout in popup window
      const popup = openCheckoutPopup(checkoutUrl);

      if (popup && !popup.closed) {
        popupRef.current = popup;
        setCheckoutMode('popup');
        setCheckoutState('presenting');

        // Product Interaction Tracking V1: checkout_clicked
        trackEvent('checkout_clicked', {
          cartItemCount: urlResult.itemCount || null,
        });

        // Monitor popup for closure
        popupCleanupRef.current = monitorPopup(popup, handlePopupClosed);
      } else {
        // Popup blocked by browser — fallback to new tab
        setCheckoutMode('newtab');
        setCheckoutState('presenting');
        openCheckoutNewTab();

        // Product Interaction Tracking V1: checkout_clicked (newtab fallback)
        trackEvent('checkout_clicked', {
          cartItemCount: urlResult.itemCount || null,
        });

        // Return to idle after a brief moment (user is in another tab)
        completionTimerRef.current = setTimeout(() => {
          if (isMounted.current) {
            setCheckoutState('idle');
            setCheckoutMode(null);
          }
        }, 2000);
      }
    } catch (err) {
      if (!isMounted.current) return;
      setError(err.message || 'checkout_error');
      setCheckoutState('error');

      // Auto-recover to idle after 5 seconds on error
      completionTimerRef.current = setTimeout(() => {
        if (isMounted.current) {
          setCheckoutState('idle');
          setError(null);
        }
      }, 5000);
    }
  }, [checkoutState, handlePopupClosed]);

  /**
   * User-initiated close of checkout view.
   * Returns to chat without completing.
   */
  const closeCheckout = useCallback(() => {
    // Clean up popup if open
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;

    if (popupCleanupRef.current) {
      popupCleanupRef.current();
      popupCleanupRef.current = null;
    }

    // Clean up timers
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    setCheckoutState('idle');
    setCheckoutMode(null);
    setError(null);
  }, []);

  return {
    checkoutState,
    checkoutMode,
    error,
    startCheckout,
    closeCheckout,
    handleCheckoutComplete,
  };
}
