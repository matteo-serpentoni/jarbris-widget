import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import storage from '../../../src/utils/storage';

// TEST-WIDGET — storage.clearSession() is the real implementation of security.md §3 ("on session
// expiry/rotation, all jarbris_* keys are removed except profile/consent"). It runs on the merchant's
// own domain, so it MUST (a) purge session state, (b) keep the user's profile + consent choice, and
// (c) NEVER touch keys that aren't ours (the storefront's own localStorage). This file also pins the
// fixed profile schema — in particular the three-state marketing-consent contract (true / false /
// null), where conflating "revoked" (false) with "unknown" (null) would be a GDPR bug.

const K = (name) => `jarbris_${name}`; // storage.js auto-prefixes; clearSession matches on this prefix

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('clearSession — purges session state (security.md §3)', () => {
  it('removes the session keys', () => {
    localStorage.setItem(K('session_id'), 's1');
    localStorage.setItem(K('messages'), '[]');
    localStorage.setItem(K('session_status'), 'active');
    localStorage.setItem(K('session_time'), '123');

    storage.clearSession();

    expect(localStorage.getItem(K('session_id'))).toBeNull();
    expect(localStorage.getItem(K('messages'))).toBeNull();
    expect(localStorage.getItem(K('session_status'))).toBeNull();
    expect(localStorage.getItem(K('session_time'))).toBeNull();
  });

  it('preserves the user profile and the analytics-consent choice', () => {
    localStorage.setItem(K('profile'), '{"email":"a@b.c"}');
    localStorage.setItem(K('analytics_consent'), 'true');
    localStorage.setItem(K('session_id'), 's1');

    storage.clearSession();

    expect(localStorage.getItem(K('profile'))).toBe('{"email":"a@b.c"}');
    expect(localStorage.getItem(K('analytics_consent'))).toBe('true');
    expect(localStorage.getItem(K('session_id'))).toBeNull(); // sanity: it actually ran
  });

  it('preserves the dev_* keys', () => {
    localStorage.setItem(K('dev_shop_domain'), 'shop.myshopify.com');
    localStorage.setItem(K('dev_lng_override'), 'it');
    localStorage.setItem(K('dev_show_storefront'), '1');
    localStorage.setItem(K('dev_storefront_theme'), 'dark');
    localStorage.setItem(K('session_id'), 's1');

    storage.clearSession();

    expect(localStorage.getItem(K('dev_shop_domain'))).toBe('shop.myshopify.com');
    expect(localStorage.getItem(K('dev_lng_override'))).toBe('it');
    expect(localStorage.getItem(K('dev_show_storefront'))).toBe('1');
    expect(localStorage.getItem(K('dev_storefront_theme'))).toBe('dark');
  });

  it('does not throw on an empty storage', () => {
    expect(() => storage.clearSession()).not.toThrow();
  });
});

describe('clearSession — isolation: never touches the merchant storefront localStorage (#4)', () => {
  it('leaves non-jarbris keys untouched', () => {
    // Realistic storefront keys that share the user's localStorage on the merchant domain.
    localStorage.setItem('cart', '{"items":3}');
    localStorage.setItem('shopify_y', 'tracking-value');
    localStorage.setItem('theme_currency', 'EUR');
    localStorage.setItem(K('session_id'), 's1'); // ours — should be purged

    storage.clearSession();

    expect(localStorage.getItem('cart')).toBe('{"items":3}');
    expect(localStorage.getItem('shopify_y')).toBe('tracking-value');
    expect(localStorage.getItem('theme_currency')).toBe('EUR');
    expect(localStorage.getItem(K('session_id'))).toBeNull(); // ours was purged
  });
});

describe('profile — three-state marketing consent (GDPR, #8)', () => {
  // true = consent given, false = consent REVOKED, null = unknown. Three DISTINCT states; collapsing
  // "revoked" into "unknown" (or vice-versa) is a GDPR bug. A set->get roundtrip must preserve each
  // one without conflation.
  it('roundtrips consent = true unchanged', () => {
    storage.setProfile({ email: 'a@b.c', currentMarketingConsent: true });
    expect(storage.getProfile().currentMarketingConsent).toBe(true);
  });

  it('roundtrips consent = false (REVOKED) without collapsing it to null', () => {
    storage.setProfile({ email: 'a@b.c', currentMarketingConsent: false });
    const consent = storage.getProfile().currentMarketingConsent;
    expect(consent).toBe(false);
    expect(consent).not.toBeNull(); // false is NOT null — revoked is NOT unknown
  });

  it('roundtrips consent = null (unknown) unchanged', () => {
    storage.setProfile({ email: 'a@b.c', currentMarketingConsent: null });
    expect(storage.getProfile().currentMarketingConsent).toBeNull();
  });

  it('keeps true / false / null mutually distinct across roundtrips, and defaults an omitted value to null (not false)', () => {
    storage.setProfile({ currentMarketingConsent: true });
    expect(storage.getProfile().currentMarketingConsent).toBe(true);

    storage.setProfile({ currentMarketingConsent: false });
    expect(storage.getProfile().currentMarketingConsent).toBe(false);

    storage.setProfile({ currentMarketingConsent: null });
    expect(storage.getProfile().currentMarketingConsent).toBeNull();

    // Omitted -> unknown (null), never silently "revoked" (false).
    storage.setProfile({ email: 'x@y.z' });
    expect(storage.getProfile().currentMarketingConsent).toBeNull();
  });
});

describe('profile — fixed-schema normalization', () => {
  it('fills defaults and coerces booleans, returning the full fixed shape', () => {
    storage.setProfile({ name: 'Ada', email: 'ada@x.io' });
    expect(storage.getProfile()).toEqual({
      name: 'Ada',
      email: 'ada@x.io',
      isIdentified: false,
      currentMarketingConsent: null,
      hasUnsubscribed: false,
    });
  });

  it('returns null when no profile is stored', () => {
    expect(storage.getProfile()).toBeNull();
  });
});

describe('safe reads', () => {
  it('getJSON returns null on malformed JSON instead of throwing', () => {
    localStorage.setItem(K('messages'), '{not valid json');
    expect(storage.getJSON('messages')).toBeNull();
  });

  it('get returns null for a missing key', () => {
    expect(storage.get('nope')).toBeNull();
  });
});
