import React, { useState, useEffect, useRef } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../../hooks/useI18n';
import { getSnapshot } from '../../i18n';
import { validateEmail } from '../../utils/validators';
import { requestPrivacyCode, exportMyData, deleteMyData } from '../../services/privacyApi';
import './PrivacyVerifyFlow.css';

const RESEND_COOLDOWN_S = 60; // mirrors the server-side 1/60s per-email throttle (silent on the API)
const SUCCESS_CLOSE_MS = 2200;

/**
 * GDPR-03 self-service privacy flow (Art.15 export / Art.17 erasure).
 *
 * Identity is proven by a one-time code emailed to the address of record — NOT by the session. The
 * flow is two steps: request a code for an email, then enter the code to run the action. Copy is
 * deliberately anti-enumeration: it NEVER confirms whether an email is a known customer (the API
 * answers identically for known/unknown, and a wrong/expired/locked code is an indistinguishable
 * 403). A subject with no mailbox to verify (pure-anonymous) simply never receives a code and is
 * guided to contact the store — no scary error.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {'export'|'delete'} props.action
 * @param {string} [props.initialEmail] - prefilled when the widget already knows the user's email
 * @param {string} [props.accentColor]
 * @param {() => void} props.onClose
 * @param {() => void} [props.onErased] - called after a successful erasure so the parent can reset
 */
const PrivacyVerifyFlow = ({
  isOpen,
  action,
  initialEmail = '',
  accentColor = '#667eea',
  onClose,
  onErased,
}) => {
  const t = useI18n();
  const isDelete = action === 'delete';

  const [step, setStep] = useState('request'); // 'request' | 'code'
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  const cooldownTimerRef = useRef(null);
  const closeTimerRef = useRef(null);

  const clearTimers = () => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    cooldownTimerRef.current = null;
    closeTimerRef.current = null;
  };

  // Reset to a clean state each time the flow OPENS, seeding the email from initialEmail then.
  // Intentionally keyed on isOpen only: a successful erasure clears the parent's email (initialEmail
  // -> ''), and we must not let that re-run the reset and wipe the in-flight success/"done" state.
  useEffect(() => {
    if (!isOpen) return;
    setStep('request');
    setEmail(initialEmail);
    setCode('');
    setBusy(false);
    setError(null);
    setDone(null);
    setCooldown(0);
    return clearTimers;
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => clearTimers, []);

  // Escape closes the dialog (parity with ConfirmDialog, which this flow replaces for these actions).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_S);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t('profile.error_email_required'));
      return;
    }
    if (!validateEmail(trimmed)) {
      setError(t('profile.error_email_invalid'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await requestPrivacyCode(trimmed, getSnapshot());
      setStep('code');
      startCooldown();
    } catch (err) {
      // Anti-enumeration: any failure is generic. 429 is the only one worth a distinct (still neutral)
      // hint so the user knows to wait rather than retype.
      setError(
        err?.message === 'too_many_requests'
          ? t('profile.verify_throttled')
          : t('profile.verify_error_generic'),
      );
    } finally {
      setBusy(false);
    }
  };

  const performAction = async () => {
    if (!code.trim()) return;

    setBusy(true);
    setError(null);
    try {
      if (isDelete) {
        await deleteMyData(email.trim(), code);
        onErased?.();
        setDone(t('profile.deleted'));
      } else {
        await exportMyData(email.trim(), code);
        setDone(t('profile.downloaded'));
      }
      closeTimerRef.current = setTimeout(() => onClose?.(), SUCCESS_CLOSE_MS);
    } catch {
      // 403 verification_failed and any other failure both surface as the neutral "code not valid"
      // message — the UI must never reveal whether the email is a known customer.
      setError(t('profile.verify_failed'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeEmail = () => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = null;
    setStep('request');
    setCode('');
    setError(null);
    setCooldown(0);
  };

  const handleCodeChange = (e) => {
    // Normalize live to the canonical form the server hashed: uppercase hex, max 10 chars.
    const next = e.target.value
      .replace(/[^0-9a-fA-F]/g, '')
      .toUpperCase()
      .slice(0, 10);
    setCode(next);
  };

  const title = isDelete ? t('profile.verify_delete_title') : t('profile.download_data');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="privacy-verify-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="privacy-verify-panel"
            style={{ '--privacy-accent': accentColor }}
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <h4 className="privacy-verify-title">{title}</h4>

            {done ? (
              <p className="privacy-verify-done" role="status">
                {done}
              </p>
            ) : step === 'request' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy) sendCode();
                }}
              >
                <p className="privacy-verify-text">
                  {isDelete ? t('profile.verify_delete_intro') : t('profile.verify_export_intro')}
                </p>
                {isDelete && (
                  <p className="privacy-verify-warning">{t('profile.confirm_delete_message')}</p>
                )}

                <label className="privacy-verify-label" htmlFor="privacy-verify-email">
                  {t('profile.email_label')}
                </label>
                <input
                  id="privacy-verify-email"
                  type="email"
                  className="privacy-verify-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mario@email.com"
                  autoComplete="email"
                  disabled={busy}
                />

                {error && (
                  <p className="privacy-verify-error" role="alert">
                    {error}
                  </p>
                )}

                <div className="privacy-verify-actions">
                  <button
                    type="button"
                    className="privacy-verify-btn ghost"
                    onClick={onClose}
                    disabled={busy}
                  >
                    {t('profile.confirm_cancel')}
                  </button>
                  <button type="submit" className="privacy-verify-btn primary" disabled={busy}>
                    {busy ? t('profile.verify_sending') : t('profile.verify_send_code')}
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy) performAction();
                }}
              >
                <p className="privacy-verify-text">
                  {t('profile.verify_code_sent', { email: email.trim() })}
                </p>

                <label className="privacy-verify-label" htmlFor="privacy-verify-code">
                  {t('profile.verify_code_label')}
                </label>
                <input
                  id="privacy-verify-code"
                  type="text"
                  className="privacy-verify-input code"
                  value={code}
                  onChange={handleCodeChange}
                  placeholder={t('profile.verify_code_placeholder')}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  maxLength={10}
                  disabled={busy}
                />

                {error && (
                  <p className="privacy-verify-error" role="alert">
                    {error}
                  </p>
                )}

                <p className="privacy-verify-help">{t('profile.verify_help')}</p>

                <div className="privacy-verify-actions">
                  <button
                    type="button"
                    className="privacy-verify-btn ghost"
                    onClick={handleChangeEmail}
                    disabled={busy}
                  >
                    {t('profile.verify_change_email')}
                  </button>
                  <button
                    type="submit"
                    className={`privacy-verify-btn ${isDelete ? 'danger' : 'primary'}`}
                    disabled={busy || !code.trim()}
                  >
                    {busy
                      ? t('profile.verify_verifying')
                      : isDelete
                        ? t('profile.verify_confirm_delete')
                        : t('profile.verify_confirm_export')}
                  </button>
                </div>

                <button
                  type="button"
                  className="privacy-verify-resend"
                  onClick={sendCode}
                  disabled={busy || cooldown > 0}
                >
                  {cooldown > 0
                    ? t('profile.verify_resend_in', { seconds: cooldown })
                    : t('profile.verify_resend')}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PrivacyVerifyFlow;
