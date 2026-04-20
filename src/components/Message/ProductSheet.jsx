import React, { memo, useState, useEffect, useCallback } from 'react';
import Drawer from '../UI/Drawer';
import ProductModal from '../UI/ProductModal';
import AddToCartButton from './AddToCartButton';
import { formatPrice } from '../../utils/messageHelpers';
import { normalizeStorefrontProduct, isDefaultVariant } from '../../utils/shopifyUtils';
import { useI18n } from '../../hooks/useI18n';

/**
 * ProductSheet — Responsive customize panel.
 *
 * Renders the variant selection UI in two different shells depending on the device:
 *   - Mobile  → <Drawer>      (bottom sheet, slide-up)
 *   - Desktop → <ProductModal> (centered dialog, spring animation)
 *
 * The isMobile prop MUST come from the React prop chain (Orb → Chat → here),
 * never from a DOM class query, to guarantee correct behavior on DevTools toggle
 * and preview mode.
 *
 * @param {Object}   props.product          - Raw product object from the chat message
 * @param {Function} props.onClose          - Dismiss callback
 * @param {string}   props.shopDomain       - Merchant shop domain for ATC bridge
 * @param {Function} props.onProductAction  - Callback fired after add-to-cart
 * @param {boolean}  props.isMobile         - Device flag from Orb via prop chain
 */
