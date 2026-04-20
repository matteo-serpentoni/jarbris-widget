import React, { useState, memo } from 'react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion, AnimatePresence } from 'framer-motion';
import { formatPromoExpiry } from '../../utils/shopifyUtils';
import { useI18n } from '../../hooks/useI18n';
import './PromoCard.css';

// --- Premium Refined SVG Icons ---
const Icons = {
  Tag: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="jarbris-promo-icon"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  Search: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Copy: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  Check: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Auto: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="jarbris-promo-icon"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Shipping: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="jarbris-promo-icon"
    >
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  Gift: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="jarbris-promo-icon"
    >
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  ),
  Info: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Close: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Shield: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Cart: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
};

const PromoCard = memo(({ promo, onSearch, index = 0 }) => {
  const t = useI18n();
  const [copied, setCopied] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  const toggleFlip = (e) => {
    e.stopPropagation();
    setIsFlipped(!isFlipped);
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    if (promo.code) {
      navigator.clipboard.writeText(promo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSearch = (objects, typeLabel = 'PROMO_SEARCH') => {
    if (onSearch && objects && objects.length > 0) {
      const type = objects[0].type;
      const handles = objects.map((obj) => obj.handle).join(',');
      onSearch(`${typeLabel}:${type}:${handles}`, { hidden: true });
    }
  };

  const handleSearchTargets = () => {
    const isAllCatalog = promo.targets?.includes('Tutto il catalogo');
    if (isAllCatalog) return;
    handleSearch(promo.targetObjects);
  };

  const handleSearchBuyItems = (e) => {
    e.stopPropagation();
    handleSearch(promo.buyObjects, 'BUY_SEARCH');
  };

  const getIcon = () => {
    if (promo.isFreeShipping) return <Icons.Shipping />;
    if (promo.type?.toLowerCase().includes('bxgy')) return <Icons.Gift />;
    return <Icons.Tag />;
  };

  const isAllCatalog = promo.targets?.includes('Tutto il catalogo');
  const showTitle = promo.title && promo.title !== promo.code;
  const expiryText = formatPromoExpiry(promo.endsAt);

  return (
    <div className="jarbris-promo-card-perspective">
      <motion.div
        className={`jarbris-promo-card ${isFlipped ? 'is-flipped' : ''}`}
        initial={{ opacity: 0, y: 15 }}
        animate={{
          opacity: 1,
          y: 0,
          rotateY: isFlipped ? 180 : 0,
        }}
        transition={{
          opacity: { delay: index * 0.1, duration: 0.6 },
          y: { delay: index * 0.1, duration: 0.6 },
          rotateY: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
        }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="jarbris-promo-refraction" />

        {/* --- FRONT SIDE --- */}
        <div className="jarbris-card-side jarbris-card-front">
          <div className="jarbris-coupon-top">
            <div className="jarbris-promo-header">
              <div className="jarbris-promo-tag">
                {getIcon()}
                <span className="jarbris-promo-badge">
                  {promo.isAutomatic ? 'Sconto Automatico' : 'Codice Sconto'}
                </span>
              </div>
              <div className="jarbris-promo-header-actions">
                {promo.isAutomatic && (
                  <motion.div
                    className="jarbris-promo-status-active"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    <div className="jarbris-status-pulse" />
                    Attivo
                  </motion.div>
                )}
                <button className="jarbris-promo-info-btn" onClick={toggleFlip} title={t('promo.details_title')}>
                  <Icons.Info />
                </button>
              </div>
            </div>

            <div className="jarbris-front-content">
              <div className="jarbris-promo-value-stack">
                {showTitle && <h3 className="jarbris-promo-title">{promo.title}</h3>}
                <div className="jarbris-promo-value">
                  {promo.value.replace(/1 PEZZI/g, '1 pezzo').replace(/1 PEZZO/g, '1 pezzo')}
                </div>
                {(promo.requirements || expiryText) && (
                  <div className="jarbris-promo-requirements">
                    {promo.requirements.replace(/1 PEZZI/g, '1 pezzo')}
                    {promo.requirements && expiryText && <span className="jarbris-req-dot" />}
                    {expiryText && <span className="jarbris-promo-expiry">{expiryText}</span>}
                  </div>
                )}
              </div>

              <div className="jarbris-promo-flow-container">
                {/* Reward Section */}
                {promo.targets && promo.targets.length > 0 && (
                  <div
                    className={`jarbris-promo-flow-item reward-item ${!isAllCatalog ? 'interactive' : ''}`}
                    onClick={!isAllCatalog ? handleSearchTargets : undefined}
                  >
                    <div className="jarbris-flow-icon">
                      <Icons.Gift />
                    </div>
                    <div className="jarbris-targets-info">
                      <span className="jarbris-targets-label">{t('promo.discount_applies_to')}</span>
                      <span className={`jarbris-targets-value ${isAllCatalog ? 'all-catalog' : ''}`}>
                        {isAllCatalog
                          ? 'Tutto il catalogo'
                          : promo.targets.slice(0, 2).join(', ') +
                            (promo.targets.length > 2 ? ' e Altri' : '')}
                      </span>
                    </div>
                    {!isAllCatalog && (
                      <div className="jarbris-search-indicator">
                        <Icons.Search />
                      </div>
                    )}
                  </div>
                )}

                {/* Requirement Section (for BXGY) */}
                {promo.buyObjects && promo.buyObjects.length > 0 && (
                  <>
                    <div className="jarbris-flow-connector">
                      <div className="connector-line"></div>
                      <div className="connector-text uppercase">acquistando almeno:</div>
                      <div className="connector-line"></div>
                    </div>
                    <div
                      className="jarbris-promo-flow-item requirement-item interactive"
                      onClick={handleSearchBuyItems}
                    >
                      <div className="jarbris-flow-icon">
                        <Icons.Cart />
                      </div>
                      <div className="jarbris-targets-info">
                        <span className="jarbris-targets-value">
                          {promo.buyObjects
                            .slice(0, 2)
                            .map((o) => o.title)
                            .join(', ') + (promo.buyObjects.length > 2 ? ' e Altri' : '')}
                        </span>
                      </div>
                      <div className="jarbris-search-indicator">
                        <Icons.Search />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="jarbris-coupon-divider" />

          <div className="jarbris-coupon-bottom">
            {promo.code ? (
              <button
                className={`jarbris-promo-copy-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
              >
                <div className="jarbris-code-container">
                  <span className="code-text" title={promo.code}>
                    {promo.code}
                  </span>
                </div>
                <div className="copy-action">
                  <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.span
                        key="check"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="copy-feedback"
                      >
                        <Icons.Check /> Copiato
                      </motion.span>
                    ) : (
                      <motion.span
                        key="copy"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.8 }}
                        exit={{ opacity: 0 }}
                        className="copy-label"
                      >
                        <Icons.Copy /> Copia
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </button>
            ) : (
              promo.isAutomatic && (
                <div className="jarbris-promo-auto-info">
                  <Icons.Auto />
                  Applicato automaticamente
                </div>
              )
            )}
          </div>
        </div>

        {/* --- BACK SIDE --- */}
        <div className="jarbris-card-side jarbris-card-back">
          <div className="jarbris-back-header">
            <div className="jarbris-back-title">
              <Icons.Shield />
              Termini & Condizioni
            </div>
            <button
              className="jarbris-promo-close-btn"
              onClick={toggleFlip}
              title={t('ui.back_to_offer')}>

              <Icons.Close />
            </button>
          </div>

          <div className="jarbris-back-content">
            <div className="jarbris-details-list">
              <div className="jarbris-detail-item">
                <span className="label">{t('promo.validity_label')}:</span>
                <span className="value">
                  Solo {promo.details?.channels?.join(', ') || 'Online'}
                </span>
                <div className="meta">
                  Dal {new Date(promo.startsAt).toLocaleDateString('it-IT')}
                  {promo.endsAt && ` al ${new Date(promo.endsAt).toLocaleDateString('it-IT')}`}
                </div>
              </div>

              {promo.details?.shipping && (
                <div className="jarbris-detail-item">
                  <span className="label">{t('promo.shipping_label')}:</span>
                  <span className="value">
                    {promo.details.shipping.countries.includes('*') ||
                    promo.details.shipping.countries.includes('Tutti i paesi')
                      ? t('promo.shipping_all_countries')
                      : `Solo ${promo.details.shipping.countries.join(', ')}`}
                  </span>
                  {promo.details.shipping.maxPrice && (
                    <div className="meta">
                      {t('promo.shipping_max_price', { price: promo.details.shipping.maxPrice })}
                    </div>
                  )}
                </div>
              )}

              {(promo.details?.totalUsageLimit || promo.details?.oncePerCustomer) && (
                <div className="jarbris-detail-item">
                  <span className="label">{t('promo.limits_label')}:</span>
                  <span className="value">
                    {promo.details.totalUsageLimit && t('promo.limited_availability')}
                    {promo.details.totalUsageLimit && promo.details.oncePerCustomer && ' • '}
                    {promo.details.oncePerCustomer && t('promo.once_per_customer')}
                  </span>
                </div>
              )}

              {promo.buyObjects && promo.buyObjects.length > 0 && (
                <div className="jarbris-detail-item">
                  <span className="label">{t('promo.purchase_requirement')}:</span>
                  <span className="value">{promo.buyObjects.map((o) => o.title).join(', ')}</span>
                </div>
              )}

              <div className="jarbris-detail-item">
                <span className="label">{t('promo.combinability_label')}:</span>
                {promo.details?.canCombineWith?.productDiscounts ||
                promo.details?.canCombineWith?.orderDiscounts ? (
                  <span className="value success">{t('promo.combinable')}</span>
                ) : (
                  <span className="value warning">{t('promo.not_combinable')}</span>
                )}
              </div>

              <div className="jarbris-detail-item">
                <span className="label">{t('promo.other_notes')}:</span>
                <ul className="jarbris-notes-list">
                  {promo.details?.onOneTimePurchaseOnly && (
                    <li>{t('promo.single_purchase')}</li>
                  )}
                  {promo.details?.isForAllCustomers ? (
                    <li>{t('promo.all_customers')}</li>
                  ) : (
                    <li>{t('promo.specific_customers')}</li>
                  )}
                  <li>
                    {promo.isAutomatic
                      ? 'Si applica automaticamente nel carrello'
                      : "Richiede l'inserimento del codice a checkout"}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="jarbris-back-footer">
            <button className="jarbris-back-return-btn" onClick={toggleFlip}>
              {t('ui.back_to_coupon')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
});

export default PromoCard;
