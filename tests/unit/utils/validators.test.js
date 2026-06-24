import { describe, it, expect } from 'vitest';

import { validateEmail } from '../../../src/utils/validators';

// TEST-WIDGET — Tier-3 (pure util). Email validation used before identity/profile submission.

describe('validateEmail', () => {
  it('accepts a well-formed address', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('a.b+tag@sub.domain.co')).toBe(true);
  });

  it('rejects addresses missing the @ or the domain dot', () => {
    expect(validateEmail('userexample.com')).toBe(false);
    expect(validateEmail('user@example')).toBe(false);
  });

  it('rejects whitespace and empty/nullish input', () => {
    expect(validateEmail('user @example.com')).toBe(false);
    expect(validateEmail('')).toBe(false);
    expect(validateEmail(null)).toBe(false);
    expect(validateEmail(undefined)).toBe(false);
  });
});
