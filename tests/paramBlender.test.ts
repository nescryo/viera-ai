import { describe, expect, it } from 'vitest';
import { ParamBlender, resolveEmotionTargets } from '../src/avatar/paramBlender';

describe('resolveEmotionTargets', () => {
  const emotions = { relaxed: { a: 0.1 }, happy: { b: 1 } };

  it('returns the matching emotion', () => {
    expect(resolveEmotionTargets(emotions, 'happy', 'relaxed')).toEqual({ b: 1 });
  });

  it('falls back to the default emotion when unmapped', () => {
    expect(resolveEmotionTargets(emotions, 'sad', 'relaxed')).toEqual({ a: 0.1 });
  });

  it('returns an empty target when nothing matches', () => {
    expect(resolveEmotionTargets({}, 'sad', 'relaxed')).toEqual({});
  });
});

describe('ParamBlender', () => {
  it('moves toward the target without overshooting', () => {
    const blender = new ParamBlender(7);
    let value = 0;
    for (let i = 0; i < 10; i++) {
      value = blender.step({ p: 1 }, 1 / 60).get('p') as number;
    }
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it('converges to the target over time', () => {
    const blender = new ParamBlender(7);
    let value = 0;
    for (let i = 0; i < 300; i++) value = blender.step({ p: 0.8 }, 1 / 60).get('p') as number;
    expect(value).toBeCloseTo(0.8, 3);
  });

  it('relaxes parameters missing from the new target back to 0', () => {
    const blender = new ParamBlender(7);
    for (let i = 0; i < 300; i++) blender.step({ p: 1 }, 1 / 60);
    let value = 1;
    for (let i = 0; i < 300; i++) value = blender.step({}, 1 / 60).get('p') as number;
    expect(value).toBeCloseTo(0, 3);
  });
});
