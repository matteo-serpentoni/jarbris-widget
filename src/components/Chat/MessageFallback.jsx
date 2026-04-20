import { useI18n } from '../../hooks/useI18n';
import MessageBubble from './MessageBubble';

/**
 * MessageFallback
 * Discreet fallback UI for a single failed chat message.
 * Reuses the standard MessageBubble for consistency.
 */
const MessageFallback = () => {
  const t = useI18n();

  return (
    <MessageBubble sender="ai" className="fallback-message" timestamp={null}>
      <div
        className="message-content"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
      >
        <span style={{ fontSize: '14px', opacity: 0.6 }}>⚠️</span>
        <span style={{ opacity: 0.6 }}>{t('ui.cannot_display')}</span>
      </div>
    </MessageBubble>
  );
};

export default MessageFallback;
