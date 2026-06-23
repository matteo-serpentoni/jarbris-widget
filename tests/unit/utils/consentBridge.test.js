import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// TEST-WIDGET — Tier-1 (security/consent). consentBridge is the single gate the tracker consults
// before any analytics tracking (security.md §3: no tracking without opt-in). The behaviour that
// matters: canTrackAnalytics precedence (an explicit window.JARBRIS_PRIVACY value wins over the
// localStorage boot value), and that broadcast/rollback keep the three channels (localStorage, window
// global, CustomEvent) consistent — with rollback deliberately NOT re-emitting the event.

import {
  getBootConsent,
  canTrackAnalytics,
  broadcastConsentChange,
  rollbackConsent,
} from '../../../src/utils/consentBridge.js';

const BOOT_KEY = 'jarbris_analytics_consent'; // storage.js auto-prefixes 'analytics_consent'
const EVENT = 'jarbris:analytics-consent-changed';

beforeEach(() => {
  localStorage.clear();
  delete window.JARBRIS_PRIVACY;
});

afterEach(() => {
  localStorage.clear();
  delete window.JARBRIS_PRIVACY;
  vi.restoreAllMocks();
});

describe('getBootConsent', () => {
  it('is true only when the boot localStorage value is exactly "true"', () => {
    expect(getBootConsent()).toBe(false); // missing
    localStorage.setItem(BOOT_KEY, 'false');
    expect(getBootConsent()).toBe(false);
    localStorage.setItem(BOOT_KEY, 'true');
    expect(getBootConsent()).toBe(true);
  });
});

describe('canTrackAnalytics — precedence', () => {
  it('honors window.JARBRIS_PRIVACY === true over a "false" boot value', () => {
    localStorage.setItem(BOOT_KEY, 'false');
    window.JARBRIS_PRIVACY = { analyticsConsent: true };
    expect(canTrackAnalytics()).toBe(true);
  });

  it('honors window.JARBRIS_PRIVACY === false over a "true" boot value', () => {
    localStorage.setItem(BOOT_KEY, 'true');
    window.JARBRIS_PRIVACY = { analyticsConsent: false };
    expect(canTrackAnalytics()).toBe(false);
  });

  it('falls back to the boot value when window.JARBRIS_PRIVACY is absent', () => {
    localStorage.setItem(BOOT_KEY, 'true');
    expect(canTrackAnalytics()).toBe(true);
    localStorage.setItem(BOOT_KEY, 'false');
    expect(canTrackAnalytics()).toBe(false);
  });
});

describe('broadcastConsentChange', () => {
  it('writes all three channels: localStorage, window global, and the CustomEvent', () => {
    const listener = vi.fn();
    window.addEventListener(EVENT, listener);
    try {
      broadcastConsentChange(true);
    } finally {
      window.removeEventListener(EVENT, listener);
    }

    expect(localStorage.getItem(BOOT_KEY)).toBe('true');
    expect(window.JARBRIS_PRIVACY).toEqual({ analyticsConsent: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ analyticsConsent: true });
  });

  it('persists the opt-out value too', () => {
    broadcastConsentChange(false);
    expect(localStorage.getItem(BOOT_KEY)).toBe('false');
    expect(window.JARBRIS_PRIVACY).toEqual({ analyticsConsent: false });
  });
});

describe('rollbackConsent', () => {
  it('restores both channels WITHOUT re-emitting the CustomEvent', () => {
    const listener = vi.fn();
    window.addEventListener(EVENT, listener);
    try {
      rollbackConsent(false);
    } finally {
      window.removeEventListener(EVENT, listener);
    }

    expect(localStorage.getItem(BOOT_KEY)).toBe('false');
    expect(window.JARBRIS_PRIVACY).toEqual({ analyticsConsent: false });
    expect(listener).not.toHaveBeenCalled();
  });
});
