import { describe, it, expect } from 'vitest';

import { hexToVec3, hexToRgb, vec3ToRgbString } from '../../../src/utils/colorUtils';

// TEST-WIDGET — Tier-3 (pure util). Hex → RGB/Vec3 conversions used to sync CSS theme with WebGL.

describe('hexToVec3', () => {
  it('converts hex to normalized [r,g,b] in 0..1', () => {
    expect(hexToVec3('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToVec3('#000000')).toEqual([0, 0, 0]);
    expect(hexToVec3('#667eea')).toEqual([0.4, 0.494118, 0.917647]);
  });

  it('tolerates a missing leading # and a nullish input', () => {
    expect(hexToVec3('ff8040')).toEqual([1, 0.501961, 0.25098]);
    expect(hexToVec3(null)).toEqual([0, 0, 0]);
  });
});

describe('hexToRgb', () => {
  it('converts hex to an "r, g, b" string', () => {
    expect(hexToRgb('#ff8040')).toBe('255, 128, 64');
    expect(hexToRgb('000000')).toBe('0, 0, 0');
  });

  it('falls back to "0, 0, 0" on nullish input', () => {
    expect(hexToRgb(null)).toBe('0, 0, 0');
  });
});

describe('vec3ToRgbString', () => {
  it('scales a 0..1 vec3 to an rgb() string', () => {
    expect(vec3ToRgbString([1, 0, 0.5])).toBe('rgb(255, 0, 127.5)');
  });
});
