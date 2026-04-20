import React, { useState, useCallback, useMemo } from 'react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { AnimatePresence, motion } from 'framer-motion';
import ProfileEditor from '../Shared/ProfileEditor';
import { UserIcon, ChevronDownIcon } from '../UI/Icons';
import { useI18n } from '../../hooks/useI18n';
import './ProfileCardMessage.css';

const ProfileCardMessage = ({
  message,
  chatColors,
  isLastMessage,
  // Props to pass down to ProfileEditor
  sessionId,
  shopDomain,
  visitorId,
  bootProfile,
  bootConsent,
  handleProfileUpdate,
}) => {
  const t = useI18n();
  // It's expanded by default if it's the last message
  const [isExpanded, setIsExpanded] = useState(isLastMessage);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Derive effective expanded state: auto-collapse when user continues chatting
  // (isLastMessage becomes false) unless the user has manually toggled the card.
  const effectiveExpanded = useMemo(
    () => (hasInteracted ? isExpanded : isLastMessage && isExpanded),
    [hasInteracted, isExpanded, isLastMessage],
  );

  const toggleExpand = useCallback(() => {
    setHasInteracted(true);
    setIsExpanded((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleExpand();
      }
    },
    [toggleExpand],
  );

  // Use the text provided by the backend, or fallback
  const title = t('profile_card.title');
  const text = message.text || t('profile_card.fallback');

  return (
    <div className="jarbris-profile-card-message">
      <div className="jarbris-profile-card-inner">
        <div
          className="jarbris-profile-card-header"
          onClick={toggleExpand}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          aria-expanded={effectiveExpanded}
          aria-label={effectiveExpanded ? t('profile_card.aria_collapse') : t('profile_card.aria_expand')}
        >
          <div className="jarbris-profile-card-icon" style={{ color: 'rgba(255, 255, 255, 0.35)' }}>
            <UserIcon size={18} />
          </div>
          <div className="jarbris-profile-card-text">
            <h4 className="jarbris-profile-card-title">{title}</h4>
            <p className="jarbris-profile-card-subtitle">{text}</p>
          </div>
          <div className={`jarbris-profile-card-toggle ${effectiveExpanded ? 'open' : ''}`}>
            <ChevronDownIcon size={20} />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {effectiveExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <div className="jarbris-profile-card-body">
                <ProfileEditor
                  sessionId={sessionId}
                  shopDomain={shopDomain}
                  visitorId={visitorId}
                  profile={bootProfile}
                  consent={bootConsent}
                  onProfileUpdate={handleProfileUpdate}
                  onSuccess={() => {
                    // Automatically collapse when user successfully saves their profile inline
                    setTimeout(() => setIsExpanded(false), 500);
                  }}
                  colors={chatColors}
                  mode="inline"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ProfileCardMessage;
