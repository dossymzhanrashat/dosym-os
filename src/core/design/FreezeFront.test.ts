import { describe, expect, it } from 'vitest';
import { clamp01, columnFills } from './FreezeFront';

describe('FreezeFront', () => {
  it('clamps progress to 0–1 and treats NaN as 0', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it('freezes columns left to right, partial column last', () => {
    expect(columnFills(0.5, 4)).toEqual([1, 1, 0, 0]);
    expect(columnFills(0.375, 4)).toEqual([1, 0.5, 0, 0]);
    expect(columnFills(0, 4)).toEqual([0, 0, 0, 0]);
    expect(columnFills(1, 4)).toEqual([1, 1, 1, 1]);
  });
});
