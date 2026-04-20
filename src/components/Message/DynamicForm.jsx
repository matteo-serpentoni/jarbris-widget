/* eslint-disable react-hooks/rules-of-hooks -- early return before hooks is intentional; conditions are stable across renders */
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion, AnimatePresence } from 'framer-motion';
import { validateEmail } from '../../utils/validators';
import { useI18n } from '../../hooks/useI18n';
import './DynamicForm.css';

/**
 * LookupResult Sub-component (Error/Not Found state)
 */
const LookupResult = ({ message, onRetry, loading }) => {
  const t = useI18n();
  return (
  <motion.div
    className="jarbris-order-lookup-results-text"
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.2 }}
  >
    <div className="jarbris-order-lookup-icon">🔍</div>
    <p className="jarbris-order-lookup-message">{message}</p>
    <button onClick={onRetry} className="jarbris-order-lookup-retry-btn" disabled={loading}>
      {loading ? <span className="jarbris-loader-small" /> : t('form.retry')}
    </button>
  </motion.div>
);};

// Navigation cache to survive component unmounts (capped to prevent unbounded growth)
const NAV_CACHE_MAX = 50;
const navCache = new Map();
const navCacheSet = (key, value) => {
  navCache.set(key, value);
  if (navCache.size > NAV_CACHE_MAX) {
    // Evict oldest entry (Maps iterate in insertion order)
    const oldest = navCache.keys().next().value;
    navCache.delete(oldest);
  }
};

