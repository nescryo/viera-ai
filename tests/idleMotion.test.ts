import { describe, expect, it } from 'vitest';
import { Spring } from '../src/avatar/spring';
import { IdleSway } from '../src/avatar/idleSway';
import { SaccadeGenerator } from '../src/avatar/saccade';

describe('Spring', () => {
  it('settles on the target', () => {
    const s = new Spring();
    for (let i = 0; i < 300; i++) s.step(1, 1 / 60);
    expect(s.value).toBeCloseTo(1, 3);
    expect(Math.abs(s.velocity)).toBeLessThan(0.001);
  });

  it('does not jump to the target in one frame', () => {
    const s = new Spring();
    expect(s.step(1, 1 / 60)).toBeLessThan(0.5);
  });

  it('stays stable with a large delta', () => {
    const s = new Spring();
    s.step(1, 0.1);
    expect(Number.isFinite(s.value)).toBe(true);
    expect(Math.abs(s.value)).toBeLessThan(2);
  });
});

describe('IdleSway', () => {
  it('stays within the configured angle limits', () => {
    const sway = new IdleSway();
    for (let i = 0; i < 6000; i++) {
      const s = sway.step(1 / 60, i / 60, 1);
      expect(Math.abs(s.headRoll)).toBeLessThan(16);
      expect(Math.abs(s.headYaw)).toBeLessThan(6);
      expect(Math.abs(s.bodyX)).toBeLessThan(5);
      expect(Math.abs(s.bodyZ)).toBeLessThan(4);
    }
  });

  it('produces motion over time', () => {
    const sway = new IdleSway();
    const rolls: number[] = [];
    for (let i = 0; i < 1200; i++) rolls.push(sway.step(1 / 60, i / 60).headRoll);
    expect(Math.max(...rolls) - Math.min(...rolls)).toBeGreaterThan(4);
  });

  it('is calm when amount is 0', () => {
    const sway = new IdleSway();
    let last = 1;
    for (let i = 0; i < 600; i++) last = sway.step(1 / 60, i / 60, 0, 0).headRoll;
    expect(Math.abs(last)).toBeLessThan(0.01);
  });
});

describe('SaccadeGenerator', () => {
  it('keeps offsets within +/-0.25', () => {
    const gen = new SaccadeGenerator();
    for (let i = 0; i < 6000; i++) {
      const o = gen.step(1 / 60);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(0.25);
    }
  });

  it('jumps to a new fixation only after the interval elapses', () => {
    const gen = new SaccadeGenerator(() => 1);
    // random() = 1 -> first interval is 2.2 s, target offset is +0.25 on both axes
    expect(gen.step(1, 1).x).toBe(0);
    for (let i = 0; i < 90; i++) gen.step(1 / 60);
    const o = gen.step(1 / 60);
    expect(o.x).toBeCloseTo(0.25, 2);
    expect(o.y).toBeCloseTo(0.25, 2);
  });

  it('scales the offset by amount', () => {
    const a = new SaccadeGenerator(() => 1);
    const b = new SaccadeGenerator(() => 1);
    let full = { x: 0, y: 0 };
    let half = { x: 0, y: 0 };
    for (let i = 0; i < 200; i++) {
      full = a.step(1 / 60, 1);
      half = b.step(1 / 60, 0.5);
    }
    expect(half.x).toBeCloseTo(full.x * 0.5, 5);
  });
});
