import { describe, expect, it } from 'vitest';
import {
  canStartRigPointerDown,
  type PassThroughElementLike,
  type PassThroughFeedLike,
} from '../src/avatar/rig/createDeepSeekRig';
import {
  ARM_REST_HAND_LOCAL_X,
  ARM_REST_HAND_LOCAL_Y,
  computeEmotionMoodOffsets,
  createParamAccessors,
  pointInTriangleMesh,
  smoothstep,
  softClamp,
  solveArmIK,
  stepHairChain,
  stepSpring,
} from '../src/avatar/rig/math';
import type { CoreModelLike, Spring1D } from '../src/avatar/rig/types';

function makeMockCore(defs: Record<string, { min: number; max: number; value?: number }>): CoreModelLike {
  const ids = Object.keys(defs);
  const values = ids.map((id) => defs[id].value ?? 0);
  const mins = ids.map((id) => defs[id].min);
  const maxs = ids.map((id) => defs[id].max);

  return {
    getParameterIndex: (id: string) => ids.indexOf(id),
    getParameterMinimumValue: (index: number) => mins[index],
    getParameterMaximumValue: (index: number) => maxs[index],
    getParameterValueById: (id: string) => {
      const i = ids.indexOf(id);
      return i >= 0 ? values[i] : 0;
    },
    getParameterValueByIndex: (index: number) => values[index],
    setParameterValueById: (id: string, value: number) => {
      const i = ids.indexOf(id);
      if (i >= 0) values[i] = value;
    },
    addParameterValueById: (id: string, value: number) => {
      const i = ids.indexOf(id);
      if (i >= 0) values[i] += value;
    },
    getDrawableIndex: () => -1,
    update: () => {},
  };
}

describe('stepSpring', () => {
  it('converges smoothly to target and stays stable even with stiff springs and large dt', () => {
    const s: Spring1D = { x: 0, v: 0 };
    // High stiffness (clothTouch garter K=280) with large 0.1s frame drop
    for (let i = 0; i < 40; i++) stepSpring(s, 1, 280, 17, 0.1);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(s.x).toBeCloseTo(1, 3);
    expect(Math.abs(s.v)).toBeLessThan(0.01);
  });

  it('ignores non-positive dt', () => {
    const s: Spring1D = { x: 0.25, v: 0.5 };
    stepSpring(s, 1, 100, 10, 0);
    expect(s).toEqual({ x: 0.25, v: 0.5 });
  });
});

describe('stepHairChain', () => {
  it('propagates a root impulse down a multi-segment chain and stays bounded', () => {
    const segs: Spring1D[] = Array.from({ length: 4 }, () => ({ x: 0, v: 0 }));
    const kArr = [115, 92, 74, 60] as const;
    const cArr = [8.4, 7.5, 6.7, 6.0] as const;

    // Early step: root reacts faster than tips
    for (let i = 0; i < 6; i++) stepHairChain(segs, 0.8, kArr, cArr, 1.0, 1 / 60);
    expect(segs[0].x).toBeGreaterThan(segs[3].x);

    // After settling: all segments reach finite bounded deflection
    for (let i = 0; i < 240; i++) stepHairChain(segs, 0.8, kArr, cArr, 1.0, 1 / 60);
    for (const seg of segs) {
      expect(Math.abs(seg.x)).toBeLessThanOrEqual(1.2);
      expect(seg.x).toBeGreaterThan(0.5);
    }
  });
});

