import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../../hooks/useI18n';
import './MessageInput.css';

const MessageInput = ({
  onSendMessage,
  disabled: propDisabled,
  loading,
  placeholder,
  sendButtonColor = '#a259ff',
  inputBorderColor = '#a259ff',
  inputFocusColor = '#4CC2E9',
  previewMode = false,
  onProfileClick,
  connectionStatus = 'online',
}) => {
  const t = useI18n();
  const actualPlaceholder = placeholder || t('chat.input_placeholder');

  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  const isDisconnected = connectionStatus !== 'online';
  const disabled = propDisabled || loading || isDisconnected;

  // ✅ Auto-focus when loading/disabled state changes (e.g. AI finishes)
  useEffect(() => {
    if (!disabled && !previewMode) {
      inputRef.current?.focus();
    }
  }, [disabled, previewMode]);

  // ✅ Global Key Capture: focus input if user types while widget is active
  useEffect(() => {
    if (previewMode || isDisconnected) return;

    const handleGlobalKeyDown = (e) => {
      // Ignore if user is already in an input/textarea
      if (
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.isContentEditable
      ) {
        return;
      }

      // Ignore meta keys (Cmd, Ctrl, Alt)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Ignore functional keys (F1, Escape, etc.)
      if (e.key.length > 1 && e.key !== 'Backspace' && e.key !== 'Delete') return;

      // Focus and the browser will naturally pipe the character if focus happens immediately
      inputRef.current?.focus();
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [previewMode, isDisconnected]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const shouldShowButton = message.trim() && !loading && !disabled;

  return (
    <form
      onSubmit={handleSubmit}
      className={`message-input-container ${previewMode ? 'preview' : ''} ${
        isFocused ? 'focused' : ''
      } ${disabled ? 'disabled' : ''}`}
      style={{
        '--send-btn-color': sendButtonColor,
        '--input-border-color': inputBorderColor,
        '--input-focus-color': inputFocusColor,
      }}
    >
      <div className="input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder={
            connectionStatus === 'offline'
              ? t('errors.network') // Best fit for "Nessuna connessione..." although 'reconnecting' is different. We can use generic network error for UI brevity, or fallback
              : connectionStatus === 'reconnecting'
                ? t('errors.network')
                : actualPlaceholder
          }
          aria-label={t('ui.send_message')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => !previewMode && setIsFocused(true)}
          onBlur={() => !previewMode && setIsFocused(false)}
          disabled={disabled}
          autoFocus={!previewMode}
          maxLength={2000}
        />
        {shouldShowButton && (
          <button type="submit" aria-label={t('ui.send_message')} className="chat-send-btn">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 12h14M12 5l7 7-7 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {onProfileClick && !previewMode && (
        <button
          type="button"
          onClick={onProfileClick}
          title={t('ui.profile_button')}
          className="profile-btn profile-button-gradient-border"
        >
          <div className="profile-icon" />
        </button>
      )}
    </form>
  );
};

export default MessageInput;
