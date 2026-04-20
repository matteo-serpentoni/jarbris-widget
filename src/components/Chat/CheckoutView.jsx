import React, { memo } from 'react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion } from 'framer-motion';
import { ExternalLinkIcon, CheckCircleIcon, ChevronLeft } from '../UI/Icons';
import { useI18n } from '../../hooks/useI18n';
import './CheckoutView.css';

/**
 * CheckoutView — Manages the visual states of the checkout experience.
 *
 * V1 states (popup-only):
 *   - loading: Spinner while fetching checkout URL
 *   - presenting (popup): Overlay telling user checkout is open in popup
 *   - presenting (newtab): Brief overlay telling user checkout opened in new tab
 *   - completed: Success animation + confirmation
 *   - error: Error message + back button
 *
 * V2 (future — Checkout Kit Web):
 *   - presenting (inline): Checkout Kit <shopify-checkout> rendered inside widget
 *   - The inline rendering slot is preserved below as a commented section.
 *
 * @param {{ checkoutState, checkoutMode, error, onClose }} props
 */
const CheckoutView = memo(({ checkoutState, checkoutMode, error, onClose }) => {
  const t = useI18n();
  if (checkoutState === 'idle') return null;

  return (
    <motion.div
      className="jarbris-checkout-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header — always visible except in completed state */}
      {checkoutState !== 'completed' && (
        <div className="jarbris-checkout-header">
          <span className="jarbris-checkout-header-title">
            {checkoutState === 'loading' ? t('checkout.title') : t('checkout.payment')}
          </span>
          <button
            className="jarbris-checkout-back-btn"
            onClick={onClose}
            aria-label={t('checkout.back_to_chat')}
          >
            <ChevronLeft />
            {t('checkout.chat')}
          </button>
        </div>
      )}

      {/* LOADING STATE */}
      {checkoutState === 'loading' && (
        <div className="jarbris-checkout-loading">
          <div className="jarbris-checkout-loading-spinner" />
          <span className="jarbris-checkout-loading-text">{t('checkout.preparing')}</span>
        </div>
      )}

      {/*
       * CHECKOUT KIT INLINE SLOT (V2 — future)
       *
       * When Shopify Checkout Kit Web goes stable, add:
       *   {checkoutState === 'presenting' && checkoutMode === 'inline' && (
       *     <div className="jarbris-checkout-body" ref={checkoutContainerRef} />
       *   )}
       */}

      {/* PRESENTING — POPUP MODE */}
      {checkoutState === 'presenting' && checkoutMode === 'popup' && (
        <div className="jarbris-checkout-popup-active">
          <div className="jarbris-checkout-popup-icon">
            <ExternalLinkIcon />
          </div>
          <h3 className="jarbris-checkout-popup-title">{t('checkout.in_progress_title')}</h3>
          <p className="jarbris-checkout-popup-text">
            {t('checkout.in_progress_text')}
          </p>
          <button className="jarbris-checkout-popup-btn" onClick={onClose}>
            {t('checkout.back_to_chat')}
          </button>
        </div>
      )}

      {/* PRESENTING — NEW TAB MODE */}
      {checkoutState === 'presenting' && checkoutMode === 'newtab' && (
        <div className="jarbris-checkout-popup-active">
          <div className="jarbris-checkout-popup-icon">
            <ExternalLinkIcon />
          </div>
          <h3 className="jarbris-checkout-popup-title">{t('checkout.open_title')}</h3>
          <p className="jarbris-checkout-popup-text">{t('checkout.open_text')}</p>
          <button className="jarbris-checkout-popup-btn" onClick={onClose}>
            {t('checkout.back_to_chat')}
          </button>
        </div>
      )}

      {/* COMPLETED STATE */}
      {checkoutState === 'completed' && (
        <motion.div
          className="jarbris-checkout-completed"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <motion.div
            className="jarbris-checkout-success-icon"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 15 }}
          >
            <CheckCircleIcon />
          </motion.div>
          <h3 className="jarbris-checkout-success-text">{t('checkout.success_title')}</h3>
          <p className="jarbris-checkout-success-sub">{t('checkout.success_sub')}</p>
        </motion.div>
      )}

      {/* ERROR STATE */}
      {checkoutState === 'error' && (
        <div className="jarbris-checkout-error">
          <div className="jarbris-checkout-error-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="jarbris-checkout-error-text">
            {error === 'cart_empty'
              ? t('checkout.error_cart_empty')
              : error === 'checkout_url_unavailable'
                ? t('checkout.error_unavailable')
                : t('checkout.error_generic')}
          </p>
          <button
            className="jarbris-checkout-error-btn"
            onClick={onClose}
            aria-label={t('checkout.back_to_chat')}
          >
            {t('checkout.back_to_chat')}
          </button>
        </div>
      )}
    </motion.div>
  );
});

export default CheckoutView;
