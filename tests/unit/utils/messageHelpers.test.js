import { describe, it, expect } from 'vitest';

import { formatPrice, processMessage, formatTime } from '../../../src/utils/messageHelpers';

// TEST-WIDGET — Tier-3 (pure util). processMessage is the widget's XSS-escaping seam (security.md §2):
// it MUST escape HTML before applying safe markdown. Also covers price formatting and time formatting.

describe('formatPrice', () => {
  it('formats with the it-IT decimal comma and a leading currency symbol', () => {
    expect(formatPrice(10, 'EUR')).toBe('€ 10,00');
    // it-IT decimal comma is reliable; the thousands separator is ICU-build dependent
    // (full-ICU browser: "1.234,50"; small-ICU node: "1234,50") — accept both.
    expect(formatPrice('1234.5', 'USD')).toMatch(/^\$ 1\.?234,50$/);
  });

  it('omits the symbol with no currency, and echoes an unknown currency code', () => {
    expect(formatPrice(10)).toBe('10,00');
    expect(formatPrice(10, 'XYZ')).toBe('XYZ 10,00');
  });

  it('returns the original (or "---") for non-numeric input', () => {
    expect(formatPrice('abc')).toBe('abc');
    expect(formatPrice(undefined)).toBe('---');
  });
});

describe('processMessage — XSS escaping (security.md §2)', () => {
  it('escapes HTML so injected markup cannot render', () => {
    const out = processMessage('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });

  it('escapes ampersands and quotes', () => {
    expect(processMessage('a & b')).toContain('a &amp; b');
    expect(processMessage(`say "hi" it's`)).toBe('say &quot;hi&quot; it&#039;s');
  });

  it('linkifies URLs with rel="noopener noreferrer"', () => {
    const out = processMessage('go https://x.io now');
    expect(out).toContain('<a href="https://x.io"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('>https://x.io</a>');
  });

  it('converts basic markdown and newlines', () => {
    expect(processMessage('**bold**')).toBe('<strong>bold</strong>');
    expect(processMessage('*it*')).toBe('<em>it</em>');
    expect(processMessage('a\nb')).toBe('a<br/>b');
  });

  it('returns "" for empty/absent input', () => {
    expect(processMessage('')).toBe('');
    expect(processMessage()).toBe('');
  });
});

describe('formatTime', () => {
  it('formats a date to zero-padded HH:MM', () => {
    expect(formatTime(new Date(2026, 5, 24, 9, 5))).toBe('09:05');
    expect(formatTime(new Date(2026, 5, 24, 14, 30))).toBe('14:30');
  });

  it('returns "" for a falsy timestamp', () => {
    expect(formatTime('')).toBe('');
    expect(formatTime(0)).toBe('');
  });
});
