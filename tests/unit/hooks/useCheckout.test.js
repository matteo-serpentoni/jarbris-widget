import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// TEST-WIDGET — Tier-2. useCheckout drives the checkout state machine (the money path):
// idle -> loading -> presenting(popup|newtab) -> completed -> idle, or -> error -> idle. The branches
// that cost a sale (cart_empty, checkout_url_unavailable, popup-blocked -> new-tab fallback) and the
// isMounted/timer cleanup are what's pinned here. It pulls 7 functions from checkoutService plus
// trackEvent + postToParent, all module-mocked; the popup is a plain fake object.

vi.mock('../../../src/services/checkoutService', () => ({
  requestCheckoutUrl: vi.fn(),
  fetchCheckoutConfig: vi.fn().mockResolvedValue({}),
  openCheckoutPopup: vi.fn(),
  openCheckoutNewTab: vi.fn(),
  notifyCheckoutComplete: vi.fn(),
  monitorPopup: vi.fn(() => vi.fn()), // returns a cleanup function
  ensureBridgeListener: vi.fn(),
}));
vi.mock('../../../src/services/trackingService.js', () => ({ trackEvent: vi.fn() }));
vi.mock('../../../src/config/bridge', () => ({ postToParent: vi.fn() }));

import {
  requestCheckoutUrl,
  openCheckoutPopup,
  openCheckoutNewTab,
  notifyCheckoutComplete,
  monitorPopup,
  ensureBridgeListener,
} from '../../../src/services/checkoutService';
import { trackEvent } from '../../../src/services/trackingService.js';
import { postToParent } from '../../../src/config/bridge';
import { useCheckout } from '../../../src/hooks/useCheckout';

const start = async (result) => {
  await act(async () => {
    await result.current.startCheckout();
  });
};

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('useCheckout — present', () => {
  it('opens the checkout in a popup, tracks the click, and monitors the popup', async () => {
    requestCheckoutUrl.mockResolvedValue({ checkoutUrl: 'https://shop/checkout', itemCount: 2 });
    const popup = { closed: false, close: vi.fn() };
    openCheckoutPopup.mockReturnValue(popup);

    const { result } = renderHook(() => useCheckout());
    await start(result);

    expect(result.current.checkoutState).toBe('presenting');
    expect(result.current.checkoutMode).toBe('popup');
    expect(openCheckoutPopup).toHaveBeenCalledWith('https://shop/checkout');
    expect(trackEvent).toHaveBeenCalledWith('checkout_clicked', { cartItemCount: 2 });
    expect(monitorPopup).toHaveBeenCalledWith(popup, expect.any(Function));
  });

  it('falls back to a new tab when the popup is blocked, then returns to idle after 2s', async () => {
    requestCheckoutUrl.mockResolvedValue({ checkoutUrl: 'u', itemCount: 1 });
    openCheckoutPopup.mockReturnValue(null); // blocked

    const { result } = renderHook(() => useCheckout());
    await start(result);

    expect(result.current.checkoutMode).toBe('newtab');
    expect(result.current.checkoutState).toBe('presenting');
    expect(openCheckoutNewTab).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('checkout_clicked', { cartItemCount: 1 });

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.checkoutState).toBe('idle');
    expect(result.current.checkoutMode).toBeNull();
  });

  it('ignores startCheckout while not idle', async () => {
    requestCheckoutUrl.mockResolvedValue({ checkoutUrl: 'u', itemCount: 1 });
    openCheckoutPopup.mockReturnValue({ closed: false, close: vi.fn() });

    const { result } = renderHook(() => useCheckout());
    await start(result);
    expect(result.current.checkoutState).toBe('presenting');
    expect(requestCheckoutUrl).toHaveBeenCalledTimes(1);

    await start(result); // not idle -> no-op
    expect(requestCheckoutUrl).toHaveBeenCalledTimes(1);
  });
});

describe('useCheckout — error branches (money path)', () => {
  it('errors with cart_empty and auto-recovers to idle after 5s', async () => {
    requestCheckoutUrl.mockResolvedValue({ checkoutUrl: 'u', itemCount: 0 });

    const { result } = renderHook(() => useCheckout());
    await start(result);

    expect(result.current.checkoutState).toBe('error');
    expect(result.current.error).toBe('cart_empty');

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.checkoutState).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('errors when no checkout URL is returned', async () => {
    requestCheckoutUrl.mockResolvedValue({ checkoutUrl: null, error: 'checkout_url_unavailable' });

    const { result } = renderHook(() => useCheckout());
    await start(result);

    expect(result.current.checkoutState).toBe('error');
    expect(result.current.error).toBe('checkout_url_unavailable');
  });
});

describe('useCheckout — completion & close', () => {
  it('handleCheckoutComplete confirms, resyncs cart, adds a message, and returns to idle after 3.5s', () => {
    const onCartReset = vi.fn();
    const onAddMessage = vi.fn();
    const { result } = renderHook(() => useCheckout({ onCartReset, onAddMessage }));

    act(() => result.current.handleCheckoutComplete());

    expect(result.current.checkoutState).toBe('completed');
    expect(notifyCheckoutComplete).toHaveBeenCalledTimes(1);
    expect(onCartReset).toHaveBeenCalledTimes(1);
    expect(onAddMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text', format: 'markdown', disableFeedback: true }),
    );

    act(() => vi.advanceTimersByTime(3500));
    expect(result.current.checkoutState).toBe('idle');
    expect(result.current.checkoutMode).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('on user popup close, returns to idle and requests a cart resync', async () => {
    requestCheckoutUrl.mockResolvedValue({ checkoutUrl: 'u', itemCount: 1 });
    openCheckoutPopup.mockReturnValue({ closed: false, close: vi.fn() });

    const { result } = renderHook(() => useCheckout());
    await start(result);

    const handlePopupClosed = monitorPopup.mock.calls[0][1];
    act(() => handlePopupClosed());

    expect(result.current.checkoutState).toBe('idle');
    expect(result.current.checkoutMode).toBeNull();
    expect(postToParent).toHaveBeenCalledWith({ type: 'JARBRIS:getCart' });
  });

  it('closeCheckout closes the popup and returns to idle', async () => {
    requestCheckoutUrl.mockResolvedValue({ checkoutUrl: 'u', itemCount: 1 });
    const popup = { closed: false, close: vi.fn() };
    openCheckoutPopup.mockReturnValue(popup);

    const { result } = renderHook(() => useCheckout());
    await start(result);

    act(() => result.current.closeCheckout());

    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(result.current.checkoutState).toBe('idle');
    expect(result.current.checkoutMode).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useCheckout — lifecycle', () => {
  it('registers the bridge listener on mount', () => {
    renderHook(() => useCheckout());
    expect(ensureBridgeListener).toHaveBeenCalledTimes(1);
  });

  it('cleans up the popup monitor on unmount', async () => {
    requestCheckoutUrl.mockResolvedValue({ checkoutUrl: 'u', itemCount: 1 });
    openCheckoutPopup.mockReturnValue({ closed: false, close: vi.fn() });

    const { result, unmount } = renderHook(() => useCheckout());
    await start(result);
    const cleanupFn = monitorPopup.mock.results[0].value; // the cleanup monitorPopup returned

    unmount();
    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });
});
