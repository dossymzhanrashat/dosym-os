import { describe, expect, it } from 'vitest';
import { cleanDroplets } from './components';

describe('DropletMeter', () => {
  it('rounds the drinkable share to whole droplets', () => {
    expect(cleanDroplets(0.6, 10)).toBe(6);
    expect(cleanDroplets(0.04, 10)).toBe(0);
    expect(cleanDroplets(0.66, 3)).toBe(2);
  });

  it('clamps bad input', () => {
    expect(cleanDroplets(-1, 10)).toBe(0);
    expect(cleanDroplets(2, 10)).toBe(10);
    expect(cleanDroplets(Number.NaN, 10)).toBe(0);
    expect(cleanDroplets(0.5, -4)).toBe(0);
  });
});
