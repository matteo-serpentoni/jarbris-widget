import React, { memo } from 'react';
import PromoCard from './PromoCard';
import MessageBubble from '../Chat/MessageBubble';
import TextMessage from './TextMessage';
import './PromoCard.css';

const PromoCards = memo(({ message, onSearch, chatColors, sendFeedback }) => {
  const { promos = [] } = message;
  const displayMessage = message.message || message.text;
  const scrollRef = React.useRef(null);
  const [showLeftArrow, setShowLeftArrow] = React.useState(false);
  const [showRightArrow, setShowRightArrow] = React.useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      // Initial check
      checkScroll();
      // Handle resize
      window.addEventListener('resize', checkScroll);

      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [promos]);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const cardWidth = container.querySelector('.jarbris-promo-card')?.offsetWidth || 280;
      const gap = 12;
      const scrollAmount = direction === 'next' ? cardWidth + gap : -(cardWidth + gap);

      container.scrollBy({
        left: scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!Array.isArray(promos) || promos.length === 0) {
    return null;
  }

  return (
    <div className="jarbris-promos-container carousel">
      {displayMessage && (
        <MessageBubble
          sender={message.sender || 'assistant'}
          timestamp={message.timestamp}
          chatColors={chatColors}
          className="jarbris-promos-message-bubble"
          feedback={message.feedback}
          onFeedback={(type) => sendFeedback(message.id, type, message.text)}
          showFeedback={
            message.sender === 'assistant' && !message.error && !message.disableFeedback
          }
        >
          <TextMessage message={{ message: displayMessage }} />
        </MessageBubble>
      )}
      <div className="jarbris-carousel-wrapper">
        {showLeftArrow && (
          <button
            className="jarbris-carousel-nav-btn prev"
            onClick={() => scroll('prev')}
            aria-label="Promozione precedente"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        )}

        <div className="jarbris-promos-list" ref={scrollRef}>
          {promos.map((promo, index) => (
            <div key={`${message.id}-promo-${index}`} className="jarbris-promo-card-wrapper">
              <PromoCard promo={promo} onSearch={onSearch} index={index} />
            </div>
          ))}
        </div>

        {showRightArrow && promos.length > 1 && (
          <button
            className="jarbris-carousel-nav-btn next"
            onClick={() => scroll('next')}
            aria-label="Promozione successiva"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

export default PromoCards;
