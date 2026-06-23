import { describe, it, expect, vi, beforeEach } from 'vitest';

// TEST-WIDGET — Tier-1 (security/token). widgetTokenStore holds the widget auth token that every API
// service injects into the X-Widget-Token header. The contract that matters is the `token || ''`
// normalization: a null/undefined token must collapse to '' — never the literal 'null'/'undefined',
// which would otherwise be sent as a bogus credential.

let store;

beforeEach(async () => {
  vi.resetModules(); // module-level _widgetToken must not leak across tests
  store = await import('../../../src/services/widgetTokenStore.js');
});

describe('widgetTokenStore', () => {
  it('returns "" before any token is set', () => {
    expect(store.getWidgetToken()).toBe('');
  });

  it('round-trips a token through set/get', () => {
    store.setWidgetToken('wtok_123');
    expect(store.getWidgetToken()).toBe('wtok_123');
  });

  it('normalizes a null/undefined token to "" (never a literal "null"/"undefined")', () => {
    store.setWidgetToken('wtok_123');
    store.setWidgetToken(null);
    expect(store.getWidgetToken()).toBe('');

    store.setWidgetToken(undefined);
    expect(store.getWidgetToken()).toBe('');
  });

  it('overwrites the previous token on a second set', () => {
    store.setWidgetToken('a');
    store.setWidgetToken('b');
    expect(store.getWidgetToken()).toBe('b');
  });
});
