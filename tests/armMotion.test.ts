import { describe, expect, it } from 'vitest';
import { ArmMotion } from '../src/avatar/armMotion';

const DT = 1 / 60;

/** Deterministic random source cycling through fixed values. */
function fixedRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('ArmMotion', () => {
  it('sways while idle and stays within -1..1', () => {
    const arm = new ArmMotion(fixedRandom([0.5]));
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 1200; i++) {
      const s = arm.step(DT, i * DT, 0);
      for (const side of ['l', 'r'] as const) {
        for (const v of Object.values(s[side])) {
          expect(Math.abs(v)).toBeLessThanOrEqual(1);
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    expect(max - min).toBeGreaterThan(0.1);
  });

  it('moves the arms out of phase', () => {
    const arm = new ArmMotion();
    let diff = 0;
    for (let i = 0; i < 600; i++) {
      const s = arm.step(DT, i * DT, 0);
      diff = Math.max(diff, Math.abs(s.l.arm - s.r.arm));
    }
    expect(diff).toBeGreaterThan(0.05);
  });

  it('gestures wider while speaking than while idle', () => {
    const range = (speech: number): number => {
      const arm = new ArmMotion(fixedRandom([0.9, 0.1, 0.8, 0.2]));
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 1800; i++) {
        const v = arm.step(DT, i * DT, speech).l.forearm;
        if (i > 300) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
      return max - min;
    };
    expect(range(0.8)).toBeGreaterThan(range(0));
  });

  it('swings when the body driver jumps, then settles', () => {
    const arm = new ArmMotion();
    arm.step(DT, 0, 0, 1, 0);
    // Compare against a steady run to isolate the swing from idle sway.
    const steady = new ArmMotion();
    steady.step(DT, 0, 0, 1, 0);
    let peak = 0;
    let last = 0;
    for (let i = 1; i < 600; i++) {
      const swung = arm.step(DT, i * DT, 0, 1, 10).l.wrist;
      const base = steady.step(DT, i * DT, 0, 1, 0).l.wrist;
      last = Math.abs(swung - base);
      peak = Math.max(peak, last);
    }
    expect(peak).toBeGreaterThan(0.1);
    expect(last).toBeLessThan(0.01);
  });

  it('follows head pitch on the lift channel, settles, and the sides differ in speed', () => {
    const arm = new ArmMotion();
    arm.step(DT, 0, 0, 1, 0, 0);
    let early: { l: number; r: number } = { l: 0, r: 0 };
    let s = arm.step(DT, DT, 0, 1, 0, 1);
    for (let i = 2; i < 600; i++) {
      s = arm.step(DT, i * DT, 0, 1, 0, 1);
      if (i === 10) early = { l: s.l.lift, r: s.r.lift };
    }
    expect(s.l.lift).toBeGreaterThan(0.95);
    expect(s.r.lift).toBeGreaterThan(0.95);
    expect(early.l).toBeGreaterThan(0);
    expect(early.l).not.toBeCloseTo(early.r, 3);
  });

  it('keeps the arms asymmetric while idle', () => {
    const arm = new ArmMotion();
    let asym = 0;
    for (let i = 0; i < 1200; i++) {
      const s = arm.step(DT, i * DT, 0, 1, 0, 0);
      asym = Math.max(asym, Math.abs(s.l.wrist - s.r.wrist), Math.abs(s.l.forearm - s.r.forearm));
    }
    expect(asym).toBeGreaterThan(0.1);
  });

  it('is finite and bounded with a huge delta', () => {
    const arm = new ArmMotion();
    arm.step(DT, 0, 1);
    const s = arm.step(0.1, 100, 1);
    for (const side of ['l', 'r'] as const) {
      for (const v of Object.values(s[side])) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('scales with amount', () => {
    const arm = new ArmMotion();
    for (let i = 0; i < 300; i++) {
      const s = arm.step(DT, i * DT, 1, 0);
      expect(Math.abs(s.l.arm)).toBeLessThan(1e-6);
    }
  });
});
