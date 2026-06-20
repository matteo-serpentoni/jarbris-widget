/**
 * Privacy API Service
 *
 * Service layer for all widget → backend privacy consent API calls.
 * Follows state.md §2: API calls belong in service layer, not in components.
 *
 * @module services/privacyApi
 */

import { getWidgetToken } from './widgetTokenStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

/**
 * @deprecated getPrivacyPreferences removed in B22 refactor.
 * Consent state now arrives from the /api/chat/boot unified endpoint
 * and is passed to ProfileView as a prop via useChat.
 */

/**
 * Persist consent preference change to the backend.
 * Returns the updated consent object on success, throws on failure.
 *
 * @param {string} sessionId
 * @param {string} shopDomain
 * @param {string|null} anonId
 * @param {{ analytics: boolean }} preferences
 * @returns {Promise<{analytics: boolean, marketing: boolean, preferences: boolean, collectedAt: string}>}
 */
export async function updatePrivacyPreferences(sessionId, shopDomain, anonId, { analytics }) {
  const response = await fetch(`${API_BASE_URL}/api/chat/consent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': getWidgetToken(),
    },
    body: JSON.stringify({
      sessionId,
      shopDomain,
      anonId: anonId || null,
      analytics,
    }),
  });

  if (!response.ok) {
    throw new Error(`Consent update failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.consent;
}

/**
 * GDPR-03 — identity is now proven by a one-time code emailed to the address of record, NOT asserted
 * via sessionId/visitorId (those selectors were the IDOR vector and are gone from the API). The tenant
 * is resolved server-side from the widget token; the client sends only the email + code.
 *
 * Normalize a user-entered code to the canonical form the server hashed: the backend generates the
 * code as uppercase hex and matches the exact string, so we uppercase and strip whitespace. Hex is
 * case-insensitive to a human, but the stored hash is not — without this, a lowercased paste fails.
 *
 * @param {string} code
 * @returns {string}
 */
function normalizeCode(code) {
  return String(code || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/**
 * GDPR-03 step 1 — request a one-time verification code for the email of record (Art.15/Art.17 gate).
 * The API answers 200 identically for known and unknown emails by design (anti-enumeration), so a
 * resolved promise NEVER means the email exists. Throws `too_many_requests` on the per-IP limiter,
 * `request_failed` otherwise — callers surface a neutral message either way.
 *
 * @param {string} email
 * @param {string} [lng] - 2-char UI language, used to localize the email
 * @returns {Promise<void>}
 */
export async function requestPrivacyCode(email, lng) {
  const response = await fetch(`${API_BASE_URL}/api/privacy/verify/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': getWidgetToken(),
    },
    body: JSON.stringify({ email, ...(lng && { lng }) }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('too_many_requests');
    throw new Error('request_failed');
  }
}

/**
 * GDPR-03 step 2a — Art.15 export. Requires the verified one-time code. Triggers a JSON blob download
 * on success. A wrong/expired/missing/locked code returns 403 `verification_failed` (indistinguishable
 * by design — never leaks whether the email is a known customer).
 *
 * @param {string} email
 * @param {string} code
 * @returns {Promise<void>}
 */
export async function exportMyData(email, code) {
  const query = new URLSearchParams({ email, code: normalizeCode(code) });

  const response = await fetch(`${API_BASE_URL}/api/privacy/export?${query}`, {
    method: 'GET',
    headers: {
      'X-Widget-Token': getWidgetToken(),
    },
  });

  if (!response.ok) {
    if (response.status === 403) throw new Error('verification_failed');
    throw new Error(`Export failed with status ${response.status}`);
  }

  const data = await response.blob();
  const url = window.URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `privacy-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  window.URL.revokeObjectURL(url);
}

/**
 * GDPR-03 step 2b — Art.17 erasure. Requires the verified one-time code. Returns the erasure summary
 * on success. A wrong/expired/missing/locked code returns 403 `verification_failed`.
 *
 * @param {string} email
 * @param {string} code
 * @returns {Promise<{success: boolean, deletedEventsCount: number}>}
 */
export async function deleteMyData(email, code) {
  const response = await fetch(`${API_BASE_URL}/api/privacy/me`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': getWidgetToken(),
    },
    body: JSON.stringify({ email, code: normalizeCode(code) }),
  });

  if (!response.ok) {
    if (response.status === 403) throw new Error('verification_failed');
    throw new Error(`Erasure failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Update marketing email consent (opt-in/opt-out) for Jarbris.
 *
 * @param {string} sessionId
 * @param {string} shopDomain
 * @param {string|null} anonId
 * @param {{ marketing: boolean, consentTextVersion: string }} payload
 * @returns {Promise<{currentMarketingConsent: boolean|null, hasUnsubscribed: boolean}>}
 */
export async function updateMarketingConsent(
  sessionId,
  shopDomain,
  anonId,
  { marketing, consentTextVersion },
) {
  const response = await fetch(`${API_BASE_URL}/api/chat/marketing-consent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': getWidgetToken(),
    },
    body: JSON.stringify({
      sessionId,
      shopDomain,
      anonId: anonId || null,
      marketing,
      consentTextVersion: consentTextVersion || 'v1',
    }),
  });

  if (!response.ok) {
    throw new Error(`Marketing consent update failed with status ${response.status}`);
  }

  return response.json();
}
