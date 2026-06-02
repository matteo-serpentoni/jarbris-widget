/**
 * Consent Bridge
 *
 * Central utility for widget <-> storefront tracker consent synchronization.
 * Single point of truth for all consent state operations in the widget.
 *
 * Architecture (per Phase 3 plan):
 *   A) Event-driven: dispatches 'jarbris:analytics-consent-changed' CustomEvent
 *      for instant reactivity in the storefront tracker.
 *   B) Global state: writes window.JARBRIS_PRIVACY for boot-time polling.
 *   C) localStorage: ephemeral fast-boot layer for pre-API UI initialization.
 *
 * GDPR note: 'jarbris_analytics_consent' is explicitly permitted in widget
 * security rules §3 because it stores the user's CHOICE to not be tracked,
 * not tracking data itself. It is strictly necessary for honoring the opt-out
 * across page reloads.
 *
 * @module utils/consentBridge
 */

import storage from './storage';

/**
 * Read the boot-time consent value from localStorage.
 * Used for immediate UI initialization before the backend responds.
 * Falls back to false on any read error (Safari private mode, storage quota, etc.)
 *
 * @returns {boolean}
 */
export function getBootConsent() {
  return storage.get('analytics_consent') === 'true';
}

/**
 * Check if analytics tracking is currently permitted.
 * Checks window.JARBRIS_PRIVACY first (set after backend sync),
 * then falls back to the localStorage boot value.
 *
 * This is the gating function to call before any tracking operation.
 *
 * @returns {boolean}
 */
export function canTrackAnalytics() {
  if (window.JARBRIS_PRIVACY?.analyticsConsent === true) return true;
  if (window.JARBRIS_PRIVACY?.analyticsConsent === false) return false;
  return getBootConsent();
}

/**
 * Persist a consent change locally and broadcast it to the storefront tracker.
 * Call this AFTER a successful backend API response.
 *
 * @param {boolean} analyticsConsent
 */
export function broadcastConsentChange(analyticsConsent) {
  // C: localStorage (fast boot on next page load)
  storage.set('analytics_consent', String(analyticsConsent));

  // B: Global in-memory state (for tracker boot-time polling)
  window.JARBRIS_PRIVACY = { analyticsConsent };

  // A: CustomEvent (for instant reactivity in jarbris-tracker.js)
  window.dispatchEvent(
    new CustomEvent('jarbris:analytics-consent-changed', {
      detail: { analyticsConsent },
    }),
  );
}

/**
 * Roll back a consent change after an API failure.
 * Restores both localStorage and window.JARBRIS_PRIVACY to the previous value.
 * Does NOT dispatch a CustomEvent — the UI component handles its own rollback.
 *
 * @param {boolean} previousValue
 */
export function rollbackConsent(previousValue) {
  storage.set('analytics_consent', String(previousValue));
  window.JARBRIS_PRIVACY = { analyticsConsent: previousValue };
}

/**
 * @deprecated getAnonId removed in B22 refactor.
 * The visitor ID now comes from the parent frame via postMessage (visitorId),
 * not from the iframe's own localStorage. This eliminates the cross-origin
 * isolation issue where Safari ITP would block 3rd-party localStorage.
 *
 * Components that need the visitor ID should receive it via props from useChat.
 */
