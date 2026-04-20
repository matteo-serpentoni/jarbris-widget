import React, { memo } from 'react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion } from 'framer-motion';
import { getOrderStatusClass, normalizeOrderNumber } from '../../utils/shopifyUtils';
import { useI18n } from '../../hooks/useI18n';
import './OrderCards.css';

const OrderItemRow = memo(({ item, index, theme = 'dark' }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`jarbris-order-item-row ${theme}`}
    >
      <div className="jarbris-order-item-info">
        <div className="jarbris-order-item-title">{item.title}</div>
        {item.variantTitle && item.variantTitle !== 'Default Title' && (
          <div className="jarbris-order-item-variant">{item.variantTitle}</div>
        )}
      </div>
      <div className="jarbris-order-item-right">
        <div className="jarbris-order-item-quantity">x{item.quantity}</div>
        <div className="jarbris-order-item-price">{item.price}</div>
      </div>
    </motion.div>
  );
});

// Detail view for a single order
export const OrderDetailCard = memo(({ order, theme = 'dark' }) => {
  const t = useI18n();
  const { orderNumber, status, createdAt, total, items = [], tracking = [] } = order;

  const getStatusClass = (statusValue) => {
    return getOrderStatusClass(statusValue);
  };

  const statusLabel = status?.fulfillment || status;
  const paymentLabel = status?.financial;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`jarbris-order-detail-card ${theme}`}
    >
      {/* Header */}
      <div className="jarbris-order-detail-header">
        <div className="jarbris-order-detail-header-top">
          <div>
            <h4 className="jarbris-order-number">{`#${normalizeOrderNumber(orderNumber)}`}</h4>
            <p className="jarbris-order-date">{createdAt}</p>
          </div>
          <div className="jarbris-order-total-large">{total}</div>
        </div>

        <div className="jarbris-order-badges">
          {paymentLabel && (
            <span className={`jarbris-status-badge ${getStatusClass(paymentLabel)}`}>
              💳 {paymentLabel}
            </span>
          )}
          <span className={`jarbris-status-badge ${getStatusClass(statusLabel)}`}>
            📦 {statusLabel}
          </span>
          {tracking.length > 0 && (
            <a href={tracking[0].url} target="_blank" rel="noreferrer" className="jarbris-tracking-link">
              🚀 {t('order.track_package')}
            </a>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="jarbris-order-detail-items-container">
        <p className="jarbris-order-items-label">{t('order.items_label')} ({items.length})</p>
        <div>
          {items.map((item, idx) => (
            <OrderItemRow key={idx} item={item} index={idx} theme={theme} />
          ))}
        </div>
      </div>
    </motion.div>
  );
});

// Summary row for list view
const OrderListRow = memo(({ order, index, onClick }) => {
  const t = useI18n();
  const isClickable = !!onClick;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={isClickable ? () => onClick(order) : undefined}
      className={`jarbris-order-list-row ${isClickable ? 'clickable' : ''}`}
      whileHover={
        isClickable
          ? {
              background: 'rgba(255, 255, 255, 0.08)',
              scale: 1.01,
            }
          : {}
      }
      transition={{
        delay: index * 0.05,
        type: 'spring',
        stiffness: 400,
        damping: 25,
      }}
    >
      <div className="jarbris-order-list-row-info">
        <div className="jarbris-order-row-top">
          <span className="jarbris-order-row-number">
            {order.orderNumber ? `#${normalizeOrderNumber(order.orderNumber)}` : order.createdAt}
          </span>
          {order.orderNumber && <span className="jarbris-order-row-date">• {order.createdAt}</span>}
        </div>
        <div className="jarbris-order-row-status">
          {typeof order.status === 'object'
            ? order.status.fulfillment || t('order.in_processing')
            : order.status}
        </div>
      </div>
      <div className="jarbris-order-row-right">
        {order.total && <div className="jarbris-order-row-total">{order.total}</div>}
        {isClickable && <div className="jarbris-order-row-details-arrow">{t('order.details')} →</div>}
      </div>
    </motion.div>
  );
});

const OrderCards = memo(({ message, onOrderClick }) => {
  const t = useI18n();
  const {
    type: directType,
    orders: directOrders = [],
    order: directOrder,
    title: directTitle,
    message: directMessage,
    text: historicalText,
    email: directEmail,
    data = {},
  } = message;

  // Normalize data and type from potential history structure
  const orders = directOrders.length ? directOrders : data.orders || [];
  const order = directOrder || data.order;
  const title = directTitle || data.title;
  const email = directEmail || data.email;
  const finalDisplayMessage = directMessage || historicalText || data.message;
  const type = (directType || data.type || '').toLowerCase();

  // 1. Single Order Detail View
  if (
    type.includes('order_detail') ||
    (type.includes('order_cards') && orders.length === 1) ||
    (!orders.length && order)
  ) {
    const targetOrder = order || orders[0];
    if (!targetOrder) return null;

    const isClickable = !!targetOrder.orderNumber;

    return (
      <div className="jarbris-order-cards-container">
        {finalDisplayMessage && <p className="jarbris-order-detail-message">{finalDisplayMessage}</p>}
        <OrderListRow
          order={targetOrder}
          index={0}
          onClick={isClickable && onOrderClick ? () => onOrderClick(targetOrder, email) : null}
        />
      </div>
    );
  }

  // 2. Order List View (Minimal summaries, NOT clickable)
  return (
    <div className="jarbris-order-cards-container">
      <div className="jarbris-order-list-header">
        <div className="jarbris-order-list-icon">📦</div>
        <div>
          <h4 className="jarbris-order-list-title">{title || t('order.your_orders')}</h4>
          {email && <p className="jarbris-order-list-email">{email}</p>}
        </div>
      </div>

      {finalDisplayMessage && (
        <p className="jarbris-order-list-message">
          {String(finalDisplayMessage).replace('1 ordini', '1 ordine')}
        </p>
      )}

      <div className="jarbris-order-list-items">
        {orders.map((o, idx) => (
          <OrderListRow key={o.id || idx} order={o} index={idx} />
        ))}
      </div>
    </div>
  );
});

export default OrderCards;
