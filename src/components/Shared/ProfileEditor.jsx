import React, { useState, useEffect, useRef } from 'react';
import { updateProfile } from '../../services/chatApi';
import {
  updatePrivacyPreferences,
  exportMyData,
  deleteMyData,
  updateMarketingConsent,
} from '../../services/privacyApi';
import { getBootConsent, broadcastConsentChange, rollbackConsent } from '../../utils/consentBridge';
import storage from '../../utils/storage';
import { LockIcon } from '../UI/Icons';
import { validateEmail } from '../../utils/validators';
import ConfirmDialog from '../UI/ConfirmDialog';
import UpsellModal from '../UI/UpsellModal';
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
  // Helper to compute initial marketing consent toggle state.
  // ON only if there is an explicit valid consent — never ON by default.
  // Priority: Jarbris currentMarketingConsent > hasUnsubscribed audit flag > Shopify/PersonConsent fallback
  // NOTE: defined before useState so it can be used as a lazy initializer.
  const computeInitialMarketingConsent = (prof, cons) => {
    if (prof?.currentMarketingConsent === true) return true;
    if (prof?.currentMarketingConsent === false) return false;
    if (prof?.hasUnsubscribed === true) return false;
    // null = no Jarbris choice yet — fall back to Shopify/PersonConsent consent
    if (cons?.marketing === true) return true;
    // No valid consent found — default OFF (safe)
    return false;
  };

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

  // Marketing Consent States
  const [hasUnsubscribed, setHasUnsubscribed] = useState(!!initialProfile?.hasUnsubscribed);
  // Initialized eagerly from initialProfile — avoids the false → true animation on re-mount
  const [marketingConsent, setMarketingConsent] = useState(() =>
    computeInitialMarketingConsent(initialProfile, initialConsent),
  );
  const [marketingSaving, setMarketingSaving] = useState(false);
  const [marketingError, setMarketingError] = useState(null);
  const [showResubscribeConfirm, setShowResubscribeConfirm] = useState(false);

  // Upsell modal: shown after profile save if any toggle is inactive
  const [showUpsellBanner, setShowUpsellBanner] = useState(false);

  useEffect(() => {
    if (initialProfile?.name && !name) setName(initialProfile.name);
    if (initialProfile?.email && !email) setEmail(initialProfile.email);
    if (initialProfile?.isIdentified && !isIdentified) setIsIdentified(true);
  }, [initialProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync consent toggle when boot data arrives after mount
  useEffect(() => {
    if (initialConsent?.analytics !== undefined) {
      setAnalyticsConsent(initialConsent.analytics);
    }
  }, [initialConsent?.analytics]);

  useEffect(() => {
    if (initialProfile) {
      setHasUnsubscribed(!!initialProfile.hasUnsubscribed);
      setMarketingConsent(computeInitialMarketingConsent(initialProfile, initialConsent));
    }
  }, [initialProfile, initialConsent]);

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

      // Reset button label back to "Aggiorna Profilo" after 2s
      setTimeout(() => setMessage(null), 2000);

      // Show upsell banner if any toggle is inactive — keep user on profile, skip auto-redirect
      const needsUpsell = !analyticsConsent || !marketingConsent;
      if (needsUpsell) {
        setShowUpsellBanner(true);
      } else {
        setTimeout(() => {
          onSuccess?.();
        }, 1500);
      }
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
      // Pass email as Art.11 GDPR fallback identifier in case lastSessionId is stale
      await deleteMyData(sessionId, shopDomain, visitorId, email);
      storage.removeProfile();

      setName('');
      setEmail('');
      setIsIdentified(false);
      setAnalyticsConsent(false);
      setMarketingConsent(false);
      setHasUnsubscribed(false);
      onProfileUpdate?.(null);

      setMessage({ type: 'success', text: t('profile.deleted') });

      // After a short delay, reset button to initial state so the user can re-enter data
      setTimeout(() => {
        setMessage(null);
        setSaving(false);
      }, 2500);
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

      // Persist to local storage so re-mount reads the correct value
      const stored = storage.getProfile();
      if (stored) {
        const updated = { ...stored, analyticsConsent: newValue };
        storage.setProfile(updated);
        onProfileUpdate?.(updated);
      }
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

  // Marketing Consent Handlers
  const executeMarketingToggle = async (newValue) => {
    // Guard: email required to enable marketing communications
    if (newValue === true && (!email || !isIdentified)) {
      setMarketingError(t('profile.error_marketing_no_email'));
      setTimeout(() => setMarketingError(null), 3500);
      return;
    }

    const previousValue = marketingConsent;

    setMarketingConsent(newValue);
    setMarketingError(null);
    setMarketingSaving(true);

    try {
      const result = await updateMarketingConsent(sessionId, shopDomain, visitorId, {
        marketing: newValue,
        consentTextVersion: 'v1',
      });

      const resolvedValue =
        typeof result.currentMarketingConsent === 'boolean'
          ? result.currentMarketingConsent
          : newValue;

      setMarketingConsent(resolvedValue);
      setHasUnsubscribed(!!result.hasUnsubscribed);

      // Persist to local storage so re-mount (e.g. chat → profile navigation) reads the correct value
      const stored = storage.getProfile();
      if (stored) {
        const updated = {
          ...stored,
          currentMarketingConsent: resolvedValue,
          hasUnsubscribed: !!result.hasUnsubscribed,
        };
        storage.setProfile(updated);
        onProfileUpdate?.(updated);
      }
    } catch {
      setMarketingConsent(previousValue);
      setMarketingError(t('profile.error_privacy'));
      setTimeout(() => setMarketingError(null), 3000);
    } finally {
      setMarketingSaving(false);
    }
  };

  const handleMarketingToggleClick = () => {
    if (marketingSaving) return;

    if (marketingConsent === true) {
      executeMarketingToggle(false);
    } else {
      if (hasUnsubscribed) {
        setShowResubscribeConfirm(true);
      } else {
        executeMarketingToggle(true);
      }
    }
  };

  const confirmResubscribe = () => {
    setShowResubscribeConfirm(false);
    executeMarketingToggle(true);
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
              isIdentified && mode === 'drawer' ? 'compact' : 'full'
            } ${message ? (message.type === 'success' ? 'success' : 'error') : ''}`}
          >
            {message
              ? message.text
              : saving
                ? t('profile.saving')
                : isIdentified
                  ? t('profile.update_profile')
                  : t('profile.save_profile')}
          </button>

          {isIdentified && mode === 'drawer' && (
            <>
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
            </>
          )}
        </div>

        <div className="profile-editor-privacy">
          <div className="profile-editor-privacy-header">
            <LockIcon />
            <span>{t('profile.privacy_section')}</span>
          </div>

          {/* Analytics Consent Toggle */}
          <div className="profile-editor-privacy-row">
            <div className="profile-editor-privacy-label-wrapper">
              <p className="profile-editor-privacy-title">{t('profile.privacy_title')}</p>
              <p className="profile-editor-privacy-desc">{t('profile.privacy_desc')}</p>
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

          {/* Marketing Consent Toggle */}
          <div className="profile-editor-privacy-row" style={{ marginTop: '12px' }}>
            <div className="profile-editor-privacy-label-wrapper">
              <p className="profile-editor-privacy-title">{t('profile.marketing_title')}</p>
              <p className="profile-editor-privacy-desc">{t('profile.marketing_desc')}</p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={marketingConsent}
              aria-label={t('profile.marketing_toggle_label') || 'Comunicazioni e offerte'}
              disabled={marketingSaving}
              onClick={handleMarketingToggleClick}
              className={`profile-editor-privacy-toggle ${marketingConsent ? 'on' : ''} ${marketingSaving ? 'saving' : ''}`}
            >
              <span className="profile-editor-privacy-thumb" />
            </button>
          </div>

          {marketingError && (
            <p className="profile-editor-privacy-error" role="alert">
              {marketingError}
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

      <ConfirmDialog
        isOpen={showResubscribeConfirm}
        title={t('profile.confirm_resubscribe_title')}
        message={t('profile.confirm_resubscribe_message')}
        confirmText={t('profile.confirm_resubscribe_confirm')}
        cancelText={t('profile.confirm_cancel')}
        onConfirm={confirmResubscribe}
        onCancel={() => setShowResubscribeConfirm(false)}
      />

      <UpsellModal
        isOpen={showUpsellBanner}
        title={t('profile.upsell_title')}
        desc={t('profile.upsell_desc')}
        showAnalytics={!analyticsConsent}
        analyticsTitle={t('profile.upsell_analytics_title')}
        analyticsDesc={t('profile.upsell_analytics_desc')}
        showMarketing={!marketingConsent}
        marketingTitle={t('profile.upsell_marketing_title')}
        marketingDesc={t('profile.upsell_marketing_desc')}
        enableLabel={t('profile.upsell_enable')}
        closeLabel={t('profile.upsell_dismiss')}
        accentColor={colors.header}
        onEnableAnalytics={() => executePrivacyToggle(true)}
        onEnableMarketing={() => executeMarketingToggle(true)}
        onClose={() => {
          setShowUpsellBanner(false);
          onSuccess?.();
        }}
      />
    </>
  );
};

export default ProfileEditor;
