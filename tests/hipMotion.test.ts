import { describe, expect, it } from 'vitest';
import { HipMotion } from '../src/avatar/hipMotion';

const DT = 1 / 60;

describe('HipMotion', () => {
  it('shifts weight slowly in both directions and stays within -1..1', () => {
    const hip = new HipMotion();
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 60 * 60; i++) {
      const s = hip.step(DT, i * DT, 0.5);
      expect(Math.abs(s.shift)).toBeLessThanOrEqual(1);
      min = Math.min(min, s.shift);
      max = Math.max(max, s.shift);
    }
    expect(max).toBeGreaterThan(0.3);
    expect(min).toBeLessThan(-0.3);
  });

  it('does not change fast enough to look like a twitch', () => {
    const hip = new HipMotion();
    let prev = hip.step(DT, 0, 0.5).shift;
    for (let i = 1; i < 600; i++) {
      const next = hip.step(DT, i * DT, 0.5).shift;
      expect(Math.abs(next - prev)).toBeLessThan(0.02);
      prev = next;
    }
  });

  it('adds no breath offset at mid-breath and follows the breath level', () => {
    const hip = new HipMotion();
    let s = hip.step(DT, 0, 0.5, 1);
    for (let i = 1; i < 300; i++) s = hip.step(DT, i * DT, 0.5, 1);
    expect(Math.abs(s.breath)).toBeLessThan(0.01);
    for (let i = 300; i < 600; i++) s = hip.step(DT, i * DT, 1, 1);
    expect(s.breath).toBeGreaterThan(0.9);
  });

  it('scales with amount', () => {
    const hip = new HipMotion();
    for (let i = 0; i < 600; i++) {
      const s = hip.step(DT, i * DT, 1, 0);
      expect(Math.abs(s.shift)).toBeLessThan(1e-6);
      expect(Math.abs(s.breath)).toBeLessThan(1e-6);
    }
  });

  it('stays finite and bounded with a huge delta', () => {
    const hip = new HipMotion();
    hip.step(DT, 0, 0.5);
    const s = hip.step(0.1, 100, 1);
    expect(Number.isFinite(s.shift)).toBe(true);
    expect(Math.abs(s.shift)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.breath)).toBeLessThanOrEqual(1);
  });
});
