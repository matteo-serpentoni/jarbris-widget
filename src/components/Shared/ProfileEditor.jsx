import React, { useState, useEffect, useRef } from 'react';
import { updateProfile } from '../../services/chatApi';
import { updatePrivacyPreferences, exportMyData, deleteMyData } from '../../services/privacyApi';
import { getBootConsent, broadcastConsentChange, rollbackConsent } from '../../utils/consentBridge';
import storage from '../../utils/storage';
import { LockIcon } from '../UI/Icons';
import { validateEmail } from '../../utils/validators';
import ConfirmDialog from '../UI/ConfirmDialog';
import { useI18n } from '../../hooks/useI18n';
import './ProfileEditor.css';

const ProfileEditor = ({
  sessionId,
  shopDomain,
  visitorId,
  profile: initialProfile,
  consent: initialConsent,
  onProfileUpdate,
  onSuccess,
  colors = {
    header: '#667eea',
    sendButton: '#667eea',
  },
  mode = 'drawer', // 'drawer' | 'inline'
}) => {
  const t = useI18n();
  const [name, setName] = useState(initialProfile?.name || '');
  const [email, setEmail] = useState(initialProfile?.email || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [isIdentified, setIsIdentified] = useState(!!initialProfile?.isIdentified);
  const [showConfirm, setShowConfirm] = useState(false);

  const [analyticsConsent, setAnalyticsConsent] = useState(
    initialConsent?.analytics ?? getBootConsent(),
  );
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyError, setPrivacyError] = useState(null);
  const [showPrivacyConfirm, setShowPrivacyConfirm] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const privacyErrorTimerRef = useRef(null);

  useEffect(() => {
    if (initialProfile?.name && !name) setName(initialProfile.name);
    if (initialProfile?.email && !email) setEmail(initialProfile.email);
    if (initialProfile?.isIdentified && !isIdentified) setIsIdentified(true);
  }, [initialProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (privacyErrorTimerRef.current) clearTimeout(privacyErrorTimerRef.current);
    };
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({ type: 'error', text: t('profile.error_email_required') });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!validateEmail(email)) {
      setMessage({ type: 'error', text: t('profile.error_email_invalid') });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const result = await updateProfile(sessionId, shopDomain, {
        name,
        email,
        visitorId,
      });

      const serverProfile = result.customer || { name, email, isIdentified: true };
      storage.setProfile(serverProfile);

      if (serverProfile.name !== undefined) setName(serverProfile.name);
      if (serverProfile.email) setEmail(serverProfile.email);
      setIsIdentified(!!serverProfile.isIdentified);

      if (result.consent && typeof result.consent.analytics === 'boolean') {
        setAnalyticsConsent(result.consent.analytics);
        broadcastConsentChange(result.consent.analytics);
      }

      onProfileUpdate?.(serverProfile);

      setSaving(false);
      setMessage({ type: 'success', text: t('profile.saved') });

      setTimeout(() => {
        onSuccess?.();
      }, 1500);
    } catch {
      setSaving(false);
      setMessage({ type: 'error', text: t('profile.error_save') });
      setTimeout(() => {
        setMessage(null);
      }, 3000);
    }
  };

  const handleReset = async () => {
    setShowConfirm(false);
    setSaving(true);
    setMessage({ type: 'success', text: t('profile.deleting') });

    try {
      await deleteMyData(sessionId, shopDomain, visitorId);
      storage.removeProfile(); // Clear local storage containing profile/identity

      setName('');
      setEmail('');
      setIsIdentified(false);
      onProfileUpdate?.(null);

      setMessage({ type: 'success', text: t('profile.deleted') });

      // Force an immediate reload to ensure ghost state is wiped and a clean boot is triggered
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      setSaving(false);
      if (err.message.includes('identity_verification_required')) {
        setMessage({ type: 'error', text: t('profile.error_identity') });
      } else {
        setMessage({ type: 'error', text: t('profile.error_reset') });
      }
      setTimeout(() => setMessage(null), 3500);
    }
  };

  const handleExport = async () => {
    setShowExportConfirm(false);
    setSaving(true);
    setMessage({ type: 'success', text: t('profile.download_started') });

    try {
      await exportMyData(sessionId, shopDomain, visitorId);
      setMessage({ type: 'success', text: t('profile.downloaded') });
    } catch (err) {
      if (err.message.includes('identity_verification_required')) {
        setMessage({ type: 'error', text: t('profile.error_export_identity') });
      } else {
        setMessage({ type: 'error', text: t('profile.error_export') });
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const executePrivacyToggle = async (newValue) => {
    const previousValue = analyticsConsent;

    setAnalyticsConsent(newValue);
    setPrivacyError(null);
    setPrivacySaving(true);
    broadcastConsentChange(newValue);

    try {
      await updatePrivacyPreferences(sessionId, shopDomain, visitorId, { analytics: newValue });
    } catch {
      setAnalyticsConsent(previousValue);
      rollbackConsent(previousValue);
      setPrivacyError(t('profile.error_privacy'));

      if (privacyErrorTimerRef.current) clearTimeout(privacyErrorTimerRef.current);
      privacyErrorTimerRef.current = setTimeout(() => {
        setPrivacyError(null);
      }, 3000);
    } finally {
      setPrivacySaving(false);
    }
  };

  const handlePrivacyToggleClick = () => {
    if (privacySaving) return;

    if (analyticsConsent === true) {
      setShowPrivacyConfirm(true);
    } else {
      executePrivacyToggle(true);
    }
  };

  const confirmPrivacyRevocation = () => {
    setShowPrivacyConfirm(false);
    executePrivacyToggle(false);
  };

  return (
    <>
      <form
        onSubmit={handleSave}
        className={`profile-editor-form profile-editor-${mode}`}
        style={{ '--profile-header-color': colors.header }}
      >
        <div className="profile-editor-field email">
          <label className="profile-editor-label">{t('profile.email_label')}</label>
          <input
            type="email"
            className="profile-editor-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="mario@email.com"
          />
        </div>

        <div className="profile-editor-field">
          <label className="profile-editor-label">{t('profile.name_label')}</label>
          <input
            type="text"
            className="profile-editor-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mario Rossi"
          />
        </div>

        <div className="profile-editor-actions">
          <button
            type="submit"
            disabled={saving || message}
            className={`profile-editor-btn-save ${
              message ? (message.type === 'success' ? 'success' : 'error') : ''
            }`}
          >
            {message
              ? message.text
              : saving
                ? t('profile.saving')
                : isIdentified
                  ? t('profile.update_profile')
                  : t('profile.save_profile')}
          </button>
        </div>

        {isIdentified && !message && mode === 'drawer' && (
          <div className="profile-editor-gdpr-actions">
            <button
              type="button"
              onClick={() => setShowExportConfirm(true)}
              disabled={saving}
              className="profile-editor-btn-export"
            >
              {t('profile.download_data')}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={saving}
              className="profile-editor-btn-delete"
            >
              {t('profile.delete_profile')}
            </button>
          </div>
        )}

        <div className="profile-editor-privacy">
          <div className="profile-editor-privacy-header">
            <LockIcon />
            <span>{t('profile.privacy_section')}</span>
          </div>

          <div className="profile-editor-privacy-row">
            <div className="profile-editor-privacy-label-wrapper">
              <p className="profile-editor-privacy-title">{t('profile.privacy_title')}</p>
              <p className="profile-editor-privacy-desc">
                {t('profile.privacy_desc')}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={analyticsConsent}
              aria-label={t('profile.privacy_toggle_label')}
              disabled={privacySaving}
              onClick={handlePrivacyToggleClick}
              className={`profile-editor-privacy-toggle ${analyticsConsent ? 'on' : ''} ${privacySaving ? 'saving' : ''}`}
            >
              <span className="profile-editor-privacy-thumb" />
            </button>
          </div>

          {privacyError && (
            <p className="profile-editor-privacy-error" role="alert">
              {privacyError}
            </p>
          )}
        </div>
      </form>
      <ConfirmDialog
        isOpen={showPrivacyConfirm}
        title={t('profile.confirm_privacy_title')}
        message={t('profile.confirm_privacy_message')}
        confirmText={t('profile.confirm_privacy_confirm')}
        cancelText={t('profile.confirm_cancel')}
        onConfirm={confirmPrivacyRevocation}
        onCancel={() => setShowPrivacyConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showExportConfirm}
        title={t('profile.confirm_export_title')}
        message={t('profile.confirm_export_message')}
        confirmText={t('profile.confirm_export_confirm')}
        cancelText={t('profile.confirm_cancel')}
        onConfirm={handleExport}
        onCancel={() => setShowExportConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showConfirm}
        title={t('profile.confirm_delete_title')}
        message={t('profile.confirm_delete_message')}
        confirmText={t('profile.confirm_delete_confirm')}
        cancelText={t('profile.confirm_cancel')}
        onConfirm={handleReset}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
};

export default ProfileEditor;
