/**
 * CrossSellBlock — Cross-sell recommendations after add-to-cart
 *
 * Rendered inside the add_to_cart_action message when `data.crossSell` is present.
 * Shows up to 3 compact product cards: image, name, price, promo badge, CTA.
 *
 * Renders nothing if products array is empty.
 */
import { memo, useRef, useState, useEffect } from 'react';
import AddToCartButton from './AddToCartButton';
import { ExternalLinkIcon, SparkleIcon, ChevronLeftIcon, ChevronRightIcon } from '../UI/Icons';
import { formatPrice } from '../../utils/messageHelpers';
import { normalizeStorefrontProduct } from '../../utils/shopifyUtils';
import { useI18n } from '../../hooks/useI18n';
import './CrossSellBlock.css';

const CrossSellCard = memo(({ product, shopDomain, index, onOpen }) => {
  const t = useI18n();
  const normalized = normalizeStorefrontProduct(product);
  const {
    primaryImage: image,
    name,
    price,
    compareAtPrice,
    discountPercentage,
    currency,
    isAvailable,
    hasVariants,
    url,
    variants,
  } = normalized;

  const onSale = compareAtPrice > price;

  return (
    <div className="jarbris-xs-card" style={{ animationDelay: `${index * 70}ms` }}>
      <a
        href={url}
        className="jarbris-xs-image-wrapper"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View ${name}`}
      >
        {image ? (
          <img src={image.url || image} alt={name} className="jarbris-xs-image" loading="lazy" />
        ) : (
          <div className="jarbris-xs-image-placeholder" aria-hidden="true" />
        )}
        {onSale && discountPercentage > 0 && (
          <span className="jarbris-xs-promo-badge" aria-label={`${discountPercentage}% off`}>
            -{discountPercentage}%
          </span>
        )}
      </a>

      <div className="jarbris-xs-info">
        <a
          href={url}
          className="jarbris-xs-name"
          target="_blank"
          rel="noopener noreferrer"
          title={name}
        >
          <span className="jarbris-xs-name-text">{name}</span>
          <ExternalLinkIcon size={12} />
        </a>

        <div className="jarbris-xs-price-row">
          {onSale && (
            <span className="jarbris-xs-original-price">{formatPrice(compareAtPrice, currency)}</span>
          )}
          <span className="jarbris-xs-price">{formatPrice(price, currency)}</span>
        </div>

        {isAvailable ? (
          hasVariants ? (
            <button
              className="jarbris-xs-cta jarbris-xs-cta--view"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onOpen) onOpen(product);
              }}
              aria-label={`View options for ${name}`}
            >
              View options
            </button>
          ) : (
            variants[0]?.id && (
              <div className="jarbris-xs-atc-wrapper">
                <AddToCartButton
                  variantId={variants[0].id}
                  shopDomain={shopDomain}
                  quantity={1}
                  compact={true}
                />
              </div>
            )
          )
        ) : (
          <span className="jarbris-xs-unavailable">{t('product.sold_out')}</span>
        )}
      </div>
    </div>
  );
});

CrossSellCard.displayName = 'CrossSellCard';

/**
 * CrossSellBlock — wrapper for the full cross-sell section.
 *
 * @param {{ data: { title: string, vertical: string, products: Object[] }, shopDomain: string }} props
 */
const CrossSellBlock = memo(({ data, shopDomain, onOpen }) => {
  const scrollRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      // Initial check
      checkScroll();
      return () => el.removeEventListener('scroll', checkScroll);
    }
  }, [data?.products]);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const cardWidth = container.querySelector('.jarbris-xs-card')?.offsetWidth || 136;
      const gap = 8;
      const scrollAmount = direction === 'next' ? cardWidth + gap : -(cardWidth + gap);

      container.scrollBy({
        left: scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!data?.products?.length) return null;

  return (
    <div className="jarbris-cross-sell-block">
      <div className="jarbris-xs-header">
        <SparkleIcon size={13} />
        <span className="jarbris-xs-title">{data.title}</span>
      </div>

      <div className="jarbris-carousel-wrapper">
        {showLeftArrow && (
          <button
            className="jarbris-carousel-nav-btn prev"
            onClick={() => scroll('prev')}
            aria-label="Prodotto precedente"
          >
            <ChevronLeftIcon size={16} />
          </button>
        )}

        <div className="jarbris-xs-grid" ref={scrollRef}>
          {data.products.slice(0, 3).map((product, index) => (
            <CrossSellCard
              key={product.id || product.productId || index}
              product={product}
              shopDomain={shopDomain}
              index={index}
              onOpen={onOpen}
            />
          ))}
        </div>

        {showRightArrow && data.products.length > 1 && (
          <button
            className="jarbris-carousel-nav-btn next"
            onClick={() => scroll('next')}
            aria-label="Prodotto successivo"
          >
            <ChevronRightIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
});

CrossSellBlock.displayName = 'CrossSellBlock';

export default CrossSellBlock;
