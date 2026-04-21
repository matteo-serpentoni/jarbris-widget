import { memo, useCallback } from 'react';
import { useI18n } from '../../../hooks/useI18n.js';
import AddToCartButton from '../../Message/AddToCartButton.jsx';
import './PurchaseOptionsDrawer.css';

/**
 * PurchaseOptionsDrawer
 *
 * Renders the plan selection UI when a product has selling plans.
 * Handles 3 cases:
 *   A) No purchase options → renders nothing (caller guards this)
 *   B) One-time + subscription → mode selector + plan list
 *   C) Subscription-only → plan list only (no one-time option)
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {boolean} props.requiresSellingPlan
 * @param {boolean} props.hasOneTimePurchase
 * @param {Array}   props.availablePlans     - NormalizedAllocation[]
 * @param {string|null} props.sellingPlanId  - Currently selected plan GID
 * @param {string|null} props.variantId      - Selected variant GID (for AddToCartButton)
 * @param {string}  props.shopDomain         - Merchant shop domain
 * @param {string}  props.mode              - 'one_time' | 'subscription'
 * @param {Function} props.onSelectPlan     - (sellingPlanId: string) => void
 * @param {Function} props.onSelectOneTime  - () => void
 * @param {Function} props.onConfirm        - () => void — called after ATC animation completes
 * @param {Function} props.onClose          - () => void
 * @param {boolean}  props.addToCartBlocked
 * @param {string}   props.lng              - Active language code (for Intl.NumberFormat)
 */
