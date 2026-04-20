import { useI18n } from '../../hooks/useI18n';
import './ChatHeader.css';

/**
 * ChatHeader
 * Unified header component used in both Chat and ChatPreview.
 */
const ChatHeader = ({ connectionStatus = 'online' }) => {
  const t = useI18n();

  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'offline':
        return { text: t('connection.offline'), class: 'status-offline' };
      case 'reconnecting':
        return { text: t('connection.reconnecting'), class: 'status-reconnecting' };
      case 'online':
      default:
        return { text: t('connection.online'), class: 'status-online' };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="chat-mobile-header">
      <div className="header-content">
        <h3>Jarbris</h3>
        <div className="online-status">
          <span className={`status-dot ${config.class}`}></span>
          <span className="status-text">{config.text}</span>
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;
