import { describe, expect, it } from 'vitest';
import { BreathingCycle } from '../src/avatar/breathing';

function run(seconds: number, fps = 60) {
  const cycle = new BreathingCycle();
  const samples = [];
  for (let i = 0; i < seconds * fps; i++) samples.push(cycle.step(1 / fps, i / fps));
  return samples;
}

/** Local maxima of `level` that rise above 0.5, i.e. the peak of each breath. */
function peaks(levels: number[]): number[] {
  const found: number[] = [];
  for (let i = 1; i < levels.length - 1; i++) {
    if (levels[i] > 0.5 && levels[i] >= levels[i - 1] && levels[i] > levels[i + 1]) found.push(levels[i]);
  }
  return found;
}

describe('BreathingCycle', () => {
  it('keeps every channel within 0..1', () => {
    for (const s of run(30)) {
      for (const v of [s.level, s.shoulder, s.head]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns to near-full exhale and inhales deeply', () => {
    const levels = run(30).map((s) => s.level);
    expect(Math.max(...levels)).toBeGreaterThan(0.7);
    expect(Math.min(...levels)).toBeLessThan(0.01);
  });

  it('inhales faster than it exhales', () => {
    const samples = run(60);
    const rising = samples.filter((s) => s.velocity > 0).length;
    const falling = samples.filter((s) => s.velocity < 0).length;
    expect(falling).toBeGreaterThan(rising);
  });

  it('breathes at roughly 4 seconds per cycle', () => {
    const count = peaks(run(60).map((s) => s.level)).length;
    expect(count).toBeGreaterThanOrEqual(12);
    expect(count).toBeLessThanOrEqual(18);
  });

  it('varies the depth from breath to breath', () => {
    const heights = peaks(run(90).map((s) => s.level));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.1);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(0.69);
  });

  it('rests briefly at full exhale before the next breath', () => {
    const levels = run(60).map((s) => s.level);
    let longest = 0;
    let current = 0;
    for (const v of levels) {
      current = v < 0.001 ? current + 1 : 0;
      longest = Math.max(longest, current);
    }
    expect(longest / 60).toBeGreaterThan(0.2);
  });

  it('lets the shoulders and head trail the chest', () => {
    const samples = run(30);
    const argmax = (pick: (s: (typeof samples)[number]) => number, from: number, to: number) => {
      let best = from;
      for (let i = from; i < to; i++) if (pick(samples[i]) > pick(samples[best])) best = i;
      return best;
    };
    // First breath: the chest peaks before the shoulders, which peak before the head.
    const chest = argmax((s) => s.level, 0, 240);
    const shoulder = argmax((s) => s.shoulder, 0, 240);
    const head = argmax((s) => s.head, 0, 240);
    expect(shoulder).toBeGreaterThan(chest);
    expect(head).toBeGreaterThan(shoulder);
  });
});
