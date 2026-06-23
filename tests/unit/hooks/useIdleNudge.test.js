import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useIdleNudge } from '../../../src/hooks/useIdleNudge';

// TEST-WIDGET — Tier-2 (first stateful-hook slice; establishes the renderHook + fake-timer harness for
// the repo). useIdleNudge fires a socket 'nudge:request' after an idle timeout following a product
// response, guarded by an anti-spam + cancellation matrix where real bugs were born (socket-storm and
// auto-scroll self-cancel). It is fully prop-injected (socketRef/scrollRef/inputRef/messages), so it
// needs ZERO module mocks — only fake timers plus plain DOM/ref fakes.

const SETTLE_MS = 500; // SCROLL_SETTLE_MS in the hook
const TIMEOUT_MS = 10_000; // DEFAULT_TIMEOUT

// An assistant message matching the default 'PRODUCT_RESPONSE' trigger (non-empty products[]).
const trigger = (id, extra = {}) => ({
  id,
  sender: 'assistant',
  products: [{ id: 'p1' }],
  ...extra,
});

// Common props: a captured emit spy + a real jsdom scroll container.
function baseProps(emit, scrollEl, overrides = {}) {
  return {
    messages: [],
    socketRef: { current: { emit } },
    sessionId: 's1',
    isOpen: true,
    scrollRef: { current: scrollEl },
    inputRef: { current: null },
    ...overrides,
  };
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('useIdleNudge — fire path', () => {
  it('emits nudge:request after the settle + idle timeout on a product response', () => {
    const emit = vi.fn();
    renderHook(() =>
      useIdleNudge(baseProps(emit, document.createElement('div'), { messages: [trigger('m1')] })),
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS));
    act(() => vi.advanceTimersByTime(TIMEOUT_MS));

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('nudge:request', { sessionId: 's1', triggerMessageId: 'm1' });
  });

  it('does not nudge when the last message is not a matching trigger', () => {
    const emit = vi.fn();
    renderHook(() =>
      useIdleNudge(
        baseProps(emit, document.createElement('div'), {
          messages: [{ id: 'm1', sender: 'assistant', text: 'no products here' }],
        }),
      ),
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('useIdleNudge — anti-spam', () => {
  it('nudges at most once per batch id', () => {
    const emit = vi.fn();
    const scrollEl = document.createElement('div');
    const { rerender } = renderHook(
      ({ messages }) => useIdleNudge(baseProps(emit, scrollEl, { messages })),
      { initialProps: { messages: [trigger('m1')] } },
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).toHaveBeenCalledTimes(1);

    rerender({ messages: [trigger('m1')] }); // same batch id
    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('stops at maxPerSession across different batches', () => {
    const emit = vi.fn();
    const scrollEl = document.createElement('div');
    const { rerender } = renderHook(
      ({ messages }) => useIdleNudge(baseProps(emit, scrollEl, { messages, maxPerSession: 1 })),
      { initialProps: { messages: [trigger('m1')] } },
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).toHaveBeenCalledTimes(1);

    rerender({ messages: [trigger('m2')] }); // new batch, but session cap already reached
    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('skips a response flagged nudgeEligible:false', () => {
    const emit = vi.fn();
    renderHook(() =>
      useIdleNudge(
        baseProps(emit, document.createElement('div'), {
          messages: [trigger('m1', { nudgeEligible: false })],
        }),
      ),
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).not.toHaveBeenCalled();
  });

  it('skips when the trigger message is itself a NUDGE', () => {
    const emit = vi.fn();
    renderHook(() =>
      useIdleNudge(
        baseProps(emit, document.createElement('div'), {
          messages: [trigger('m1', { messageType: 'NUDGE' })],
        }),
      ),
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('useIdleNudge — cancellation', () => {
  it('cancels a pending nudge when the user sends a message', () => {
    const emit = vi.fn();
    const scrollEl = document.createElement('div');
    const { rerender } = renderHook(
      ({ messages }) => useIdleNudge(baseProps(emit, scrollEl, { messages })),
      { initialProps: { messages: [trigger('m1')] } },
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS)); // baseline captured, nudge still pending
    rerender({ messages: [trigger('m1'), { id: 'u1', sender: 'user' }] });
    act(() => vi.advanceTimersByTime(TIMEOUT_MS));

    expect(emit).not.toHaveBeenCalled();
  });

  it('does not nudge while the chat is closed', () => {
    const emit = vi.fn();
    renderHook(() =>
      useIdleNudge(
        baseProps(emit, document.createElement('div'), {
          messages: [trigger('m1')],
          isOpen: false,
        }),
      ),
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not emit if the input is focused when the timer fires (user typing)', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus(); // document.activeElement === input

    const emit = vi.fn();
    renderHook(() =>
      useIdleNudge(
        baseProps(emit, document.createElement('div'), {
          messages: [trigger('m1')],
          inputRef: { current: input },
        }),
      ),
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('useIdleNudge — SCROLL_SETTLE_MS baseline (auto-scroll self-cancel guard)', () => {
  it('a scroll BEFORE the baseline is captured does NOT cancel the nudge', () => {
    const emit = vi.fn();
    const scrollEl = document.createElement('div');
    renderHook(() =>
      useIdleNudge(baseProps(emit, scrollEl, { messages: [trigger('m1')], scrollThreshold: 50 })),
    );

    // Pre-baseline (settle timer not yet fired): a large scroll must be ignored — this is exactly the
    // guard that stops the product-cards auto-scroll from self-cancelling the nudge.
    scrollEl.scrollTop = 1000;
    act(() => scrollEl.dispatchEvent(new Event('scroll')));

    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).toHaveBeenCalledTimes(1); // survived the pre-baseline scroll
  });

  it('a scroll AFTER the baseline, beyond the threshold, DOES cancel the nudge', () => {
    const emit = vi.fn();
    const scrollEl = document.createElement('div');
    scrollEl.scrollTop = 0;
    renderHook(() =>
      useIdleNudge(baseProps(emit, scrollEl, { messages: [trigger('m1')], scrollThreshold: 50 })),
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS)); // baseline captured at scrollTop = 0
    scrollEl.scrollTop = 1000; // delta 1000 > threshold 50
    act(() => scrollEl.dispatchEvent(new Event('scroll')));

    act(() => vi.advanceTimersByTime(TIMEOUT_MS));
    expect(emit).not.toHaveBeenCalled(); // cancelled by the real scroll
  });
});

describe('useIdleNudge — lifecycle', () => {
  it('resets the per-session count on session change so a new session can nudge again', () => {
    const emit = vi.fn();
    const scrollEl = document.createElement('div');
    const { rerender } = renderHook(
      ({ messages, sessionId }) =>
        useIdleNudge(baseProps(emit, scrollEl, { messages, sessionId, maxPerSession: 1 })),
      { initialProps: { messages: [trigger('m1')], sessionId: 's1' } },
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).toHaveBeenCalledTimes(1); // s1 cap reached

    // Switch session first (lets the reset effect run before the next trigger arrives), then nudge.
    rerender({ messages: [], sessionId: 's2' });
    rerender({ messages: [trigger('m3')], sessionId: 's2' });
    act(() => vi.advanceTimersByTime(SETTLE_MS + TIMEOUT_MS));
    expect(emit).toHaveBeenCalledTimes(2); // new session can nudge again
  });

  it('clears the pending timer on unmount (no emit afterwards)', () => {
    const emit = vi.fn();
    const { unmount } = renderHook(() =>
      useIdleNudge(baseProps(emit, document.createElement('div'), { messages: [trigger('m1')] })),
    );

    act(() => vi.advanceTimersByTime(SETTLE_MS)); // nudge pending
    unmount();
    act(() => vi.advanceTimersByTime(TIMEOUT_MS));

    expect(emit).not.toHaveBeenCalled();
  });
});
