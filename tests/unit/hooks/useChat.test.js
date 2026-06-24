import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// TEST-WIDGET — Tier-2. Covers ONLY the socket-lifecycle effect of useChat (the security + invariant
// core): the auth handshake (SEC-07b widget token), join_session, the deliberate dep-array that
// prevents a reconnect-storm on identity refresh, the thinking-flicker guard, the server-event
// handlers, the navigator.onLine reconnect gate, and teardown. The boot/merge, message-send, profile,
// feedback and the JARBRIS:identity postMessage path are out of scope (separate slices).
//
// socket.io-client is replaced with a controllable fake (handler registry + __emit to fire server
// events). chatApi/trackingService/errorApi/bridge/i18n are neutralised; widgetTokenStore and storage
// are REAL so the lazy-token read is exercised end to end.

vi.mock('socket.io-client', () => {
  const handlers = new Map();
  const socket = {
    on: vi.fn((ev, cb) => {
      const arr = handlers.get(ev) ?? [];
      arr.push(cb);
      handlers.set(ev, arr);
    }),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    __emit: (ev, payload) => (handlers.get(ev) ?? []).forEach((cb) => cb(payload)),
    __reset: () => handlers.clear(),
  };
  return { io: vi.fn(() => socket), __socket: socket };
});

vi.mock('../../../src/services/chatApi', () => ({
  bootSession: vi.fn().mockResolvedValue(null),
  sendMessage: vi.fn(),
  submitFeedback: vi.fn(),
  updateProfile: vi.fn(),
  ChatApiError: class ChatApiError extends Error {},
}));
vi.mock('../../../src/services/errorApi', () => ({ reportError: vi.fn() }));
vi.mock('../../../src/services/trackingService.js', () => ({
  setContext: vi.fn(),
  trackEvent: vi.fn(),
}));
vi.mock('../../../src/config/bridge', () => ({
  BRIDGE_CONFIG: { isValidOrigin: () => true },
  postToParent: vi.fn(),
}));
vi.mock('../../../src/i18n', () => ({ t: (k) => k, setLng: vi.fn() }));

import { io, __socket } from 'socket.io-client';
import { setWidgetToken } from '../../../src/services/widgetTokenStore';
import { useChat } from '../../../src/hooks/useChat';

// Mount with the socket effect active: it needs !disabled && sessionId && shopDomain.
const mount = (customer = null) =>
  renderHook(({ c }) => useChat('shop.myshopify.com', c), { initialProps: { c: customer } });

const setOnline = (value) =>
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem('jarbris_session_id', 's1'); // seeds the sessionId useState initializer
  setWidgetToken('');
  setOnline(true);
});

afterEach(() => {
  cleanup();
  __socket.__reset(); // clear handlers registered by the unmounted hook
  vi.clearAllMocks(); // reset call history (keeps mock implementations)
  vi.useRealTimers();
  setWidgetToken('');
  localStorage.clear();
  setOnline(true);
});

describe('useChat — socket auth handshake', () => {
  it('connects once with the reconnection options and sends a FRESH widget token via the auth callback', () => {
    mount();

    expect(io).toHaveBeenCalledTimes(1);
    const opts = io.mock.calls[0][1];
    expect(opts.transports).toEqual(['websocket', 'polling']);
    expect(opts.reconnection).toBe(true);
    expect(opts.reconnectionAttempts).toBe(Infinity);

    // Token empty at mount...
    const cb1 = vi.fn();
    opts.auth(cb1);
    expect(cb1).toHaveBeenCalledWith({ widgetToken: '' });

    // ...arrives later via postMessage; the SAME captured auth callback reads it lazily on reconnect.
    setWidgetToken('tok-late');
    const cb2 = vi.fn();
    opts.auth(cb2);
    expect(cb2).toHaveBeenCalledWith({ widgetToken: 'tok-late' });
  });

  it('joins the session room with the effect-closure sessionId on connect, and goes online', () => {
    const { result } = mount();

    act(() => __socket.__emit('connect'));

    expect(__socket.emit).toHaveBeenCalledWith('join_session', 's1');
    expect(result.current.connectionStatus).toBe('online');
  });
});

