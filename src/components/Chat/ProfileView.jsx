import React from 'react';
import ProfileEditor from '../Shared/ProfileEditor';
import { BackArrowIcon } from '../UI/Icons';
import { useI18n } from '../../hooks/useI18n';
import './ProfileView.css';

const ProfileView = ({
  onBack,
  sessionId,
  shopDomain,
  visitorId,
  profile,
  consent,
  onProfileUpdate,
  requiresReConsent,
  colors = {
    header: '#667eea',
    sendButton: '#667eea',
    inputFocus: '#4CC2E9',
  },
}) => {
  const t = useI18n();
  const isIdentified = !!profile?.isIdentified;

  return (
    <div
      className="profile-view"
      style={{
        '--profile-header-color': colors.header,
        '--profile-send-button-color': colors.sendButton,
      }}
    >
      <div className="profile-header">
        <button onClick={onBack} className="back-button">
          <BackArrowIcon size={18} />
        </button>
        <h3 className="profile-title">{t('profile.title')}</h3>
      </div>

      <p className="profile-description">
        {requiresReConsent && (
          <span className="profile-reconsent-inline-alert">
            {t('profile.reconsent_alert')}
          </span>
        )}
        {isIdentified
          ? t('profile.description_identified')
          : t('profile.description_anonymous')}
      </p>

      <ProfileEditor
        sessionId={sessionId}
        shopDomain={shopDomain}
        visitorId={visitorId}
        profile={profile}
        consent={consent}
        onProfileUpdate={onProfileUpdate}
        onSuccess={onBack}
        colors={colors}
        mode="drawer"
      />
    </div>
  );
};

export default ProfileView;