function PurchaseOptionsDrawer({
  isOpen,
  requiresSellingPlan,
  hasOneTimePurchase,
  availablePlans = [],
  sellingPlanId,
  variantId,
  shopDomain,
  mode,
  onSelectPlan,
  onSelectOneTime,
  onConfirm,
  onClose,
  addToCartBlocked,
  lng,
}) {
  const t = useI18n();

  const formatPrice = useCallback(
    (money) => {
      if (!money?.amount || !money?.currencyCode) return null;
      try {
        return new Intl.NumberFormat(lng || 'en', {
          style: 'currency',
          currency: money.currencyCode,
        }).format(money.amount);
      } catch {
        return `${money.amount} ${money.currencyCode}`;
      }
    },
    [lng],
  );

  if (!isOpen || availablePlans.length === 0) return null;

  // De-duplicate plans by sellingPlanId (multiple variants can share the same plan)
  const uniquePlans = availablePlans.reduce((acc, plan) => {
    if (!acc.find((p) => p.sellingPlanId === plan.sellingPlanId)) acc.push(plan);
    return acc;
  }, []);

  // Sort by price ascending
  const sortedPlans = [...uniquePlans].sort((a, b) => {
    const priceA = a.price?.amount ?? Infinity;
    const priceB = b.price?.amount ?? Infinity;
    return priceA - priceB;
  });

  // The currently active sellingPlanId — passed to AddToCartButton for any non-one_time selection
  const activeSellingPlanId = mode !== 'one_time' ? sellingPlanId : null;

  return (
    <div
      className="jarbris-purchase-drawer"
      role="dialog"
      aria-modal="true"
      aria-label={t('purchase_options.title')}
      id="jarbris-purchase-options-drawer"
    >
      {/* Backdrop */}
      <div className="jarbris-purchase-drawer__backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="jarbris-purchase-drawer__panel">
        {/* Header */}
        <div className="jarbris-purchase-drawer__header">
          <span className="jarbris-purchase-drawer__title">{t('purchase_options.title')}</span>
          <button
            className="jarbris-purchase-drawer__close"
            onClick={onClose}
            aria-label="Close"
            id="jarbris-purchase-drawer-close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="jarbris-purchase-drawer__body">
          {/* Notice: shown only when product REQUIRES a selling plan (no one-time purchase available).
               Uses neutral copy — correct for any plan type (preorder, prepaid, TBYB, sub). */}
          {requiresSellingPlan && (
            <p className="jarbris-purchase-drawer__notice">
              {t('purchase_options.no_one_time_purchase')}
            </p>
          )}

          <fieldset className="jarbris-purchase-drawer__fieldset">
            <legend className="jarbris-purchase-drawer__legend">
              {t('purchase_options.choose_option')}
            </legend>

            {/* One-time option (only if hasOneTimePurchase) */}
            {hasOneTimePurchase && (
              <label className={`jarbris-purchase-drawer__radio-row${mode === 'one_time' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="purchase-mode"
                  className="jarbris-purchase-drawer__radio"
                  checked={mode === 'one_time'}
                  onChange={onSelectOneTime}
                  id="jarbris-purchase-option-one-time"
                />
                <span className="jarbris-purchase-drawer__radio-indicator" aria-hidden="true" />
                <span className="jarbris-purchase-drawer__radio-label">
                  {t('purchase_options.one_time')}
                </span>
              </label>
            )}

            {/* Plan list */}
            {sortedPlans.map((plan) => {
              const isSelected = sellingPlanId === plan.sellingPlanId && mode === 'subscription';
              const priceStr = formatPrice(plan.price);
              const perDeliveryStr = formatPrice(plan.perDeliveryPrice);
              const planLabel = plan.planName || plan.options?.map((o) => o.value ?? o).join(', ');

              return (
                <label
                  key={plan.sellingPlanId}
                  className={`jarbris-purchase-drawer__radio-row${isSelected ? ' selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="purchase-mode"
                    className="jarbris-purchase-drawer__radio"
                    checked={isSelected}
                    onChange={() => onSelectPlan(plan.sellingPlanId)}
                    id={`jarbris-purchase-plan-${plan.sellingPlanId?.split('/').pop()}`}
                  />
                  <span className="jarbris-purchase-drawer__radio-indicator" aria-hidden="true" />
                  <span className="jarbris-purchase-drawer__radio-content">
                    {/* Plan type badge — empty for 'unknown', never subscription semantics */}
                    {(() => {
                      const badgeLabel = t(`purchase_options.plan_type_label.${plan.planType}`);
                      return badgeLabel ? (
                        <span
                          className={`jarbris-purchase-drawer__plan-badge jarbris-purchase-drawer__plan-badge--${plan.planType}`}
                          aria-label={badgeLabel}
                        >
                          {badgeLabel}
                        </span>
                      ) : null;
                    })()}
                    <span className="jarbris-purchase-drawer__radio-label">{planLabel}</span>
                    {priceStr && (
                      <span className="jarbris-purchase-drawer__option-price">
                        {priceStr}
                        {perDeliveryStr && plan.price?.amount !== plan.perDeliveryPrice?.amount && (
                          <span className="jarbris-purchase-drawer__per-delivery">
                            {' '}
                            ({t('purchase_options.per_delivery')}: {perDeliveryStr})
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {/* Blocked message — intentionally removed: footer button communicates the state */}
        </div>

        {/* Footer — AddToCartButton or dashed prompt */}
        <div className="jarbris-purchase-drawer__footer">
          {!addToCartBlocked && variantId ? (
            <AddToCartButton
              variantId={variantId}
              shopDomain={shopDomain}
              quantity={1}
              sellingPlanId={activeSellingPlanId}
              compact={true}
              onAnimationComplete={() => {
                if (onConfirm) onConfirm();
              }}
            />
          ) : (
            // Same visual pattern as ProductSheet "Seleziona Opzioni" — dashed, non-alarming
            <div className="jarbris-add-to-cart-container compact">
              <button
                className="add-to-cart jarbris-add-to-cart-btn jarbris-purchase-drawer__select-prompt"
                disabled
                aria-disabled="true"
              >
                <span>{t('purchase_options.select_option')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(PurchaseOptionsDrawer);