describe('useChat — reconnect-storm guard', () => {
  it('does NOT recreate the socket when a non-session prop (customer) changes', () => {
    const { rerender } = renderHook(({ c }) => useChat('shop.myshopify.com', c), {
      initialProps: { c: { id: 'c1' } },
    });
    expect(io).toHaveBeenCalledTimes(1);

    rerender({ c: { id: 'c2' } }); // identity-style change → must not tear down the socket

    expect(io).toHaveBeenCalledTimes(1);
    expect(__socket.disconnect).not.toHaveBeenCalled();
  });
});

describe('useChat — server event handlers', () => {
  it('thinking:start sets only thinkingIntent and does NOT toggle isThinking (flicker guard)', () => {
    const { result } = mount();
    expect(result.current.isThinking).toBe(false);

    act(() => __socket.__emit('thinking:start', { intent: 'searching' }));

    expect(result.current.thinkingIntent).toBe('searching');
    expect(result.current.isThinking).toBe(false); // untouched by thinking:start
  });

  it('appends an assistant message and clears the thinking phrase + loading', () => {
    const { result } = mount();
    act(() => __socket.__emit('thinking:start', { intent: 'searching' }));
    expect(result.current.thinkingIntent).toBe('searching');

    act(() => __socket.__emit('message:received', { id: 'a1', sender: 'assistant', text: 'hi' }));

    expect(result.current.messages.some((m) => m.id === 'a1')).toBe(true);
    expect(result.current.thinkingIntent).toBeNull();
    expect(result.current.isThinking).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('deduplicates message:received by id', () => {
    const { result } = mount();

    act(() => __socket.__emit('message:received', { id: 'a1', sender: 'assistant', text: 'hi' }));
    act(() => __socket.__emit('message:received', { id: 'a1', sender: 'assistant', text: 'hi' }));

    expect(result.current.messages.filter((m) => m.id === 'a1')).toHaveLength(1);
  });

  it('drops a hidden/system non-assistant message', () => {
    const { result } = mount();
    const before = result.current.messages.length;

    act(() => __socket.__emit('message:received', { id: 's1', sender: 'system', hidden: true }));

    expect(result.current.messages).toHaveLength(before);
    expect(result.current.messages.some((m) => m.id === 's1')).toBe(false);
  });

  it('session:updated reflects status and assignedTo from the dashboard', () => {
    const { result } = mount();

    act(() => __socket.__emit('session:updated', { status: 'closed', assignedTo: 'op1' }));

    expect(result.current.sessionStatus).toBe('closed');
    expect(result.current.assignedTo).toBe('op1');
  });
});

describe('useChat — reconnect status gated on navigator.onLine', () => {
  it('marks reconnecting on disconnect while online', () => {
    const { result } = mount();
    act(() => __socket.__emit('connect'));

    act(() => __socket.__emit('disconnect'));

    expect(result.current.connectionStatus).toBe('reconnecting');
  });

  it('does NOT mark reconnecting on disconnect while offline (owned by the offline listener)', () => {
    const { result } = mount();
    act(() => __socket.__emit('connect'));
    expect(result.current.connectionStatus).toBe('online');

    setOnline(false);
    act(() => __socket.__emit('disconnect'));

    expect(result.current.connectionStatus).not.toBe('reconnecting');
  });
});

describe('useChat — teardown', () => {
  it('disconnects the socket and removes the feedback listener on unmount', () => {
    const { unmount } = mount();

    unmount();

    expect(__socket.disconnect).toHaveBeenCalledTimes(1);
    expect(__socket.off).toHaveBeenCalledWith('message:feedback_updated', expect.any(Function));
  });
});
