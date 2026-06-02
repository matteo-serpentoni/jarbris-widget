import { useRef, useEffect, useReducer, memo } from 'react';
import { extractVariantId } from '../../utils/shopifyUtils';
import FormattedText from './FormattedText';
import { BRIDGE_CONFIG, postToParent } from '../../config/bridge';
import './CartAction.css';

// Module-level dedup set — prevents re-executing the same cart action on re-render
const executedActions = new Set();
const MAX_EXECUTED = 50;

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADDING':
      return 'adding';
    case 'SUCCESS':
      return 'success';
    case 'ERROR':
      return 'error';
    case 'TIMEOUT':
      return state === 'adding' ? 'error' : state;
    default:
      return state;
  }
}

/**
 * CartAction — Auto-executes an add-to-cart action via the postMessage bridge.
 * Renders the appropriate message text based on the action outcome.
 *
 * @param {{ actionId: string, variantId: string, quantity: number, successMessage: string, errorMessage: string }} props
 */
const CartAction = memo(
  ({ actionId, variantId, quantity = 1, pendingMessage, successMessage, errorMessage }) => {
    const initialStatus = executedActions.has(actionId) ? 'success' : 'idle';
    const [status, dispatch] = useReducer(cartReducer, initialStatus);
    const isMounted = useRef(true);

    useEffect(() => {
      isMounted.current = true;
      return () => {
        isMounted.current = false;
      };
    }, []);

    useEffect(() => {
      if (!actionId || !variantId) return;

      // Idempotency guard — already handled via initial state
      if (executedActions.has(actionId)) return;

      dispatch({ type: 'ADDING' });

      const numericVariantId = extractVariantId(variantId);
      if (!numericVariantId) {
        dispatch({ type: 'ERROR' });
        return;
      }

      // Send add-to-cart via bridge
      postToParent({
        type: 'JARBRIS:addToCart',
        variantId: numericVariantId,
        quantity,
      });

      // Listen for response
      const handleResponse = (event) => {
        if (!BRIDGE_CONFIG.isValidOrigin(event.origin, null, event.data?.type)) return;
        if (event.data.type !== 'JARBRIS:addToCartResponse') return;

        window.removeEventListener('message', handleResponse);

        if (!isMounted.current) return;

        if (event.data.success) {
          // Cap dedup set
          if (executedActions.size >= MAX_EXECUTED) {
            const first = executedActions.values().next().value;
            executedActions.delete(first);
          }
          executedActions.add(actionId);
          dispatch({ type: 'SUCCESS' });
        } else {
          dispatch({ type: 'ERROR' });
        }
      };

      window.addEventListener('message', handleResponse);

      // Timeout after 8 seconds
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        if (isMounted.current) {
          dispatch({ type: 'TIMEOUT' });
        }
      }, 8000);

      return () => {
        clearTimeout(timeout);
        window.removeEventListener('message', handleResponse);
      };
    }, [actionId, variantId, quantity]);

    if (status === 'adding') {
      return (
        <div className="jarbris-cart-action jarbris-cart-action--adding">
          <div className="jarbris-cart-action__spinner" />
          <FormattedText text={pendingMessage} className="jarbris-cart-action__text" />
        </div>
      );
    }

    if (status === 'success') {
      return (
        <div className="jarbris-cart-action jarbris-cart-action--success">
          <FormattedText text={successMessage} className="jarbris-cart-action__text" />
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="jarbris-cart-action jarbris-cart-action--error">
          <FormattedText text={errorMessage} className="jarbris-cart-action__text" />
        </div>
      );
    }

    return null;
  },
);

export default CartAction;
