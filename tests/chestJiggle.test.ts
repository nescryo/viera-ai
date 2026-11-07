import { describe, expect, it } from 'vitest';
import { ChestJiggle } from '../src/avatar/chestJiggle';

describe('ChestJiggle', () => {
  it('stays at rest for a steady driver', () => {
    const j = new ChestJiggle();
    for (let i = 0; i < 300; i++) j.step(1 / 60, 2, 0.5);
    const s = j.step(1 / 60, 2, 0.5);
    expect(Math.abs(s.x)).toBeLessThan(0.01);
    expect(Math.abs(s.y)).toBeLessThan(0.01);
  });

  it('swings, overshoots and settles after a driver step', () => {
    const j = new ChestJiggle();
    j.step(1 / 60, 0, 0);
    const samples: number[] = [];
    for (let i = 0; i < 300; i++) samples.push(j.step(1 / 60, 4, 0).x);
    expect(Math.max(...samples)).toBeGreaterThan(0.1);
    expect(Math.min(...samples)).toBeLessThan(0);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.01);
  });

  it('stays within -1..1 and finite with a huge delta', () => {
    const j = new ChestJiggle();
    j.step(1 / 60, 0, 0);
    const s = j.step(0.1, 100, 100);
    expect(Math.abs(s.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.y)).toBeLessThanOrEqual(1);
  });

  it('scales with amount', () => {
    const a = new ChestJiggle();
    a.step(1 / 60, 0, 0);
    expect(a.step(1 / 60, 1, 0, 0).x).toBe(0);
  });
});