describe('solveArmIK', () => {
  it('stays near zero at the measured rest hand position', () => {
    const rest = solveArmIK(ARM_REST_HAND_LOCAL_X, ARM_REST_HAND_LOCAL_Y, 170);
    expect(Math.abs(rest.upper)).toBeLessThan(0.05);
    expect(rest.elbow).toBeGreaterThanOrEqual(0);
    expect(rest.elbow).toBeLessThan(0.05);
  });

  it('never hyperextends the elbow and stays within safe rig limits across reach workspace', () => {
    for (let x = -0.3; x <= 0.6; x += 0.1) {
      for (let y = -0.6; y <= 0.5; y += 0.1) {
        const res = solveArmIK(x, y, 170);
        expect(res.upper).toBeGreaterThanOrEqual(-0.62);
        expect(res.upper).toBeLessThanOrEqual(0.82);
        expect(res.elbow).toBeGreaterThanOrEqual(0);
        expect(res.elbow).toBeLessThanOrEqual(0.82);
        expect(res.persp).toBeGreaterThanOrEqual(0);
        expect(res.persp).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('curls the elbow when hand pulls closer to the shoulder', () => {
    const rest = solveArmIK(ARM_REST_HAND_LOCAL_X, ARM_REST_HAND_LOCAL_Y, 170);
    const curled = solveArmIK(0.15, -0.18, 170);
    expect(curled.elbow).toBeGreaterThan(rest.elbow + 0.2);
  });
});

describe('pointInTriangleMesh', () => {
  const quadVerts = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  it('detects interior points and rejects exterior points', () => {
    expect(pointInTriangleMesh(quadVerts, quadIndices, 0.5, 0.5)).toBe(true);
    expect(pointInTriangleMesh(quadVerts, quadIndices, 0.1, 0.9)).toBe(true);
    expect(pointInTriangleMesh(quadVerts, quadIndices, -0.1, 0.5)).toBe(false);
    expect(pointInTriangleMesh(quadVerts, quadIndices, 1.2, 1.2)).toBe(false);
  });
});

describe('softClamp and smoothstep', () => {
  it('softly saturates within (-lim, +lim)', () => {
    expect(softClamp(0, 1)).toBe(0);
    expect(softClamp(100, 0.5)).toBeLessThanOrEqual(0.5);
    expect(softClamp(-100, 0.5)).toBeGreaterThanOrEqual(-0.5);
  });

  it('interpolates smoothly between edges', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });
});

describe('createParamAccessors', () => {
  it('clamps setParam, addParam, and asymmetric addScaled to parameter bounds', () => {
    const core = makeMockCore({
      Angle: { min: -30, max: 30 },
      OneSided: { min: 0, max: 1 },
    });
    const params = createParamAccessors(core);

    params.setParam('Angle', 99);
    expect(params.getParam('Angle')).toBe(30);

    params.addParam('Angle', -100);
    expect(params.getParam('Angle')).toBe(-30);

    params.addScaled('OneSided', 0.6);
    expect(params.getParam('OneSided')).toBeCloseTo(0.6, 5);

    // Negative scaled delta on a [0, 1] parameter does not push below 0
    params.addScaled('OneSided', -0.5);
    expect(params.getParam('OneSided')).toBeCloseTo(0.6, 5);

    // Missing parameters are safely ignored
    expect(params.hasParam('Missing')).toBe(false);
    expect(params.getParam('Missing')).toBe(0);
    params.setParam('Missing', 1);
  });
});

describe('computeEmotionMoodOffsets', () => {
  it('returns neutral defaults for relaxed with no modifiers', () => {
    const mood = computeEmotionMoodOffsets('relaxed', 1, {});
    expect(mood.swayScale).toBe(1);
    expect(mood.earPerk).toBe(0);
    expect(mood.headPitch).toBe(0);
  });

  it('perks whale ears on happy/surprised and droops on sad/blush', () => {
    const happy = computeEmotionMoodOffsets('happy', 1, {});
    const surprised = computeEmotionMoodOffsets('surprised', 1, {});
    const sad = computeEmotionMoodOffsets('sad', 1, {});
    const shy = computeEmotionMoodOffsets('relaxed', 1, { blush: 1 });

    expect(happy.earPerk).toBeGreaterThan(0);
    expect(surprised.earPerk).toBeGreaterThan(happy.earPerk);
    expect(sad.earPerk).toBeLessThan(0);
    expect(sad.swayScale).toBeLessThan(1);
    expect(shy.earPerk).toBeLessThan(0);
  });

  it('scales cleanly with baseWeight', () => {
    const low = computeEmotionMoodOffsets('sad', 0.3, {});
    const high = computeEmotionMoodOffsets('sad', 1, {});
    expect(Math.abs(low.earPerk)).toBeLessThan(Math.abs(high.earPerk));
  });
});

describe('canStartRigPointerDown', () => {
  const canvas = { id: 'canvas' };
  const makeTarget = (opts: {
    interactive?: boolean;
    bubble?: boolean;
    feed?: PassThroughFeedLike | null;
  }): PassThroughElementLike => ({
    closest(selector: string) {
      if (selector.includes('button') && opts.interactive) return {} as PassThroughElementLike;
      if (selector.includes('.chat-bubble') && opts.bubble) return {} as PassThroughElementLike;
      if (selector === '.chat-messages-feed') return opts.feed ?? null;
      return null;
    },
  });

  it('always allows direct canvas clicks', () => {
    expect(canStartRigPointerDown(canvas, canvas, 'mouse')).toBe(true);
    expect(canStartRigPointerDown(canvas, canvas, 'touch')).toBe(true);
  });

  it('allows mouse pass-through on empty space inside .chat-messages-feed', () => {
    const emptyGap = makeTarget({ feed: { scrollHeight: 500, clientHeight: 200 } });
    expect(canStartRigPointerDown(emptyGap, canvas, 'mouse')).toBe(true);
    expect(canStartRigPointerDown(emptyGap, canvas, 'pen')).toBe(true);
  });

  it('blocks clicks on .chat-bubble so message text remains selectable', () => {
    const bubble = makeTarget({ bubble: true, feed: { scrollHeight: 500, clientHeight: 200 } });
    expect(canStartRigPointerDown(bubble, canvas, 'mouse')).toBe(false);
    expect(canStartRigPointerDown(bubble, canvas, 'touch')).toBe(false);
  });

  it('blocks clicks on interactive controls inside .chat-messages-feed', () => {
    const btn = makeTarget({ interactive: true, feed: { scrollHeight: 200, clientHeight: 200 } });
    expect(canStartRigPointerDown(btn, canvas, 'mouse')).toBe(false);
  });

  it('blocks elements outside both canvas and .chat-messages-feed', () => {
    const modalOrInput = makeTarget({ feed: null });
    expect(canStartRigPointerDown(modalOrInput, canvas, 'mouse')).toBe(false);
    expect(canStartRigPointerDown(null, canvas, 'mouse')).toBe(false);
  });

  it('preserves native touch scrolling only when the feed overflows', () => {
    const overflowingFeed = makeTarget({ feed: { scrollHeight: 500, clientHeight: 200 } });
    const shortFeed = makeTarget({ feed: { scrollHeight: 180, clientHeight: 200 } });
    expect(canStartRigPointerDown(overflowingFeed, canvas, 'touch')).toBe(false);
    expect(canStartRigPointerDown(shortFeed, canvas, 'touch')).toBe(true);
  });
});

