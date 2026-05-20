/**
 * Tracking Service — Product Interaction Tracking V1
 *
 * Central event tracking service for the Jarbris widget.
 * Replaces inline fetch in useChat.trackWidgetEvent() with
 * sendBeacon (primary) + fetch keepalive (fallback).
 *
 * Rules:
 *   - All new fields inside eventData, never top-level scattered
 *   - productId = internal Jarbris productId, never Shopify GID
 *   - Consent gated via canTrackAnalytics() from consentBridge
 *   - Fail silently — never surface errors to UI
 *   - Never await — fire-and-forget only
 *
 * @module services/trackingService
 */

import { canTrackAnalytics } from '../utils/consentBridge.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const EVENTS_ENDPOINT = `${API_URL}/api/events`;

// Max payload size for sendBeacon (conservative limit)
const BEACON_MAX_BYTES = 50_000;

// Consent-exempt event types — always sent regardless of analytics consent.
// Mirrors TECHNICAL_EVENTS_WHITELIST from API privacyUtils.js.
const CONSENT_EXEMPT_EVENTS = new Set(['jarbris_session_started', 'privacy_consent_updated']);

// ── Context (set once by useChat when identity is ready) ──

let _context = {
  siteId: null,
  sessionId: null,
  visitorId: null,
  shopifyCustomerId: null,
  widgetToken: null,
};

/**
 * Set the tracking context. Called once by useChat when identity is ready.
 * Must be called before any trackEvent calls — events are silently dropped
 * if context is not set.
 *
 * @param {Object} ctx
 * @param {string} ctx.siteId
 * @param {string} ctx.sessionId
 * @param {string} [ctx.visitorId]
 * @param {string} [ctx.shopifyCustomerId]
 * @param {string} [ctx.widgetToken]
 */
export function setContext(ctx) {
  _context = { ..._context, ...ctx };
}

/**
 * Get the current tracking context (read-only copy).
 * Useful for hooks that need sessionId/searchId for dedup keys.
 *
 * @returns {Object}
 */
export function getContext() {
  return { ..._context };
}

// ── Query Sanitization ──

/**
 * Sanitize a user query before including it in tracking events.
 * Removes obvious PII patterns (emails, phone numbers), trims, and caps length.
 *
 * @param {string} q - Raw query string
 * @returns {string} Sanitized query
 */
export function sanitizeQuery(q) {
  if (!q || typeof q !== 'string') return '';
  let sanitized = q.trim().slice(0, 500);
  // Strip obvious email addresses
  sanitized = sanitized.replace(/\S+@\S+\.\S+/g, '[email]');
  // Strip obvious phone numbers (7-15 digit sequences)
  sanitized = sanitized.replace(/\b\d{7,15}\b/g, '[phone]');
  return sanitized;
}

// ── Transport ──

/**
 * Build the event payload envelope.
 *
 * @param {Array<Object>} events - Array of { eventType, eventData }
 * @returns {Object|null} Payload or null if context not ready
 */
function _buildPayload(events) {
  if (!_context.siteId || !_context.sessionId) return null;

  return {
    siteId: _context.siteId,
    sessionId: _context.sessionId,
    source: 'widget',
    identity: {
      anonId: _context.visitorId || _context.sessionId,
      shopifyCustomerId: _context.shopifyCustomerId || undefined,
    },
    events,
  };
}

/**
 * Send payload via sendBeacon (primary) or fetch keepalive (fallback).
 * Never throws. Never blocks.
 *
 * @param {Object} payload
 */
function _send(payload) {
  try {
    const body = JSON.stringify(payload);

    // sendBeacon: non-blocking, survives page unload
    if (navigator.sendBeacon && body.length < BEACON_MAX_BYTES) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(EVENTS_ENDPOINT, blob);
      if (sent) return;
      // sendBeacon rejected (queue full) — fallback to fetch
    }

    // Fallback: fetch with keepalive (non-blocking, survives page unload)
    fetch(EVENTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(_context.widgetToken ? { 'X-Widget-Token': _context.widgetToken } : {}),
      },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Fail silently — tracking must never crash the widget
  }
}

// ── Public API ──

/**
 * Track a single event. Consent-gated (analytics events require opt-in).
 * Fire-and-forget — never awaited, never throws.
 *
 * @param {string} eventType - One of the 14 V1 event types
 * @param {Object} [eventData={}] - All tracking fields inside this object
 */
export function trackEvent(eventType, eventData = {}) {
  try {
    // Consent gate: technical events bypass, analytics require opt-in
    const isTechnical = CONSENT_EXEMPT_EVENTS.has(eventType);
    if (!isTechnical && !canTrackAnalytics()) return;

    const payload = _buildPayload([{ eventType, eventData }]);
    if (!payload) return;

    _send(payload);
  } catch {
    // Fail silently
  }
}
