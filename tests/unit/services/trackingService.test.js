import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// WIDGET-ORPHAN — pins the event payload contract built by trackingService._buildPayload, the single
// point in the widget that sets `source`. The orphan case (no sessionId, no anonId) must send
// source:'widget' (the API ingest Zod enum accepts only that) — NOT 'widget_orphan', which was
// rejected with 400 and dropped the whole batch. Also covers the consent gate, the consent-exempt
// technical-event bypass (same builder → same source), the pre-context queue+flush, token forwarding,
// and query sanitization.
//
// _buildPayload/_send are private, so the contract is exercised through the public trackEvent. The
// fetch fallback path is forced (sendBeacon → false) so assertions can read the JSON body directly.

let track; // fresh module per test — module-level _context/_queue must not leak across tests
let mockFetch;

const lastFetchBody = () => JSON.parse(mockFetch.mock.calls.at(-1)[1].body);

beforeEach(async () => {
  vi.resetModules();
  mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', mockFetch);
  // Force the fetch fallback (sendBeacon would send a Blob) so we can assert on the JSON body.
  Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(() => false), configurable: true });
  // Default: analytics consent granted, so non-technical events are sent.
  window.JARBRIS_PRIVACY = { analyticsConsent: true };
  track = await import('../../../src/services/trackingService.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.JARBRIS_PRIVACY;
  localStorage.clear();
});

describe('source contract (WIDGET-ORPHAN)', () => {
  it('orphan (no sessionId, no anonId) sends source:"widget" with null identity, not "widget_orphan"', () => {
    track.setContext({ siteId: 'site_1', sessionId: null, visitorId: null });
    track.trackEvent('product_card_viewed', { productId: 'p1' });

    const body = lastFetchBody();
    expect(body.source).toBe('widget');
    expect(body.sessionId).toBeNull();
    expect(body.identity.anonId).toBeNull();
  });

  it('with a sessionId, anonId falls back to the sessionId', () => {
    track.setContext({ siteId: 'site_1', sessionId: 'sess_1' });
    track.trackEvent('product_card_viewed', {});
    expect(lastFetchBody().identity.anonId).toBe('sess_1');
  });

  it('prefers visitorId over sessionId for anonId', () => {
    track.setContext({ siteId: 'site_1', sessionId: 'sess_1', visitorId: 'vis_1' });
    track.trackEvent('product_card_viewed', {});
    expect(lastFetchBody().identity.anonId).toBe('vis_1');
  });

  it('wraps the event as { eventType, eventData } inside events[]', () => {
    track.setContext({ siteId: 'site_1', sessionId: 'sess_1' });
    track.trackEvent('add_to_cart_clicked', { productId: 'p1' });
    expect(lastFetchBody().events).toEqual([
      { eventType: 'add_to_cart_clicked', eventData: { productId: 'p1' } },
    ]);
  });
});

describe('consent gate', () => {
  it('drops a non-technical event when analytics consent is not granted', () => {
    window.JARBRIS_PRIVACY = { analyticsConsent: false };
    track.setContext({ siteId: 'site_1', sessionId: 'sess_1' });
    track.trackEvent('product_card_viewed', {});
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends a consent-exempt technical event without consent, via the same builder (source:"widget")', () => {
    window.JARBRIS_PRIVACY = { analyticsConsent: false };
    track.setContext({ siteId: 'site_1', sessionId: 'sess_1' });
    track.trackEvent('jarbris_session_started');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(lastFetchBody().source).toBe('widget');
  });
});

describe('pre-context queue', () => {
  it('queues an event fired before context is ready, then flushes it on setContext', () => {
    // No setContext yet — _context.siteId is null, so the event is buffered, not sent.
    track.trackEvent('product_card_viewed', { productId: 'p1' });
    expect(mockFetch).not.toHaveBeenCalled();

    track.setContext({ siteId: 'site_1', sessionId: 'sess_1' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(lastFetchBody().source).toBe('widget');
  });
});

describe('token forwarding', () => {
  it('forwards the widget token as a query param and X-Widget-Token header when set', () => {
    track.setContext({ siteId: 'site_1', sessionId: 'sess_1', widgetToken: 'wtok' });
    track.trackEvent('product_card_viewed', {});

    const [url, opts] = mockFetch.mock.calls.at(-1);
    expect(new URL(url).searchParams.get('token')).toBe('wtok');
    expect(opts.headers['X-Widget-Token']).toBe('wtok');
  });
});

describe('sanitizeQuery', () => {
  it('replaces emails and phone numbers and caps length', () => {
    expect(track.sanitizeQuery('email me at john@doe.com please')).toBe(
      'email me at [email] please',
    );
    expect(track.sanitizeQuery('call 1234567 now')).toBe('call [phone] now');
    expect(track.sanitizeQuery('x'.repeat(600))).toHaveLength(500);
  });

  it('returns "" for non-string input', () => {
    expect(track.sanitizeQuery(null)).toBe('');
    expect(track.sanitizeQuery(42)).toBe('');
  });
});
