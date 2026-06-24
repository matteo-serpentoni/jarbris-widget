import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// TEST-WIDGET — Tier-2 (last hook). useProductViewTracker fires product_card_viewed when a card is
// >=50% visible for >=800ms while the page is visible, deduped per session:search:product. jsdom has
// no IntersectionObserver, so we stub a controllable fake (capture the callback, fire entries by hand)
// and drive the dwell timer with fake timers.

vi.mock('../../../src/services/trackingService.js', () => ({
  trackEvent: vi.fn(),
  getContext: vi.fn(() => ({ sessionId: 's1' })),
}));

import { trackEvent } from '../../../src/services/trackingService.js';
import { useProductViewTracker } from '../../../src/hooks/useProductViewTracker';

let lastObserver = null;
class FakeIntersectionObserver {
  constructor(cb) {
    this.cb = cb;
    this.observe = vi.fn();
    this.unobserve = vi.fn();
    this.disconnect = vi.fn();
    lastObserver = this;
  }
  fire(entries) {
    this.cb(entries);
  }
}

const entry = (target, intersectionRatio) => ({ target, intersectionRatio });
const card = () => document.createElement('div');
const setVisibility = (state) =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

beforeEach(() => {
  vi.useFakeTimers();
  lastObserver = null;
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  setVisibility('visible');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  setVisibility('visible');
});

describe('useProductViewTracker — view firing', () => {
  it('fires product_card_viewed after 800ms once a card is >=50% visible', () => {
    const { result } = renderHook(() => useProductViewTracker({ searchId: 'search-1' }));
    const el = card();
    act(() => result.current.observeCard(el, { productId: 'p1', position: 0, query: 'shoes' }));

    act(() => lastObserver.fire([entry(el, 0.6)]));
    expect(trackEvent).not.toHaveBeenCalled(); // dwell not elapsed yet

    act(() => vi.advanceTimersByTime(800));
    expect(trackEvent).toHaveBeenCalledWith(
      'product_card_viewed',
      expect.objectContaining({
        searchId: 'search-1',
        productId: 'p1',
        position: 0,
        query: 'shoes',
        visibleMs: 800,
        visibleRatio: 0.6,
      }),
    );
  });

  it('does not fire before the 800ms dwell threshold', () => {
    const { result } = renderHook(() => useProductViewTracker({ searchId: 's' }));
    const el = card();
    act(() => result.current.observeCard(el, { productId: 'p1', position: 0 }));
    act(() => lastObserver.fire([entry(el, 0.6)]));

    act(() => vi.advanceTimersByTime(799));
    expect(trackEvent).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending timer when the card leaves the viewport before 800ms', () => {
    const { result } = renderHook(() => useProductViewTracker({ searchId: 's' }));
    const el = card();
    act(() => result.current.observeCard(el, { productId: 'p1', position: 0 }));

    act(() => lastObserver.fire([entry(el, 0.6)]));
    act(() => vi.advanceTimersByTime(400));
    act(() => lastObserver.fire([entry(el, 0.2)])); // dropped below threshold
    act(() => vi.advanceTimersByTime(800));

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('does not fire if the page is hidden when the timer elapses', () => {
    const { result } = renderHook(() => useProductViewTracker({ searchId: 's' }));
    const el = card();
    act(() => result.current.observeCard(el, { productId: 'p1', position: 0 }));
    act(() => lastObserver.fire([entry(el, 0.6)]));

    setVisibility('hidden');
    act(() => vi.advanceTimersByTime(800));

    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe('useProductViewTracker — dedup & lifecycle', () => {
  it('deduplicates the same product within one session/search', () => {
    const { result } = renderHook(() => useProductViewTracker({ searchId: 'search-1' }));
    const el = card();
    act(() => result.current.observeCard(el, { productId: 'p1', position: 0 }));

    act(() => lastObserver.fire([entry(el, 0.6)]));
    act(() => vi.advanceTimersByTime(800));
    expect(trackEvent).toHaveBeenCalledTimes(1);

    act(() => lastObserver.fire([entry(el, 0.6)])); // visible again
    act(() => vi.advanceTimersByTime(800));
    expect(trackEvent).toHaveBeenCalledTimes(1); // deduped
  });

  it('unobserveCard cancels a pending view timer', () => {
    const { result } = renderHook(() => useProductViewTracker({ searchId: 's' }));
    const el = card();
    act(() => result.current.observeCard(el, { productId: 'p1', position: 0 }));
    act(() => lastObserver.fire([entry(el, 0.6)]));
    act(() => vi.advanceTimersByTime(400));

    act(() => result.current.unobserveCard(el));
    act(() => vi.advanceTimersByTime(800));

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('disconnects the observer on unmount', () => {
    renderHook(() => useProductViewTracker({ searchId: 's' }));
    const observer = lastObserver;

    act(() => cleanup());

    expect(observer.disconnect).toHaveBeenCalled();
  });
});
