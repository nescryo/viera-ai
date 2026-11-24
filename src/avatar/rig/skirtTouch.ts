import type {
  CoordConverter,
  InternalModelLike,
  ParamAccessors,
  RawCubismModel,
  SkirtSide,
  Spring1D,
} from './types';
import {
  clamp,
  collectPartDrawables,
  hitVisible,
  smoothstep,
  softClamp,
  stepSpring,
} from './math';

export interface SkirtTouchController {
  tryPointerDown(clientX: number, clientY: number): SkirtSide | null;
  pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number };
  pointerUp(): void;
  stepPostPhysics(dt: number): void;
  applyVertexDeform(): void;
  reset(): void;
}

// Skirt parts in DeepSeek-chan's `.moc3`:
// - Short skirt (default): Part97 (front + apron + lace), Part125 (back lining)
// - Long skirt: Part107 (front), Part126 (back)
const SHORT_FRONT_PARTS = ['Part97'];
const SHORT_BACK_PARTS = ['Part125'];
const LONG_FRONT_PARTS = ['Part107'];
const LONG_BACK_PARTS = ['Part126'];

const SKIRT_X_PARAMS: readonly [string, number][] = [
  ['SkirtX1', 0.32],
  ['SkirtX2', 0.44],
  ['SkirtX3', 0.56],
  ['SkirtSpecial2', 0.34],
];
const APRON_X_PARAMS: readonly [string, number][] = [
  ['SkirtLayerX1', 0.55],
  ['SkirtLayerX2', 0.65],
  ['SkirtLayerX3', 0.50],
];
const APRON_Y_PARAMS: readonly [string, number][] = [
  ['SkirtLayerY1', 0.55],
  ['SkirtLayerY2', 0.65],
  ['SkirtLayerY3', 0.45],
];
const LOWER_X_PARAMS: readonly [string, number][] = [
  ['SkirtLayerX4', 0.55],
  ['SkirtLayerX5', 0.65],
];
const LOWER_Y_PARAMS: readonly [string, number][] = [
  ['SkirtLayerY4', 0.50],
  ['SkirtLayerY5', 0.60],
];
// Verified dedicated vertical hem chains:
// - Short skirt: SkirtY6 -> SkirtY7 -> SkirtY9
// - Long skirt:  SkirtY -> SkirtY2 -> SkirtY3 -> SkirtY4
const SHORT_VERTICAL_CHAIN: readonly [string, number][] = [
  ['SkirtY6', 0.42],
  ['SkirtY7', 0.48],
  ['SkirtY9', 0.52],
];
const LONG_VERTICAL_CHAIN: readonly [string, number][] = [
  ['SkirtY', 0.44],
  ['SkirtY2', 0.48],
  ['SkirtY3', 0.52],
  ['SkirtY4', 0.46],
];
const VERT_K = [118, 94, 76, 68] as const;
const VERT_C = [10.2, 8.2, 6.8, 6.2] as const;

const WAIST_FREE_Y = 0.08;
const WAIST_LOCK_Y = 0.218;

const PINCH_K = 185;
const PINCH_C = 14.5;
const SWAY_K = 95;
const SWAY_C = 8.5;
const SWAY_DRAG_RANGE = 180;

function includeInternalMasks(
  raw: RawCubismModel | undefined,
  drawables: readonly number[],
  allowedSet: Set<number>,
): number[] {
  const out = new Set<number>(drawables);
  const dr = raw?.drawables;
  if (!dr) return Array.from(out);
  for (const idx of drawables) {
    const mc = dr.maskCounts[idx];
    const masks = dr.masks[idx];
    for (let m = 0; m < mc; m++) {
      const mid = masks[m];
      if (allowedSet.has(mid)) out.add(mid);
    }
  }
  return Array.from(out);
}

/**
 * Interactive skirt pinch & cascading hem wave controller supporting both short (`SkirtY6/7/9`)
 * and long (`SkirtY/Y2/Y3/Y4`) skirts with waistband-locked local cloth vertex deformation.
 */
