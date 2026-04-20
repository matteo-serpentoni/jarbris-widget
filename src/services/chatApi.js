import { getWidgetToken } from './widgetTokenStore';
import { getSnapshot } from '../i18n';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export class ChatApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
  }
}

export const sendMessage = async (
  message,
  sessionId,
  shopDomain,
  meta = {},
  clientMessageId = null,
) => {
  try {
    const headers = { 
      'Content-Type': 'application/json', 
      'X-Widget-Token': getWidgetToken(),
      'Accept-Language': getSnapshot()
    };

    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        sessionId,
        shopDomain,
        customer: meta.customer,
        meta: { lang: getSnapshot(), ...meta },
        clientMessageId,
        hidden: !!meta.hidden,
      }),
    });

    if (!response.ok) {
      // 🔥 Passa lo status all'errore per gestire 410
      throw new ChatApiError(`Server responded with status ${response.status}`, response.status);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof ChatApiError) {
      throw error;
    }
    throw new ChatApiError('Network error or server unavailable', 0);
  }
};

/**
 * B22: Unified boot endpoint — replaces getProfile (GET), getSessionStatus, getConsent (GET).
 * Returns session state, profile, consent, messages, and suggestions in one call.
 *
 * @param {string} sessionId - Current session ID (from parent)
 * @param {string} shopDomain - Shop domain
 * @param {string} visitorId - Persistent visitor ID (from parent)
 * @returns {Promise<object|null>}
 */
export const bootSession = async (sessionId, shopDomain, visitorId) => {
  try {
    const headers = { 
      'Content-Type': 'application/json', 
      'X-Widget-Token': getWidgetToken(),
      'Accept-Language': getSnapshot()
    };
    const params = new URLSearchParams();
    if (shopDomain) params.set('shopDomain', shopDomain);
    if (sessionId) params.set('sessionId', sessionId);
    if (visitorId) params.set('visitorId', visitorId);

    const response = await fetch(`${API_BASE_URL}/api/chat/boot?${params}`, { headers });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export const updateProfile = async (sessionId, shopDomain, data) => {
  const headers = { 
    'Content-Type': 'application/json', 
    'X-Widget-Token': getWidgetToken(),
    'Accept-Language': getSnapshot()
  };

  const response = await fetch(`${API_BASE_URL}/api/chat/profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId, shopDomain, ...data }),
  });

  if (!response.ok) throw new Error('Failed to update profile');
  return await response.json();
};

/**
 * submitFeedback
 * Sends user feedback (message rating) to the backend.
 */
export const submitFeedback = async (feedbackData) => {
  const headers = { 
    'Content-Type': 'application/json', 
    'X-Widget-Token': getWidgetToken(),
    'Accept-Language': getSnapshot()
  };
  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify(feedbackData),
  });

  if (!response.ok) throw new Error('Failed to submit feedback');
  return await response.json();
};
