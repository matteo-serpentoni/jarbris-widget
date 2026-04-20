import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import MessageBubble from './MessageBubble';
import { t } from '../../i18n';
import './HumanThinking.css';

/** Pick a random phrase for the given intent from the locale bundle */
const pickPhrase = (intent) => {
  const key = intent?.toLowerCase().replace('_action', '') || 'default';
  const intentKey = {
    product_search: 'product_search',
    product_detail: 'product_detail',
    order_track: 'order_track',
    faq: 'faq',
    shipping: 'shipping',
    refund: 'refund',
    escalation: 'escalation',
  }[key] || 'default';
  const phrases = t(`thinking.${intentKey}`);
  const list = Array.isArray(phrases) ? phrases : t('thinking.default');
  return list[Math.floor(Math.random() * list.length)];
};

/**
 * HumanThinking
 * A more "human" alternative to simple typing dots.
 * Slides in from the left, shows a random phrase, and slides back.
 */
const HumanThinking = ({ chatColors, intent }) => {
  const phrase = useMemo(() => pickPhrase(intent), [intent]);

  return (
    <div className="human-thinking-container">
      <MessageBubble sender="assistant" type="thinking" chatColors={chatColors}>
        <div className="thinking-content">
          <span className="thinking-text">{phrase}</span>
          <div className="thinking-dots-mini">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      </MessageBubble>
    </div>
  );
};

export default HumanThinking;