const DynamicForm = ({ message, onSubmit, loading, children }) => {
  const t = useI18n();
  if (!message || (!message.config && !navCache.has(message.id))) {
    return null;
  }

  const { config, results, id: msgId } = message;

  // 1. Total State Persistence (restored from cache if available)
  const [navState, setNavState] = useState(() => {
    const cached = navCache.get(msgId);
    const initial = cached || {
      history: [],
      override: null,
      lastResultsStr: JSON.stringify(results),
      lastStoredState: null,
    };
    return initial;
  });

  const { history, override, lastResultsStr, lastStoredState } = navState;

  // Persist state to cache whenever it changes
  useEffect(() => {
    navCacheSet(msgId, navState);
  }, [msgId, navState]);

  // 2. Form Data State (synchronized with active config)
  const [formData, setFormData] = useState(() => {
    const initial = {};
    const initialConfig = results?.config || config;
    (initialConfig.fields || []).forEach((f) => {
      initial[f.id] = f.value || '';
    });
    return initial;
  });

  const [notes, setNotes] = useState('');
  const [errorVisible, setErrorVisible] = useState(null);

  // Ref-less logic: use current stringified results for comparison
  const currentResultsStr = JSON.stringify(results);

  // 3. Derived "Active" Configuration
  const activeConfig = (override ? override.config : results?.config || config) || {};

  const {
    formId = '',
    title = '',
    icon = '',
    steps = 1,
    currentStep = 1,
    fields = [],
    submitLabel = 'Continua',
    signalPrefix = 'FORM_SUBMIT',
    allowNotes = false,
    notesPlaceholder = 'Aggiungi dettagli...',
  } = activeConfig;

  const isErrorState = !!(
    results &&
    (results.results?.type === 'text' ||
      results.results?.message ||
      (results.type === 'text' && !results.config))
  );

  // 4. Synchronize state with incoming props
  useEffect(() => {
    // Handle Override Expiry: If server sends NEW data, we exit back-mode
    if (override) {
      if (currentResultsStr !== lastResultsStr) {
        setNavState((prev) => ({
          ...prev,
          override: null,
          lastResultsStr: currentResultsStr,
        }));
      }
      return;
    }

    // Normal progression tracking
    const isProgression =
      lastStoredState &&
      (lastStoredState.formId !== activeConfig.formId ||
        lastStoredState.currentStep < activeConfig.currentStep);

    if (isProgression) {
      setNavState((prev) => ({
        ...prev,
        history: [...prev.history, lastStoredState],
        lastResultsStr: currentResultsStr,
        lastStoredState: {
          formId: activeConfig.formId,
          currentStep: activeConfig.currentStep,
          config: activeConfig,
          formData,
          notes,
          isError: isErrorState,
        },
      }));
    } else {
      // Just sync current state without pushing history
      setNavState((prev) => ({
        ...prev,
        lastResultsStr: currentResultsStr,
        lastStoredState: {
          formId: activeConfig.formId,
          currentStep: activeConfig.currentStep,
          config: activeConfig,
          formData,
          notes,
          isError: isErrorState,
        },
      }));
    }

    if (isErrorState && history.length > 0) {
      setNavState((prev) => ({ ...prev, history: [] }));
    }

    // Sync form data fields
    const newInitial = {};
    fields.forEach((f) => {
      newInitial[f.id] = f.value || formData[f.id] || '';
    });
    setFormData(newInitial);
    setErrorVisible(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgId, activeConfig.formId, activeConfig.currentStep, currentResultsStr]);

  const handleBack = () => {
    if (history.length === 0) return;

    const prev = history[history.length - 1];

    const newState = {
      ...navState,
      history: history.slice(0, -1),
      override: prev,
      lastResultsStr: currentResultsStr,
      lastStoredState: prev,
    };

    navCacheSet(msgId, newState);
    setNavState(newState);

    setFormData(prev.formData);
    setNotes(prev.notes || '');
    setErrorVisible(null);
  };

  const handleInputChange = (id, value) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (loading) return;

    // Validation
    for (const field of fields) {
      if (field.required && !formData[field.id] && formData[field.id] !== 0) {
        setErrorVisible(t('form.field_required', { label: field.label }));
        return;
      }
      if (field.type === 'email' && formData[field.id] && !validateEmail(formData[field.id])) {
        setErrorVisible(t('profile.error_email_invalid'));
        return;
      }
    }

    const isOtherReason = formData.reasonId === 'other';
    if (isOtherReason && allowNotes && !notes.trim()) {
      setErrorVisible(t('form.notes_required'));
      return;
    }

    setErrorVisible(null);

    // Clear override on submit
    if (override) {
      setNavState((prev) => ({ ...prev, override: null }));
    }

    const values = fields.map((f) => {
      const val = formData[f.id];
      return typeof val === 'string' ? val.replace(/^#+/, '').trim() : val;
    });

    let signal = `${signalPrefix}:${values.join(':')}`;
    if (allowNotes && notes) {
      signal += `:${notes.trim()}`;
    }

    onSubmit(signal);
  };

  const renderField = (field) => {
    if (field.type === 'list_select') {
      return (
        <div key={field.id} className="jarbris-dynamic-list-container">
          {field.label && <div className="jarbris-dynamic-info-text">{field.label}</div>}
          <div
            className="jarbris-dynamic-list"
            role="listbox"
            aria-label={field.label || "Seleziona un'opzione"}
          >
            {field.options?.map((opt) => (
              <div
                key={opt.id}
                className={`jarbris-dynamic-list-option ${formData[field.id] === opt.id ? 'active' : ''} ${opt.disabled ? 'disabled' : ''}`}
                onClick={() => !opt.disabled && handleInputChange(field.id, opt.id)}
                role="option"
                aria-label={opt.title || opt.label}
                aria-selected={formData[field.id] === opt.id}
                tabIndex={opt.disabled ? -1 : 0}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !opt.disabled) {
                    e.preventDefault();
                    handleInputChange(field.id, opt.id);
                  }
                }}
              >
                <div className="jarbris-dynamic-radio">
                  {formData[field.id] === opt.id && <div className="jarbris-dynamic-radio-inner" />}
                </div>
                {opt.image && (
                  <div className="jarbris-dynamic-option-image">
                    <img src={opt.image} alt={opt.title || opt.label} loading="lazy" />
                  </div>
                )}
                <div className="jarbris-dynamic-option-content">
                  <div className="jarbris-dynamic-option-title">
                    {opt.title || opt.label}
                    {opt.returnStatus && (
                      <span className={`jarbris-return-status-badge status-${opt.returnStatus}`}>
                        {opt.returnStatus === 'pending'
                          ? 'Richiesta pendente'
                          : opt.returnStatus === 'approved'
                            ? 'Approvata'
                            : opt.returnStatus}
                      </span>
                    )}
                  </div>
                  {(opt.quantity || opt.price) && (
                    <div className="jarbris-dynamic-option-meta">
                      {opt.quantity && opt.quantity > 1 ? `${t('form.qty_pieces', { count: opt.quantity })} • ` : ''}
                      {opt.price}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <div key={field.id} className="jarbris-form-group">
          <label htmlFor={`field-${field.id}`}>{field.label}</label>
          <div className="jarbris-select-wrapper">
            <select
              id={`field-${field.id}`}
              value={formData[field.id]}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              disabled={loading}
              className="jarbris-dynamic-select"
            >
              <option value="" disabled>
                Seleziona un'opzione...
              </option>
              {field.options?.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.title || opt.label}
                </option>
              ))}
            </select>
            <div className="jarbris-select-arrow" aria-hidden="true" />
          </div>
        </div>
      );
    }

    return (
      <div key={field.id} className="jarbris-form-group">
        <label htmlFor={`field-${field.id}`}>{field.label}</label>
        <input
          id={`field-${field.id}`}
          type={field.type || 'text'}
          placeholder={field.placeholder}
          value={formData[field.id]}
          onChange={(e) => handleInputChange(field.id, e.target.value)}
          required={field.required}
          disabled={loading}
          autoComplete="off"
        />
      </div>
    );
  };

  return (
    <motion.div
      className="jarbris-dynamic-form"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="jarbris-dynamic-form-header">
        <span className="jarbris-dynamic-form-icon">{icon}</span>
        <h3 className="jarbris-dynamic-form-title">{title}</h3>
      </div>

      {steps > 1 && !children && !isErrorState && (
        <div className="jarbris-dynamic-progress-dots">
          {Array.from({ length: steps }).map((_, i) => {
            const s = i + 1;
            return (
              <div
                key={s}
                className={`jarbris-dynamic-step-dot ${
                  s === currentStep ? 'active' : s < currentStep ? 'completed' : 'future'
                }`}
              />
            );
          })}
        </div>
      )}

      <form onSubmit={handleSubmit} className="jarbris-dynamic-form-body">
        <AnimatePresence mode="wait">
          {children ? (
            <motion.div
              key="external-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          ) : isErrorState ? (
            <LookupResult
              key="error-state"
              message={
                results.results?.text ||
                results.results?.message ||
                results.text ||
                results.message ||
                t('form.generic_error')
              }
              onRetry={() => {
                const fallbackSignal = formId.startsWith('order')
                  ? 'Cerca ordine'
                  : `Voglio fare un ${formId.split('_')[0]}`;
                onSubmit(results.retrySignal || results.results?.retrySignal || fallbackSignal);
              }}
              loading={loading}
            />
          ) : (
            <motion.div
              key={`${formId}-${currentStep}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="jarbris-dynamic-step-wrapper"
            >
              <div className="jarbris-dynamic-fields-container">
                {fields.map(renderField)}

                {allowNotes && (
                  <div className="jarbris-form-group-notes">
                    <label>
                      {formData.reasonId === 'other'
                        ? t('form.required_details')
                        : t('form.optional_details')}
                    </label>
                    <textarea
                      className="jarbris-dynamic-textarea"
                      placeholder={
                        formData.reasonId === 'other' ? 'Descrivi il motivo...' : notesPlaceholder
                      }
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                )}
              </div>

              {errorVisible && <div className="jarbris-dynamic-error-message">{errorVisible}</div>}

              <div className="jarbris-dynamic-form-actions">
                {history.length > 0 && (
                  <button type="button" onClick={handleBack} className="jarbris-dynamic-form-back-btn" disabled={loading}>
                    {t('form.back')}
                  </button>
                )}
                <button type="submit" className="jarbris-dynamic-form-submit" disabled={loading}>
                  {loading ? <span className="jarbris-loader-small" /> : submitLabel || 'Continua'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </motion.div>
  );
};

export default DynamicForm;
