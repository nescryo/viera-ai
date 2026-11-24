import type {
  ClothHit,
  ClothRegion,
  ClothSide,
  CoordConverter,
  InternalModelLike,
  ParamAccessors,
  Spring1D,
} from './types';
import {
  clamp,
  collectPartDrawables,
  hitVisible,
  resolveMeshes,
  smoothstep,
  softClamp,
  stepSpring,
} from './math';

export interface ClothTouchController {
  tryPointerDown(clientX: number, clientY: number, phase: 'frontTop' | 'midLower' | 'back'): ClothHit | null;
  pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number };
  pointerUp(): void;
  stepPostPhysics(dt: number): void;
  applyVertexDeform(): void;
  reset(): void;
}

const BOW_PARTS = ['Part82', 'Part83', 'Part84'];
const SHOULDER_RIGHT_MESHES = [
  'ArtMesh450', 'ArtMesh449', 'ArtMesh448', 'ArtMesh447',
  'ArtMesh446', 'ArtMesh462', 'ArtMesh445', 'ArtMesh444', 'ArtMesh609',
];
const SHOULDER_LEFT_MESHES = [
  'ArtMesh495', 'ArtMesh494', 'ArtMesh478', 'ArtMesh477',
  'ArtMesh476', 'ArtMesh475', 'ArtMesh463', 'ArtMesh461', 'ArtMesh541',
];
const WAIST_HIT_PARTS = ['Part95', 'Part92', 'Part91', 'Part90'];
const WAIST_EXTRA_MESHES = [
  'ArtMesh451', 'ArtMesh603', 'ArtMesh452', 'ArtMesh631', 'ArtMesh435',
  'ArtMesh442', 'ArtMesh465', 'ArtMesh713',
];
const BACK_BOW_RIGHT_MESHES = ['ArtMesh662', 'ArtMesh663', 'ArtMesh664'];
const BACK_BOW_LEFT_MESHES = ['ArtMesh665', 'ArtMesh666', 'ArtMesh667'];
const GARTER_LEFT_MESHES = [
  'ArtMesh579', 'ArtMesh569',
  'ArtMesh568', 'ArtMesh567', 'ArtMesh566', 'ArtMesh565', 'ArtMesh564',
  'ArtMesh563', 'ArtMesh562', 'ArtMesh561', 'ArtMesh560', 'ArtMesh559',
];
const GARTER_RIGHT_MESHES = [
  'ArtMesh640', 'ArtMesh637',
  'ArtMesh636', 'ArtMesh635', 'ArtMesh634',
  'ArtMesh577', 'ArtMesh576', 'ArtMesh575', 'ArtMesh574', 'ArtMesh573', 'ArtMesh572', 'ArtMesh571',
];

const SHOULDER_LACE_X: readonly [string, number][] = [['LaceX1', 0.30], ['LaceX2', 0.38]];
const SHOULDER_LACE_Y: readonly [string, number][] = [['LaceY1', 0.30], ['LaceY2', 0.38]];

interface RegionConfig {
  tentLen: number;
  sigma: number;
  eps: number;
  maxPull: number;
  maxInward?: number;
  gain: number;
  springK: number;
  springC: number;
}

const REGION_CONFIG: Record<ClothRegion, RegionConfig> = {
  bow:      { tentLen: 0.036, sigma: 0.056, eps: 0.008, maxPull: 0.020, gain: 0.34, springK: 230, springC: 16 },
  shoulder: { tentLen: 0.042, sigma: 0.064, eps: 0.009, maxPull: 0.023, gain: 0.35, springK: 210, springC: 15.5 },
  waist:    { tentLen: 0.038, sigma: 0.058, eps: 0.009, maxPull: 0.015, maxInward: 0.006, gain: 0.28, springK: 240, springC: 18 },
  backBow:  { tentLen: 0.078, sigma: 0.118, eps: 0.014, maxPull: 0.042, gain: 0.40, springK: 150, springC: 12.5 },
  garter:   { tentLen: 0.026, sigma: 0.040, eps: 0.006, maxPull: 0.016, gain: 0.34, springK: 280, springC: 17 },
};

const DRAG_NORM_PX = 140;

/**
 * Interactive cloth-pinch controller for separate fabric accessories (chest bow/collar,
 * shoulder frills, waist corset/belt, back bow tails, and thigh garter bows).
 */
