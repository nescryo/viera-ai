import { describe, expect, it } from 'vitest';
import { resolveEyelidScale } from '../src/avatar/paramBlender';

describe('resolveEyelidScale', () => {
  const closeBy = { 'eye-squint': 0.4 };

  it('leaves the eyelids untouched without an active modifier', () => {
    expect(resolveEyelidScale({}, closeBy)).toBe(1);
    expect(resolveEyelidScale({ blush: 1 }, closeBy)).toBe(1);
  });

  it('closes the eyelids in proportion to the modifier weight', () => {
    expect(resolveEyelidScale({ 'eye-squint': 1 }, closeBy)).toBeCloseTo(0.6);
    expect(resolveEyelidScale({ 'eye-squint': 0.5 }, closeBy)).toBeCloseTo(0.8);
  });

  it('sums several modifiers and clamps to 0..1', () => {
    expect(resolveEyelidScale({ a: 1, b: 1 }, { a: 0.7, b: 0.7 })).toBe(0);
    expect(resolveEyelidScale({ a: 1 }, { a: -0.5 })).toBe(1);
  });
});
