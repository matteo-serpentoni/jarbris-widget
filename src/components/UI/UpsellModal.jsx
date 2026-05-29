import React, { useState, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import './ConfirmDialog.css';
import './UpsellModal.css';

/**
 * UpsellModal
 *
 * Snapshots showAnalytics/showMarketing on open so parent state changes
 * (e.g. consent toggled to true) don't collapse rows mid-animation.
 *
 * Auto-closes 700ms after all visible items have been activated.
 */
const UpsellModal = ({
  isOpen,
  title,
  desc,
  showAnalytics,
  analyticsTitle,
  analyticsDesc,
  showMarketing,
  marketingTitle,
  marketingDesc,
  enableLabel = 'Attiva',
  closeLabel = 'Non ora',
  onEnableAnalytics,
  onEnableMarketing,
  onClose,
  accentColor = '#667eea',
}) => {
  const [activated, setActivated] = useState({ analytics: false, marketing: false });

  // Snapshot which items to show at the moment the modal opens.
  // These do NOT update while the modal is open, preventing rows from collapsing
  // when the parent updates consent state.
  const [snap, setSnap] = useState({ analytics: false, marketing: false });

  useEffect(() => {
    if (isOpen) {
      setActivated({ analytics: false, marketing: false });
      setSnap({ analytics: showAnalytics, marketing: showMarketing });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // intentionally ignoring showAnalytics/showMarketing deps

  // Auto-close when all snapshotted visible items are activated
  useEffect(() => {
    if (!isOpen) return;

    const analyticsOk = !snap.analytics || activated.analytics;
    const marketingOk = !snap.marketing || activated.marketing;
    const anyVisible = snap.analytics || snap.marketing;

    if (anyVisible && analyticsOk && marketingOk) {
      const timer = setTimeout(() => onClose?.(), 700);
      return () => clearTimeout(timer);
    }
  }, [activated, snap, isOpen, onClose]);

  const handleEnableAnalytics = () => {
    setActivated((prev) => ({ ...prev, analytics: true }));
    onEnableAnalytics?.();
  };

  const handleEnableMarketing = () => {
    setActivated((prev) => ({ ...prev, marketing: true }));
    onEnableMarketing?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="jarbris-confirm-dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="jarbris-confirm-dialog jarbris-upsell-modal"
            style={{ '--upsell-accent': accentColor }}
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jarbris-upsell-title"
          >
            <h4 id="jarbris-upsell-title" className="jarbris-confirm-title jarbris-upsell-title">
              {title}
            </h4>
            <p className="jarbris-confirm-message">{desc}</p>

            <div className="jarbris-upsell-items">
              {snap.analytics && (
                <UpsellItem
                  title={analyticsTitle}
                  desc={analyticsDesc}
                  enableLabel={enableLabel}
                  activated={activated.analytics}
                  onEnable={handleEnableAnalytics}
                  accentColor={accentColor}
                />
              )}

              {snap.marketing && (
                <UpsellItem
                  title={marketingTitle}
                  desc={marketingDesc}
                  enableLabel={enableLabel}
                  activated={activated.marketing}
                  onEnable={handleEnableMarketing}
                  accentColor={accentColor}
                />
              )}
            </div>

            <div className="jarbris-confirm-actions">
              <button type="button" className="jarbris-confirm-btn cancel" onClick={onClose}>
                {closeLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Single upsell item row with Attiva → ✓ morph animation.
 * Activated state: same pill shape, same accent color, content becomes ✓.
 */
const UpsellItem = ({ title, desc, enableLabel, activated, onEnable, accentColor }) => (
  <div className="jarbris-upsell-item">
    <div className="jarbris-upsell-item-text">
      <p className="jarbris-upsell-item-title">{title}</p>
      <p className="jarbris-upsell-item-desc">{desc}</p>
    </div>

    <div className="jarbris-upsell-btn-slot">
      <AnimatePresence mode="wait">
        {activated ? (
          <motion.div
            key="check"
            className="jarbris-upsell-enable-btn jarbris-upsell-activated"
            style={{ background: accentColor }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 14, stiffness: 280 }}
          >
            ✓
          </motion.div>
        ) : (
          <motion.button
            key="btn"
            type="button"
            className="jarbris-upsell-enable-btn"
            style={{ background: accentColor }}
            initial={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.12, ease: 'easeIn' }}
            onClick={onEnable}
          >
            {enableLabel}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  </div>
);

export default UpsellModal;
