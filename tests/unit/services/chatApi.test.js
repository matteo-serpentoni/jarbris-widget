import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// TEST-WIDGET — Tier-1 (security). Closes the widget's Tier-1 security service coverage (after
// privacyApi, widgetTokenStore, consentBridge). chatApi does NOT gate consent — it relays it inside
// the bootSession payload; the gate itself is consentBridge (already covered). The security-relevant
// contract here is: (1) token + language injection on every endpoint, (2) ChatApiError propagates the
// real status (410 = session gone) WITHOUT leaking the raw server error body to the consumer
// (security.md §5), and (3) bootSession is fail-soft (never throws — the widget boots even if the API
// is down).

vi.mock('../../../src/services/widgetTokenStore.js', () => ({
  getWidgetToken: () => 'test-widget-token',
}));
vi.mock('../../../src/i18n', () => ({
  getSnapshot: () => 'it',
}));

const { sendMessage, bootSession, updateProfile, submitFeedback, ChatApiError } =
  await import('../../../src/services/chatApi.js');

let mockFetch;
const okJson = (data = {}) => ({ ok: true, status: 200, json: async () => data });
const lastCall = () => mockFetch.mock.calls.at(-1);

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('token / language injection', () => {
  it('sendMessage injects the widget token and language headers on /api/chat', async () => {
    mockFetch.mockResolvedValue(okJson({ reply: 'hi' }));
    await sendMessage('hello', 's1', 'shop.myshopify.com');

    const [url, opts] = lastCall();
    expect(new URL(url).pathname).toBe('/api/chat');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Widget-Token']).toBe('test-widget-token');
    expect(opts.headers['Accept-Language']).toBe('it');
  });

  it('bootSession injects headers and uses GET on /api/chat/boot', async () => {
    mockFetch.mockResolvedValue(okJson({ session: {} }));
    await bootSession('s1', 'shop', 'v1');

    const [url, opts] = lastCall();
    expect(new URL(url).pathname).toBe('/api/chat/boot');
    expect(opts.method).toBeUndefined(); // GET — no method set
    expect(opts.headers['X-Widget-Token']).toBe('test-widget-token');
    expect(opts.headers['Accept-Language']).toBe('it');
  });
});

describe('sendMessage — request shape', () => {
  it('POSTs the expected body (meta.lang merge, hidden coercion, clientMessageId, customer)', async () => {
    mockFetch.mockResolvedValue(okJson({}));
    await sendMessage('hello', 's1', 'shop', { customer: { id: 'c1' }, hidden: 1 }, 'cm1');

    expect(JSON.parse(lastCall()[1].body)).toEqual({
      message: 'hello',
      sessionId: 's1',
      shopDomain: 'shop',
      customer: { id: 'c1' },
      meta: { lang: 'it', customer: { id: 'c1' }, hidden: 1 },
      clientMessageId: 'cm1',
      hidden: true,
    });
  });

  it('returns the parsed JSON on success', async () => {
    mockFetch.mockResolvedValue(okJson({ reply: 'ciao', sessionId: 's1' }));
    await expect(sendMessage('x', 's1', 'shop')).resolves.toEqual({
      reply: 'ciao',
      sessionId: 's1',
    });
  });
});

describe('sendMessage — error contract (security.md §5)', () => {
  it('throws ChatApiError carrying the real status on a non-ok response (e.g. 410)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 410, json: vi.fn(), text: vi.fn() });
    await expect(sendMessage('x', 's1', 'shop')).rejects.toMatchObject({
      name: 'ChatApiError',
      status: 410,
    });
  });

  it('does NOT leak the raw server error body to the consumer, and never reads it', async () => {
    const secret = 'INTERNAL: user 12345 token sk_live_abc stacktrace at db.js:42';
    const json = vi.fn().mockResolvedValue({ error: secret });
    const text = vi.fn().mockResolvedValue(secret);
    mockFetch.mockResolvedValue({ ok: false, status: 500, json, text });

    let caught;
    try {
      await sendMessage('x', 's1', 'shop');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ChatApiError);
    // Generic, status-only message — the server body is never interpolated in.
    expect(caught.message).toBe('Server responded with status 500');
    expect(caught.message).not.toContain('INTERNAL');
    expect(caught.message).not.toContain('sk_live_abc');
    expect(caught.status).toBe(500);
    // The error body is never even read, so it cannot leak downstream.
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it('wraps a network failure in a generic ChatApiError(status 0) without leaking the underlying error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:5001 secret-host-detail'));

    let caught;
    try {
      await sendMessage('x', 's1', 'shop');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ChatApiError);
    expect(caught.message).toBe('Network error or server unavailable');
    expect(caught.message).not.toContain('ECONNREFUSED');
    expect(caught.status).toBe(0);
  });
});

describe('bootSession — fail-soft contract', () => {
  it('builds the query string with only the provided params', async () => {
    mockFetch.mockResolvedValue(okJson({}));
    await bootSession('', 'shop.myshopify.com', ''); // only shopDomain provided

    const url = new URL(lastCall()[0]);
    expect(url.searchParams.get('shopDomain')).toBe('shop.myshopify.com');
    expect(url.searchParams.has('sessionId')).toBe(false);
    expect(url.searchParams.has('visitorId')).toBe(false);
  });

  it('returns the parsed JSON on success (the payload that carries consent/profile/session)', async () => {
    mockFetch.mockResolvedValue(okJson({ consent: { analytics: true }, session: { id: 's1' } }));
    await expect(bootSession('s1', 'shop', 'v1')).resolves.toEqual({
      consent: { analytics: true },
      session: { id: 's1' },
    });
  });

  it('returns null on a non-ok response instead of throwing (fail-soft boot)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: vi.fn() });
    await expect(bootSession('s1', 'shop', 'v1')).resolves.toBeNull();
  });

  it('returns null when the request throws (fail-soft boot)', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    await expect(bootSession('s1', 'shop', 'v1')).resolves.toBeNull();
  });
});

describe('updateProfile / submitFeedback — throw contract', () => {
  it('updateProfile throws on a non-ok response and returns JSON on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: vi.fn() });
    await expect(updateProfile('s1', 'shop', { name: 'x' })).rejects.toThrow(
      'Failed to update profile',
    );

    mockFetch.mockResolvedValueOnce(okJson({ ok: true }));
    await expect(updateProfile('s1', 'shop', { name: 'x' })).resolves.toEqual({ ok: true });
  });

  it('submitFeedback throws on a non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: vi.fn() });
    await expect(submitFeedback({ rating: 1 })).rejects.toThrow('Failed to submit feedback');
  });
});
