import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// GDPR-03 — Tier-1 (security/PII) coverage for the OTP self-service contract layer. Pins the wire
// contract, the code normalization, the error mapping and the anti-enumeration behaviour the e2e
// validated by hand, so a future widget refactor can't silently reopen the privacy surface.

vi.mock('../../../src/services/widgetTokenStore.js', () => ({
  getWidgetToken: () => 'test-widget-token',
}));

const { requestPrivacyCode, exportMyData, deleteMyData } =
  await import('../../../src/services/privacyApi.js');

let mockFetch;

const okJson = (data = {}) => ({ ok: true, status: 200, json: async () => data });
const okBlob = () => ({
  ok: true,
  status: 200,
  blob: async () => new Blob(['{}'], { type: 'application/json' }),
});
const fail = (status) => ({ ok: false, status });
const call = () => mockFetch.mock.calls[0];

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  // jsdom doesn't implement object URLs — the export download path needs them.
  window.URL.createObjectURL = vi.fn(() => 'blob:fake');
  window.URL.revokeObjectURL = vi.fn();
  // Silence jsdom's "navigation not implemented" when the download anchor is clicked; the click
  // itself is not what we assert (we assert the object-URL + download filename).
  vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requestPrivacyCode (step 1 — issue OTP)', () => {
  it('POSTs the email (+lng) to /api/privacy/verify/request with the widget token', async () => {
    mockFetch.mockResolvedValue(okJson());
    await requestPrivacyCode('user@example.com', 'it');
    const [url, opts] = call();
    expect(new URL(url).pathname).toBe('/api/privacy/verify/request');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Widget-Token']).toBe('test-widget-token');
    expect(JSON.parse(opts.body)).toEqual({ email: 'user@example.com', lng: 'it' });
  });

  it('omits lng from the body when not provided', async () => {
    mockFetch.mockResolvedValue(okJson());
    await requestPrivacyCode('user@example.com');
    expect(JSON.parse(call()[1].body)).toEqual({ email: 'user@example.com' });
  });

  it('resolves on 200 and reveals NOTHING about existence (anti-enumeration)', async () => {
    mockFetch.mockResolvedValue(okJson());
    await expect(requestPrivacyCode('maybe-a-customer@example.com')).resolves.toBeUndefined();
  });

  it('maps 429 → too_many_requests', async () => {
    mockFetch.mockResolvedValue(fail(429));
    await expect(requestPrivacyCode('user@example.com')).rejects.toThrow('too_many_requests');
  });

  it('maps any other non-ok → request_failed (no detail leaked)', async () => {
    mockFetch.mockResolvedValue(fail(500));
    await expect(requestPrivacyCode('user@example.com')).rejects.toThrow('request_failed');
  });
});

describe('exportMyData (step 2a — Art.15)', () => {
  it('GETs /api/privacy/export with email + normalized code and the widget token, then downloads', async () => {
    mockFetch.mockResolvedValue(okBlob());
    const createEl = vi.spyOn(document, 'createElement');
    await exportMyData('user@example.com', 'A1B2C3D4E5');

    const [url, opts] = call();
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/privacy/export');
    expect(parsed.searchParams.get('email')).toBe('user@example.com');
    expect(parsed.searchParams.get('code')).toBe('A1B2C3D4E5');
    expect(opts.method).toBe('GET');
    expect(opts.headers['X-Widget-Token']).toBe('test-widget-token');

    // download side-effect
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    const anchor = createEl.mock.results.map((r) => r.value).find((el) => el.tagName === 'A');
    expect(anchor.download).toMatch(/^privacy-export-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('normalizes the code (uppercase + strip whitespace) so a lowercased paste still matches', async () => {
    mockFetch.mockResolvedValue(okBlob());
    await exportMyData('user@example.com', ' a1b2 c3d4 e5 ');
    expect(new URL(call()[0]).searchParams.get('code')).toBe('A1B2C3D4E5');
  });

  it('maps 403 → verification_failed (wrong/expired/unknown indistinguishable)', async () => {
    mockFetch.mockResolvedValue(fail(403));
    await expect(exportMyData('user@example.com', 'WRONG')).rejects.toThrow('verification_failed');
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('maps any other non-ok → error with the status', async () => {
    mockFetch.mockResolvedValue(fail(500));
    await expect(exportMyData('user@example.com', 'X')).rejects.toThrow('500');
  });
});

describe('deleteMyData (step 2b — Art.17)', () => {
  it('DELETEs {email, normalizedCode} to /api/privacy/me and returns the erasure summary', async () => {
    mockFetch.mockResolvedValue(okJson({ success: true, deletedEventsCount: 3 }));
    const res = await deleteMyData('user@example.com', ' a1b2c3 ');

    const [url, opts] = call();
    expect(new URL(url).pathname).toBe('/api/privacy/me');
    expect(opts.method).toBe('DELETE');
    expect(opts.headers['X-Widget-Token']).toBe('test-widget-token');
    expect(JSON.parse(opts.body)).toEqual({ email: 'user@example.com', code: 'A1B2C3' });
    expect(res).toEqual({ success: true, deletedEventsCount: 3 });
  });

  it('maps 403 → verification_failed', async () => {
    mockFetch.mockResolvedValue(fail(403));
    await expect(deleteMyData('user@example.com', 'WRONG')).rejects.toThrow('verification_failed');
  });
});
