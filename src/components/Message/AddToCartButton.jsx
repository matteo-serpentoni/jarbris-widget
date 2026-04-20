import React, { useRef, useEffect, memo } from 'react';
import { extractVariantId } from '../../utils/shopifyUtils';
import { useI18n } from '../../hooks/useI18n';
import './AddToCartButton.css';

import { BRIDGE_CONFIG } from '../../config/bridge';

const AddToCartButton = memo(
  ({
    variantId,
    shopDomain,
    quantity = 1,
    onSuccess,
    onError,
    onAnimationComplete,
    compact = false,
  }) => {
    const t = useI18n();
    const buttonRef = useRef(null);
    const isMounted = useRef(true);

    useEffect(() => {
      isMounted.current = true;
      return () => {
        isMounted.current = false;
      };
    }, []);

    const addToCart = async () => {
      try {
        const numericVariantId = extractVariantId(variantId);

        if (!numericVariantId) {
          throw new Error('Variant ID non valido');
        }

        if (!shopDomain) {
          throw new Error('Shop domain non disponibile');
        }

        // Invece di fare la fetch, invia un messaggio al parent
        window.parent.postMessage(
          {
            type: 'JARBRIS:addToCart',
            variantId: numericVariantId,
            quantity: quantity,
          },
          '*',
        );

        // Ascolta la risposta dal parent
        const handleResponse = (event) => {
          if (!BRIDGE_CONFIG.isValidOrigin(event.origin, null, event.data?.type)) return;

          if (event.data.type === 'JARBRIS:addToCartResponse') {
            window.removeEventListener('message', handleResponse);

            if (event.data.success) {
              if (onSuccess) onSuccess(event.data.data);
            } else {
              if (onError) onError(new Error(event.data.error));
            }
          }
        };

        window.addEventListener('message', handleResponse);

        // Timeout dopo 5 secondi
        setTimeout(() => {
          window.removeEventListener('message', handleResponse);
        }, 5000);
      } catch (error) {
        if (onError) onError(error);
      }
    };

    useEffect(() => {
      const button = buttonRef.current;
      if (!button) return;

      // Collect all animation timer IDs so we can cancel them on cleanup
      const timers = [];

      const handlePointerDown = () => {
        if (!button || button.classList.contains('active')) {
          return;
        }
        if (button.style) {
          button.style.setProperty('--background-scale', '0.97');
        }
        timers.push(
          setTimeout(() => {
            if (
              button &&
              button.classList &&
              !button.classList.contains('active') &&
              button.style
            ) {
              button.style.setProperty('--background-scale', '1');
            }
          }, 150),
        );
      };

      const handleClick = async (e) => {
        e.preventDefault();
        if (button.classList.contains('active')) {
          return;
        }

        await addToCart();

        button.classList.add('active');

        // Background scale
        button.style.setProperty('--background-scale', '0.97');
        timers.push(
          setTimeout(() => {
            button.style.setProperty('--background-scale', '1');
          }, 275),
        );

        // Morph animation
        const morphPath = button.querySelector('.morph path');
        if (morphPath) {
          timers.push(
            setTimeout(() => {
              const path = button.querySelector('.morph path');
              if (path) {
                path.style.transition = 'd 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                path.setAttribute(
                  'd',
                  'M0 12C6 12 20 10 32 0C43.9024 9.99999 58 12 64 12V13H0V12Z',
                );
              }
            }, 0),
          );
          timers.push(
            setTimeout(() => {
              const path = button.querySelector('.morph path');
              if (path) {
                path.style.transition = 'd 0.15s ease-in';
                path.setAttribute('d', 'M0 12C6 12 17 12 32 12C47.9024 12 58 12 64 12V13H0V12Z');
              }
            }, 250),
          );
        }

        // Package animation
        timers.push(
          setTimeout(() => {
            if (!button) return;
            button.style.setProperty('--package-scale', '1');
            button.style.setProperty('--package-y', '-42px');
            button.style.setProperty('--cart-x', '0px');
            button.style.setProperty('--cart-scale', '1');
          }, 200),
        );

        timers.push(
          setTimeout(() => {
            if (button) button.style.setProperty('--package-y', '-40px');
          }, 550),
        );

        timers.push(
          setTimeout(() => {
            if (!button) return;
            button.style.setProperty('--package-y', '16px');
            button.style.setProperty('--package-scale', '0.9');
          }, 850),
        );

        timers.push(
          setTimeout(() => {
            if (button) button.style.setProperty('--package-scale', '0');
          }, 1100),
        );

        // Package second reveal
        timers.push(
          setTimeout(() => {
            if (button) button.style.setProperty('--package-second-y', '0px');
          }, 985),
        );

        // Text fade
        if (button) button.style.setProperty('--text-o', '0');

        // Cart animation
        timers.push(
          setTimeout(() => {
            if (!button) return;
            button.style.setProperty('--cart-clip', '12px');
            button.style.setProperty('--cart-clip-x', '3px');
          }, 1050),
        );

        timers.push(
          setTimeout(() => {
            if (button) button.style.setProperty('--cart-y', '2px');
          }, 1110),
        );

        timers.push(
          setTimeout(() => {
            if (!button) return;
            button.style.setProperty('--cart-tick-offset', '0px');
            button.style.setProperty('--cart-y', '0px');
          }, 1210),
        );

        timers.push(
          setTimeout(() => {
            if (!button) return;
            button.style.setProperty('--cart-x', '52px');
            button.style.setProperty('--cart-rotate', '-15deg');
          }, 1410),
        );

        timers.push(
          setTimeout(() => {
            if (!button) return;
            button.style.setProperty('--cart-x', '104px');
            button.style.setProperty('--cart-rotate', '0deg');
            button.style.overflow = 'hidden';
          }, 1610),
        );

        timers.push(
          setTimeout(() => {
            const cart = button.querySelector('.cart');
            if (!cart) return;
            cart.style.transition = 'none';

            button.style.setProperty('--cart-opacity', '0');
            button.style.setProperty('--text-o', '0');
            button.style.setProperty('--text-x', '0px');
            button.style.setProperty('--cart-x', compact ? '-90px' : '-104px');
            button.style.setProperty('--cart-rotate', '0deg');
            button.style.setProperty('--cart-scale', '0.75');
            button.style.setProperty('--package-y', '-16px');
            button.style.setProperty('--package-scale', '0');
            button.style.setProperty('--package-second-y', '24px');
            button.style.setProperty('--cart-clip', '0px');
            button.style.setProperty('--cart-clip-x', '0px');
            button.style.setProperty('--cart-tick-offset', '10px');
            button.style.setProperty('--background-scale', '1');

            void cart.offsetHeight;

            cart.style.transition = '';
          }, 1810),
        );

        timers.push(
          setTimeout(() => {
            const resetCartX = compact ? '-38px' : '-48px';
            const resetTextX = compact ? '6px' : '12px';

            button.style.setProperty('--cart-opacity', '1');
            button.style.setProperty('--cart-x', resetCartX);
            button.style.setProperty('--text-o', '1');
            button.style.setProperty('--text-x', resetTextX);
            button.style.overflow = '';
            button.classList.remove('active');

            if (onAnimationComplete) onAnimationComplete();
          }, 1820),
        );
      };

      button.addEventListener('pointerdown', handlePointerDown);
      button.addEventListener('click', handleClick);

      return () => {
        // Cancel all pending animation timers on cleanup
        timers.forEach((id) => clearTimeout(id));
        button.removeEventListener('pointerdown', handlePointerDown);
        button.removeEventListener('click', handleClick);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variantId, quantity, onSuccess, onError]);

    return (
      <div className={`jarbris-add-to-cart-container ${compact ? 'compact' : ''}`}>
        <button className={`add-to-cart ${compact ? 'jarbris-add-to-cart-btn' : ''}`} ref={buttonRef}>
          <span>{t('product.add_to_cart_chip')}</span>
          <svg className="morph" viewBox="0 0 64 13">
            <path d="M0 12C6 12 17 12 32 12C47.9024 12 58 12 64 12V13H0V12Z" />
          </svg>
          <div className="package">
            <svg className="first" viewBox="0 0 24 24">
              <path d="M5 3L5 20L19 20L19 3L5 3Z" />
              <rect x="4" y="10" width="16" height="2" />
              <rect x="11" y="3" width="2" height="17" />
            </svg>
            <svg className="second" viewBox="0 0 24 24">
              <path d="M5 3L5 20L19 20L19 3L5 3Z" />
              <rect x="4" y="10" width="16" height="2" />
              <rect x="11" y="3" width="2" height="17" />
            </svg>
          </div>
          <div className="cart">
            <svg viewBox="0 0 36 26">
              <path d="M1 2.5H6L10 18.5H25.5L28.5 7.5L7.5 7.5" className="shape" />
              <path
                d="M11.5 25C12.6046 25 13.5 24.1046 13.5 23C13.5 21.8954 12.6046 21 11.5 21C10.3954 21 9.5 21.8954 9.5 23C9.5 24.1046 10.3954 25 11.5 25Z"
                className="wheel"
              />
              <path
                d="M24 25C25.1046 25 26 24.1046 26 23C26 21.8954 25.1046 21 24 21C22.8954 21 22 21.8954 22 23C22 24.1046 22.8954 25 24 25Z"
                className="wheel"
              />
              <path d="M14.5 13.5L16.5 15.5L21.5 10.5" className="tick" />
            </svg>
          </div>
        </button>
      </div>
    );
  },
);

export default AddToCartButton;