export function createClothTouchController(
  internal: InternalModelLike,
  params: ParamAccessors,
  coords: CoordConverter,
): ClothTouchController {
  const core = internal.coreModel;
  const raw = core._model;

  const bowDrawables = collectPartDrawables(raw, BOW_PARTS);
  const shoulderLeftDrawables = resolveMeshes(core, SHOULDER_LEFT_MESHES);
  const shoulderRightDrawables = resolveMeshes(core, SHOULDER_RIGHT_MESHES);
  const waistHitDrawables = collectPartDrawables(raw, WAIST_HIT_PARTS);
  const waistDeformDrawables = Array.from(new Set([
    ...waistHitDrawables,
    ...resolveMeshes(core, WAIST_EXTRA_MESHES),
  ]));
  const waistInvMaskIdx = core.getDrawableIndex('ArtMesh713');
  const backBowLeftDrawables = resolveMeshes(core, BACK_BOW_LEFT_MESHES);
  const backBowRightDrawables = resolveMeshes(core, BACK_BOW_RIGHT_MESHES);
  const garterLeftDrawables = resolveMeshes(core, GARTER_LEFT_MESHES);
  const garterRightDrawables = resolveMeshes(core, GARTER_RIGHT_MESHES);

  let activeRegion: ClothRegion | null = null;
  let lastRegion: ClothRegion | null = null;
  let activeSide: ClothSide = 'center';
  let startClientX = 0;
  let startClientY = 0;
  let startUnitX = 0;
  let startUnitY = 0;
  const anchor = { x: 0, y: 0 };

  const target = { x: 0, y: 0 };
  const springX: Spring1D = { x: 0, v: 0 };
  const springY: Spring1D = { x: 0, v: 0 };

  const beginGrab = (
    region: ClothRegion,
    side: ClothSide,
    clientX: number,
    clientY: number,
    ux: number,
    uy: number,
  ): ClothHit => {
    activeRegion = region;
    lastRegion = region;
    activeSide = side;
    startClientX = clientX;
    startClientY = clientY;
    startUnitX = ux;
    startUnitY = uy;
    anchor.x = ux;
    anchor.y = uy;
    target.x = 0;
    target.y = 0;
    return { region, side };
  };

  return {
    stepPostPhysics(dt: number): void {
      const region = activeRegion ?? lastRegion;
      if (!region) return;
      const cfg = REGION_CONFIG[region];

      stepSpring(springX, activeRegion ? target.x : 0, cfg.springK, cfg.springC, dt);
      stepSpring(springY, activeRegion ? target.y : 0, cfg.springK, cfg.springC, dt);

      if (!activeRegion && Math.abs(springX.x) < 1e-5 && Math.abs(springY.x) < 1e-5) {
        springX.x = springX.v = 0;
        springY.x = springY.v = 0;
        lastRegion = null;
        return;
      }

      if (region === 'shoulder') {
        const nx = clamp(springX.x / cfg.maxPull, -1, 1);
        const ny = clamp(springY.x / cfg.maxPull, -1, 1);
        for (const [id, gain] of SHOULDER_LACE_X) params.addScaled(id, nx * gain);
        for (const [id, gain] of SHOULDER_LACE_Y) params.addScaled(id, ny * gain);
      }
    },

    applyVertexDeform(): void {
      const dr = raw?.drawables;
      const region = activeRegion ?? lastRegion;
      if (!dr || !region) return;
      const sx = springX.x;
      const sy = springY.x;
      if (Math.abs(sx) < 1e-5 && Math.abs(sy) < 1e-5) return;

      const cfg = REGION_CONFIG[region];
      const eps2 = cfg.eps * cfg.eps;
      const invTent = 1 / cfg.tentLen;
      const inv2Sigma2 = 1 / (2 * cfg.sigma * cfg.sigma);
      const cutoff2 = (cfg.sigma * 3.5) * (cfg.sigma * 3.5);

      let list: readonly number[];
      if (region === 'bow') {
        list = bowDrawables;
      } else if (region === 'shoulder') {
        list = activeSide === 'left' ? shoulderLeftDrawables : shoulderRightDrawables;
      } else if (region === 'waist') {
        list = waistDeformDrawables;
      } else if (region === 'backBow') {
        list = activeSide === 'left' ? backBowLeftDrawables : backBowRightDrawables;
      } else {
        list = activeSide === 'left' ? garterLeftDrawables : garterRightDrawables;
      }

      const legCenterX = activeSide === 'left' ? -0.078 : 0.078;

      for (const dIdx of list) {
        const vp = dr.vertexPositions[dIdx];
        if (!vp) continue;
        const waistMaskOutwardOnly = region === 'waist' && dIdx === waistInvMaskIdx;

        for (let i = 0; i < vp.length; i += 2) {
          const vx = vp[i];
          const vy = vp[i + 1];
          const rx = vx - anchor.x;
          const ry = vy - anchor.y;
          const d2 = rx * rx + ry * ry;
          if (d2 > cutoff2) continue;

          let seamWeight = 1;
          if (region === 'bow') {
            seamWeight = 1 - 0.85 * smoothstep(0.46, 0.508, vy);
          } else if (region === 'shoulder') {
            seamWeight = smoothstep(0.068, 0.098, Math.abs(vx));
          } else if (region === 'waist') {
            seamWeight = 1 - smoothstep(0.285, 0.322, vy);
          } else if (region === 'backBow') {
            seamWeight = smoothstep(0.032, 0.095, Math.abs(vx));
          } else if (region === 'garter') {
            const pullDirX = sx >= 0 ? 1 : -1;
            const alongPull = (vx - legCenterX) * pullDirX;
            seamWeight = 0.25 + 0.75 * smoothstep(-0.065, 0.025, alongPull);
          }
          if (seamWeight <= 1e-4) continue;

          const rSmooth = Math.sqrt(d2 + eps2) - cfg.eps;
          const wTent = 0.65 * Math.exp(-rSmooth * invTent) + 0.35 * Math.exp(-d2 * inv2Sigma2);
          const w = wTent * seamWeight;

          let dx = sx * w;
          const dy = sy * w;
          if (waistMaskOutwardOnly) {
            const isOutward = vx < 0 ? dx < 0 : dx > 0;
            if (!isOutward) dx = 0;
          }
          vp[i] = vx + dx;
          vp[i + 1] = vy + dy;
        }
      }
    },

    tryPointerDown(clientX: number, clientY: number, phase: 'frontTop' | 'midLower' | 'back'): ClothHit | null {
      const u = coords.screenToUnit(clientX, clientY);

      if (phase === 'frontTop') {
        if (hitVisible(raw, bowDrawables, u.x, u.y)) {
          const side: ClothSide = u.x < -0.02 ? 'left' : u.x > 0.02 ? 'right' : 'center';
          return beginGrab('bow', side, clientX, clientY, u.x, u.y);
        }
        if (hitVisible(raw, shoulderLeftDrawables, u.x, u.y)) {
          return beginGrab('shoulder', 'left', clientX, clientY, u.x, u.y);
        }
        if (hitVisible(raw, shoulderRightDrawables, u.x, u.y)) {
          return beginGrab('shoulder', 'right', clientX, clientY, u.x, u.y);
        }
        return null;
      }

      if (phase === 'midLower') {
        if (u.y <= 0.295 && u.y >= 0.172 && hitVisible(raw, waistHitDrawables, u.x, u.y)) {
          const side: ClothSide = u.x < -0.03 ? 'left' : u.x > 0.03 ? 'right' : 'center';
          return beginGrab('waist', side, clientX, clientY, u.x, u.y);
        }
        if (hitVisible(raw, garterLeftDrawables, u.x, u.y)) {
          return beginGrab('garter', 'left', clientX, clientY, u.x, u.y);
        }
        if (hitVisible(raw, garterRightDrawables, u.x, u.y)) {
          return beginGrab('garter', 'right', clientX, clientY, u.x, u.y);
        }
        return null;
      }

      if (hitVisible(raw, backBowLeftDrawables, u.x, u.y)) {
        return beginGrab('backBow', 'left', clientX, clientY, u.x, u.y);
      }
      if (hitVisible(raw, backBowRightDrawables, u.x, u.y)) {
        return beginGrab('backBow', 'right', clientX, clientY, u.x, u.y);
      }
      return null;
    },

    pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number } {
      if (!activeRegion) return { dragX: 0, dragY: 0 };
      const cfg = REGION_CONFIG[activeRegion];
      const u = coords.screenToUnit(clientX, clientY);
      const rawDx = (u.x - startUnitX) * cfg.gain;
      const rawDy = (u.y - startUnitY) * cfg.gain;

      if (activeRegion === 'waist' && cfg.maxInward !== undefined) {
        const inward = activeSide === 'left' ? rawDx > 0 : activeSide === 'right' ? rawDx < 0 : false;
        target.x = softClamp(rawDx, inward ? cfg.maxInward : cfg.maxPull);
        target.y = softClamp(rawDy, cfg.maxPull * 0.7);
      } else {
        target.x = softClamp(rawDx, cfg.maxPull);
        target.y = softClamp(rawDy, cfg.maxPull * 0.85);
      }

      return {
        dragX: clamp((clientX - startClientX) / DRAG_NORM_PX, -1, 1),
        dragY: clamp((startClientY - clientY) / DRAG_NORM_PX, -1, 1),
      };
    },

    pointerUp(): void {
      activeRegion = null;
      target.x = 0;
      target.y = 0;
    },

    reset(): void {
      activeRegion = null;
      lastRegion = null;
      target.x = target.y = 0;
      springX.x = springX.v = 0;
      springY.x = springY.v = 0;
    },
  };
}