export function createSkirtTouchController(
  internal: InternalModelLike,
  params: ParamAccessors,
  coords: CoordConverter,
): SkirtTouchController {
  const raw = internal.coreModel._model;

  const shortFrontRaw = collectPartDrawables(raw, SHORT_FRONT_PARTS);
  const shortBackRaw = collectPartDrawables(raw, SHORT_BACK_PARTS);
  const longFrontRaw = collectPartDrawables(raw, LONG_FRONT_PARTS);
  const longBackRaw = collectPartDrawables(raw, LONG_BACK_PARTS);

  const shortAllSet = new Set<number>([...shortFrontRaw, ...shortBackRaw]);
  const longAllSet = new Set<number>([...longFrontRaw, ...longBackRaw]);

  const shortFront = includeInternalMasks(raw, shortFrontRaw, shortAllSet);
  const shortBack = includeInternalMasks(raw, shortBackRaw, shortAllSet);
  const longFront = includeInternalMasks(raw, longFrontRaw, longAllSet);
  const longBack = includeInternalMasks(raw, longBackRaw, longAllSet);

  let active = false;
  let isLong = false;
  let isApron = false;
  let grabSide: SkirtSide = 'center';
  let startClientX = 0;
  let startClientY = 0;
  let startUnitX = 0;
  let startUnitY = 0;
  const anchor = { x: 0, y: 0 };

  const pinchTarget = { x: 0, y: 0 };
  const pinchSpringX: Spring1D = { x: 0, v: 0 };
  const pinchSpringY: Spring1D = { x: 0, v: 0 };

  const swayTarget = { x: 0, y: 0 };
  const swaySpringX: Spring1D = { x: 0, v: 0 };
  const swaySpringY: Spring1D = { x: 0, v: 0 };

  const vertWave: [Spring1D, Spring1D, Spring1D, Spring1D] = [
    { x: 0, v: 0 },
    { x: 0, v: 0 },
    { x: 0, v: 0 },
    { x: 0, v: 0 },
  ];

  return {
    stepPostPhysics(dt: number): void {
      stepSpring(pinchSpringX, active ? pinchTarget.x : 0, PINCH_K, PINCH_C, dt);
      stepSpring(pinchSpringY, active ? pinchTarget.y : 0, PINCH_K, PINCH_C, dt);
      stepSpring(swaySpringX, active ? swayTarget.x : 0, SWAY_K, SWAY_C, dt);
      stepSpring(swaySpringY, active ? swayTarget.y : 0, SWAY_K, SWAY_C, dt);

      const sideLift = Math.abs(swaySpringX.x) * 0.16;
      const vertDrive = clamp((active ? swayTarget.y : 0) + sideLift, -0.75, 0.95);
      let vertActive = false;
      for (let i = 0; i < vertWave.length; i++) {
        const t = i === 0 ? vertDrive : vertWave[i - 1].x * 0.78 + vertDrive * 0.28;
        stepSpring(vertWave[i], t, VERT_K[i], VERT_C[i], dt);
        if (Math.abs(vertWave[i].x) > 1e-4 || Math.abs(vertWave[i].v) > 1e-3) vertActive = true;
      }

      if (!active && !vertActive && Math.abs(swaySpringX.x) < 1e-4 && Math.abs(swaySpringY.x) < 1e-4) return;

      const sx = clamp(swaySpringX.x, -1, 1);
      const sy = clamp(swaySpringY.x, -1, 1);
      const apronBoost = isApron ? 1.15 : 0.65;
      const lowerBoost = isApron ? 0.6 : 1.0;

      for (const [id, gain] of SKIRT_X_PARAMS) params.addScaled(id, sx * gain);
      for (const [id, gain] of APRON_X_PARAMS) params.addScaled(id, sx * gain * apronBoost);
      for (const [id, gain] of APRON_Y_PARAMS) params.addScaled(id, sy * gain * apronBoost);
      for (const [id, gain] of LOWER_X_PARAMS) params.addScaled(id, sx * gain * lowerBoost);
      for (const [id, gain] of LOWER_Y_PARAMS) params.addScaled(id, sy * gain * lowerBoost);

      const vertChain = isLong ? LONG_VERTICAL_CHAIN : SHORT_VERTICAL_CHAIN;
      for (let i = 0; i < vertChain.length; i++) {
        const [id, gain] = vertChain[i];
        params.addScaled(id, clamp(vertWave[i].x, -1, 1) * gain);
      }
    },

    applyVertexDeform(): void {
      const dr = raw?.drawables;
      if (!dr) return;
      const sx = pinchSpringX.x;
      const sy = pinchSpringY.x;
      if (Math.abs(sx) < 1e-5 && Math.abs(sy) < 1e-5) return;

      const sigma = isLong ? 0.16 : 0.11;
      const inv2Sigma2 = 1 / (2 * sigma * sigma);
      const cutoff2 = (sigma * 3.4) * (sigma * 3.4);
      const frontList = isLong ? longFront : shortFront;
      const backList = isLong ? longBack : shortBack;

      const outwardPull = grabSide === 'left' ? Math.max(0, -sx)
        : grabSide === 'right' ? Math.max(0, sx)
          : Math.abs(sx) * 0.35;
      const arcLift = outwardPull * 0.18;

      const deformList = (list: readonly number[], scale: number): void => {
        const dxBase = sx * scale;
        const dyBase = (sy + arcLift) * scale;
        for (const dIdx of list) {
          const vp = dr.vertexPositions[dIdx];
          if (!vp) continue;
          for (let i = 0; i < vp.length; i += 2) {
            const vx = vp[i];
            const vy = vp[i + 1];
            if (vy >= WAIST_LOCK_Y) continue;
            const rx = vx - anchor.x;
            const ry = vy - anchor.y;
            const d2 = rx * rx + ry * ry;
            if (d2 > cutoff2) continue;

            const waistFree = 1 - smoothstep(WAIST_FREE_Y, WAIST_LOCK_Y, vy);
            if (waistFree <= 1e-4) continue;

            const w = Math.exp(-d2 * inv2Sigma2) * waistFree;
            vp[i] = vx + dxBase * w;
            vp[i + 1] = vy + dyBase * w;
          }
        }
      };

      deformList(frontList, 1.0);
      deformList(backList, 0.45);
    },

    tryPointerDown(clientX: number, clientY: number): SkirtSide | null {
      const u = coords.screenToUnit(clientX, clientY);
      if (u.y > WAIST_LOCK_Y - 0.015) return null;

      const opacities = raw?.drawables?.opacities;
      if (!opacities) return null;
      const longVisible = longFrontRaw.some((i) => opacities[i] > 0.05);
      const hitFront = longVisible ? longFrontRaw : shortFrontRaw;
      const hitBack = longVisible ? longBackRaw : shortBackRaw;

      const hit = hitVisible(raw, hitFront, u.x, u.y) || hitVisible(raw, hitBack, u.x, u.y);
      if (!hit) return null;

      active = true;
      isLong = longVisible;
      isApron = !longVisible && Math.abs(u.x) < 0.135 && u.y > -0.055;
      grabSide = u.x < -0.07 ? 'left' : u.x > 0.07 ? 'right' : 'center';
      startClientX = clientX;
      startClientY = clientY;
      startUnitX = u.x;
      startUnitY = u.y;
      anchor.x = u.x;
      anchor.y = Math.min(u.y, WAIST_LOCK_Y - 0.05);
      pinchTarget.x = pinchTarget.y = 0;
      swayTarget.x = swayTarget.y = 0;
      return grabSide;
    },

    pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number } {
      if (!active) return { dragX: 0, dragY: 0 };
      const u = coords.screenToUnit(clientX, clientY);
      const rawDx = u.x - startUnitX;
      const rawDy = u.y - startUnitY;

      const maxX = isLong ? 0.078 : 0.052;
      const maxUp = isLong ? 0.042 : 0.028;
      const maxDown = isLong ? 0.032 : 0.022;
      const gainX = isLong ? 0.55 : 0.50;
      const gainY = isLong ? 0.40 : 0.36;

      pinchTarget.x = softClamp(rawDx * gainX, maxX);
      pinchTarget.y = rawDy >= 0
        ? softClamp(rawDy * gainY, maxUp)
        : softClamp(rawDy * gainY, maxDown);

      const nx = clamp((clientX - startClientX) / SWAY_DRAG_RANGE, -1, 1);
      const ny = clamp((startClientY - clientY) / SWAY_DRAG_RANGE, -1, 1);
      swayTarget.x = nx * 0.65;
      swayTarget.y = ny >= 0 ? ny * 0.55 : ny * 0.4;
      return { dragX: nx, dragY: ny };
    },

    pointerUp(): void {
      active = false;
      pinchTarget.x = pinchTarget.y = 0;
      swayTarget.x = swayTarget.y = 0;
    },

    reset(): void {
      active = false;
      pinchTarget.x = pinchTarget.y = 0;
      swayTarget.x = swayTarget.y = 0;
      pinchSpringX.x = pinchSpringX.v = 0;
      pinchSpringY.x = pinchSpringY.v = 0;
      swaySpringX.x = swaySpringX.v = 0;
      swaySpringY.x = swaySpringY.v = 0;
      for (const s of vertWave) {
        s.x = 0;
        s.v = 0;
      }
    },
  };
}
