import React, { useEffect, useRef, memo } from 'react';
import ReactDOM from 'react-dom';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion, AnimatePresence } from 'framer-motion';
import { CloseIcon } from './Icons';
import './ProductModal.css';

/**
 * Generic modal atom for desktop: renders centered inside the widget panel.
 * Uses a portal to escape overflow clipping from the orb-container.
 *
 * Mirrors ConfirmDialog structure: the overlay is a flexbox container
 * that centers the dialog child. This avoids conflicts between
 * Framer Motion's transform animation and CSS transform-based centering.
 *
 * @param {boolean}          props.isOpen    - Controls visibility
 * @param {Function}         props.onClose   - Dismiss callback
 * @param {string}           props.title     - Dialog title
 * @param {React.ReactNode}  props.children  - Modal body content
 * @param {React.ReactNode}  props.footer    - Sticky footer slot (CTA area)
 * @param {string}           props.portalId  - Portal target element ID
 */
const ProductModal = memo(
  ({ isOpen, onClose, title, children, footer, portalId = 'jarbris-drawer-portal' }) => {
    const dialogRef = useRef(null);
    const [target, setTarget] = React.useState(null);

    React.useLayoutEffect(() => {
      const el = document.getElementById(portalId);
      setTarget(el || document.body);
    }, [portalId]);

    // Focus trap: cycles Tab/Shift+Tab within the dialog; Escape dismisses
    useEffect(() => {
      if (!isOpen) return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableSelectors = [
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        'a[href]',
      ].join(', ');

      const getFocusable = () => Array.from(dialog.querySelectorAll(focusableSelectors));

      // Auto-focus first interactive element
      const firstFocusable = getFocusable()[0];
      firstFocusable?.focus();

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          onClose();
          return;
        }

        if (e.key !== 'Tab') return;

        const focusable = getFocusable();
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Scroll lock: prevent content behind modal from scrolling
    useEffect(() => {
      if (!isOpen) return;
      const contentWrapper = document.querySelector('.chat-content-wrapper');
      if (contentWrapper) {
        contentWrapper.style.overflow = 'hidden';
      }
      return () => {
        if (contentWrapper) {
          contentWrapper.style.overflow = '';
        }
      };
    }, [isOpen]);

    if (!target) return null;

    const modalContent = (
      <AnimatePresence>
        {isOpen && (
          // Overlay acts as flexbox centering container — clicking it dismisses.
          // Mirrors ConfirmDialog: no transform-based centering on the dialog itself.
          <motion.div
            className="jarbris-product-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          >
            {/* Dialog: centered by parent flexbox, Framer Motion only animates scale+y */}
            <motion.div
              ref={dialogRef}
              className="jarbris-product-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="jarbris-product-modal-title"
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="jarbris-product-modal-header">
                <h4 id="jarbris-product-modal-title" className="jarbris-product-modal-title">
                  {title}
                </h4>
                <button
                  className="jarbris-product-modal-close"
                  onClick={onClose}
                  aria-label="Chiudi"
                >
                  <CloseIcon size={14} />
                </button>
              </div>

              {/* Body */}
              <div className="jarbris-product-modal-body">{children}</div>

              {/* Footer */}
              {footer && <div className="jarbris-product-modal-footer">{footer}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );

    return ReactDOM.createPortal(modalContent, target);
  },
);

export default ProductModal;