const ProductSheet = memo(({ product, onClose, shopDomain, onProductAction, isMobile }) => {
  const t = useI18n();
  const normalized = normalizeStorefrontProduct(product);
  const {
    isAvailable,
    name,
    price: initialPrice,
    compareAtPrice: initialCompareAtPrice,
    currency,
  } = normalized;

  // Start with no selection — the user must explicitly choose every option group
  const [selectedOptions, setSelectedOptions] = useState({});
  const [currentVariant, setCurrentVariant] = useState(null);
  // Shown when the user taps ATC without having selected all option groups
  const [validationError, setValidationError] = useState('');

  // Variant groups that actually require a user choice (exclude Shopify's default "Title" group)
  const requiredOptions = (product.options || []).filter((opt) => !isDefaultVariant(opt));

  // True only when every required group has a selection
  const allOptionsSelected =
    requiredOptions.length === 0 ||
    requiredOptions.every((opt) => Boolean(selectedOptions[opt.name]));

  // Names of groups the user hasn't selected yet (used in the error message)
  const missingOptionNames = requiredOptions
    .filter((opt) => !selectedOptions[opt.name])
    .map((opt) => opt.name);

  // Sync currentVariant whenever selectedOptions changes
  useEffect(() => {
    if (!allOptionsSelected) {
      setCurrentVariant(null);
      return;
    }
    const found = normalized.variants.find((v) => {
      // 1. Storefront API format: [{ name: 'Color', value: 'Red' }]
      if (v.selectedOptions && Array.isArray(v.selectedOptions)) {
        return v.selectedOptions.every((opt) => selectedOptions[opt.name] === opt.value);
      }
      
      // 2. Admin API format: positional option1, option2, option3
      if (product.options && Array.isArray(product.options)) {
        return product.options.every((opt, index) => {
          // Shopify Admin API uses 1-based indexing for options
          const optionKey = `option${index + 1}`;
          const variantOptionValue = v[optionKey];
          // Compare string forms since options can sometimes be integers in metadata
          return String(selectedOptions[opt.name]) === String(variantOptionValue);
        });
      }
      
      return false;
    });
    
    setCurrentVariant(found || null);
  }, [selectedOptions, normalized.variants, allOptionsSelected, product.options]);

  const handleOptionChange = useCallback((optName, value) => {
    setSelectedOptions((prev) => ({ ...prev, [optName]: value }));
    // Clear error as soon as the user starts picking options
    setValidationError('');
  }, []);

  // Reset when the product changes (user opens a different product card)
  useEffect(() => {
    setSelectedOptions({});
    setCurrentVariant(null);
    setValidationError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id || product.productId]);

  const isVariantAvailable = currentVariant ? currentVariant.available : false;
  // Show the product base price until the user has selected all options
  const currentPrice = currentVariant?.price || initialPrice;
  const currentCompareAtPrice = currentVariant?.compareAtPrice || initialCompareAtPrice;

  const handleAtcClick = () => {
    if (!allOptionsSelected) {
      setValidationError(t('product.select_missing', { options: missingOptionNames.join(' e ') }));
    }
  };

  const footer = (
    <div className="jarbris-sheet-footer-inner">
      {/* Validation error — shown when user attempts ATC without all options */}
      {validationError && (
        <p className="jarbris-sheet-validation-error" role="alert">
          {validationError}
        </p>
      )}

      {!isAvailable ? (
        // Product itself is marked unavailable
        <div className="jarbris-add-to-cart-container compact">
          <button className="add-to-cart jarbris-add-to-cart-btn disabled" disabled>
            <span>{t('product.sold_out')}</span>
          </button>
        </div>
      ) : !allOptionsSelected ? (
        // Options not fully selected: intercepting click to show the error
        <div className="jarbris-add-to-cart-container compact">
          <button
            className="add-to-cart jarbris-add-to-cart-btn disabled"
            onClick={handleAtcClick}
            aria-disabled="true"
          >
            <span>{t('product.select_options')}</span>
          </button>
        </div>
      ) : !currentVariant ? (
        // All options selected, but this combination NEVER existed in Shopify (unlinked variants)
        <div className="jarbris-add-to-cart-container compact">
          <button className="add-to-cart jarbris-add-to-cart-btn disabled" disabled>
            <span>{t('product.unavailable')}</span>
          </button>
        </div>
      ) : !isVariantAvailable ? (
        // Specific variant combo exists but inventory is 0
        <div className="jarbris-add-to-cart-container compact">
          <button className="add-to-cart jarbris-add-to-cart-btn disabled" disabled>
            <span>{t('product.variant_sold_out')}</span>
          </button>
        </div>
      ) : (
        // All good — fire the real ATC with animation
        <AddToCartButton
          variantId={currentVariant.id || currentVariant.variantId}
          shopDomain={shopDomain}
          quantity={1}
          compact={true}
          onAnimationComplete={() => {
            if (onProductAction) {
              onProductAction('add_to_cart', {
                id: currentVariant.productId || product.productId || product.id,
              });
            }
            onClose();
          }}
        />
      )}
    </div>
  );

  // Shared body — same for both Drawer and Modal
  const body = (
    <>
      <div className="jarbris-drawer-price-section">
        <div className="jarbris-price-stack">
          {currentCompareAtPrice > currentPrice && (
            <span className="jarbris-original-price">
              {formatPrice(currentCompareAtPrice, currency)}
            </span>
          )}
          <span className="jarbris-current-price">{formatPrice(currentPrice, currency)}</span>
        </div>
      </div>

      {requiredOptions.length > 0 && (
        <div className="jarbris-drawer-variants">
          {requiredOptions.map((opt) => {
            const isMissing = validationError && !selectedOptions[opt.name];
            return (
              <div
                key={opt.name}
                className={`jarbris-variant-group ${isMissing ? 'jarbris-variant-group--error' : ''}`}
              >
                <span className="jarbris-variant-label">
                  {opt.name}
                  {isMissing && (
                    <span className="jarbris-variant-required-badge"> *</span>
                  )}
                </span>
                <div className="jarbris-variant-options">
                  {opt.values.length <= 4 ? (
                    <div className="jarbris-pills-container">
                      {opt.values.map((val) => (
                        <button
                          key={val}
                          className={`jarbris-pill ${
                            selectedOptions[opt.name] === val ? 'active' : ''
                          }`}
                          onClick={() => handleOptionChange(opt.name, val)}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <select
                      className={`jarbris-variant-select ${isMissing ? 'error' : ''}`}
                      value={selectedOptions[opt.name] || ''}
                      onChange={(e) => handleOptionChange(opt.name, e.target.value)}
                    >
                      <option value="" disabled>
                        {t('product.choose_option')} {opt.name}
                      </option>
                      {opt.values.map((val) => (
                        <option key={val} value={val}>
                          {val}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Drawer isOpen={!!product} onClose={onClose} footer={footer} title={name}>
        {body}
      </Drawer>
    );
  }

  return (
    <ProductModal isOpen={!!product} onClose={onClose} footer={footer} title={name}>
      {body}
    </ProductModal>
  );
});

export default ProductSheet;
