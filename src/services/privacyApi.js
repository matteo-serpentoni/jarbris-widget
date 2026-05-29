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
 * Request data export under Art 15 GDPR.
 * Triggers a JSON blob download on success.
 *
 * @param {string} sessionId
 * @param {string} shopDomain
 * @param {string|null} anonId
 * @returns {Promise<void>}
 */
export async function exportMyData(sessionId, shopDomain, anonId) {
  const query = new URLSearchParams({
    sessionId,
    shopDomain,
    ...(anonId && { visitorId: anonId }),
  });

  const response = await fetch(`${API_BASE_URL}/api/privacy/export?${query}`, {
    method: 'GET',
    headers: {
      'X-Widget-Token': getWidgetToken(),
    },
  });

  if (!response.ok) {
    if (response.status === 403 || response.status === 409) {
      throw new Error(`identity_verification_required`);
    }
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
 * Request data erasure under Art 17 GDPR.
 *
 * @param {string} sessionId
 * @param {string} shopDomain
 * @param {string|null} anonId
 * @param {string|null} email - Art. 11 fallback identifier when sessionId is stale
 * @returns {Promise<void>}
 */
export async function deleteMyData(sessionId, shopDomain, anonId, email = null) {
  const response = await fetch(`${API_BASE_URL}/api/privacy/me`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Token': getWidgetToken(),
    },
    body: JSON.stringify({
      sessionId,
      shopDomain,
      visitorId: anonId || null,
      email: email || null,
    }),
  });

  if (!response.ok) {
    if (response.status === 403 || response.status === 409) {
      throw new Error(`identity_verification_required`);
    }
    throw new Error(`Erasure failed with status ${response.status}`);
  }
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
