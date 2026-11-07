import { describe, expect, it } from 'vitest';
import { ParamBlender, resolveEmotionTargets, resolveExpressionTargets } from '../src/avatar/paramBlender';

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

describe('resolveExpressionTargets', () => {
  const emotions = { relaxed: {}, sad: { mouth: -0.8, cheek: 0.1 } };
  const modifiers = { blush: { cheek: 1 } };

  it('adds weighted modifier deltas on top of the base emotion', () => {
    const t = resolveExpressionTargets(emotions, modifiers, 'sad', { blush: 0.5 }, 'relaxed');
    expect(t.mouth).toBe(-0.8);
    expect(t.cheek).toBeCloseTo(0.6, 5);
  });

  it('adds a modifier-only parameter to an emotion that does not set it', () => {
    const t = resolveExpressionTargets(emotions, modifiers, 'relaxed', { blush: 0.3 }, 'relaxed');
    expect(t.cheek).toBeCloseTo(0.3, 5);
  });

  it('scales the base preset by baseWeight but not the modifiers', () => {
    const t = resolveExpressionTargets(emotions, modifiers, 'sad', { blush: 0.5 }, 'relaxed', 0.5);
    expect(t.mouth).toBeCloseTo(-0.4, 5);
    expect(t.cheek).toBeCloseTo(0.55, 5);
  });

  it('ignores unknown modifiers and does not mutate the emotion table', () => {
    const t = resolveExpressionTargets(emotions, modifiers, 'sad', { glitter: 1 }, 'relaxed');
    expect(t).toEqual({ mouth: -0.8, cheek: 0.1 });
    resolveExpressionTargets(emotions, modifiers, 'sad', { blush: 1 }, 'relaxed');
    expect(emotions.sad.cheek).toBe(0.1);
  });
});
