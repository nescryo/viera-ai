import type {
  CoordConverter,
  InternalModelLike,
  ParamAccessors,
  Spring1D,
  TailZone,
} from './types';
import {
  clamp,
  collectPartDrawables,
  drawableCentroid,
  hitVisible,
  resolveMeshes,
  smoothstep,
  softClamp,
  stepSpring,
} from './math';

export interface TailTouchController {
  tryPointerDown(clientX: number, clientY: number): TailZone | null;
  pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number };
  pointerUp(): void;
  stepPostPhysics(dt: number): void;
  applyVertexDeform(): void;
  reset(): void;
}

const TAIL_ROOT_PART = 'Part136';
const LEG_OCCLUDER_MESHES = ['ArtMesh584', 'ArtMesh653', 'ArtMesh582', 'ArtMesh643'];

const SEGMENT_MESHES = [
  ['ArtMesh734', 'ArtMesh676'],
  ['ArtMesh735', 'ArtMesh677'],
  ['ArtMesh736', 'ArtMesh716'],
  ['ArtMesh737', 'ArtMesh717'],
  ['ArtMesh738', 'ArtMesh718', 'ArtMesh668', 'ArtMesh671', 'ArtMesh745'],
];

const JOINTS = [
  { param: 'Param_Angle_Rotation84', px: -0.035, py:  0.100, maxDeg: 24, k: 105, c: 8.2 },
  { param: 'Param_Angle_Rotation85', px: -0.213, py: -0.209, maxDeg: 30, k:  95, c: 7.4 },
  { param: 'Param_Angle_Rotation86', px: -0.136, py: -0.532, maxDeg: 32, k:  85, c: 6.6 },
  { param: 'Param_Angle_Rotation87', px: -0.034, py: -0.665, maxDeg: 34, k:  78, c: 6.0 },
  { param: 'Param_Angle_Rotation88', px:  0.269, py: -0.636, maxDeg: 36, k:  72, c: 5.5 },
] as const;

const FLIP_PARAM = 'Param52';
const FLIP_K = 90;
const FLIP_C = 7.5;

const SQUISH_SIGMA = 0.078;
const SQUISH_MAX = 0.014;
const SQUISH_K = 220;
const SQUISH_C = 16;
const ROOT_LOCK_Y = 0.06;
const DRAG_NORM_PX = 180;

/**
 * Interactive 5-bone whale tail controller with CCW tangent joint distribution,
 * fluke perspective flip (`Param52`), startled twitch impulse, and local plush squish.
 */
export function createTailTouchController(
  internal: InternalModelLike,
  params: ParamAccessors,
  coords: CoordConverter,
): TailTouchController {
  const core = internal.coreModel;
  const raw = core._model;

  const tailDrawables = collectPartDrawables(raw, [TAIL_ROOT_PART]);
  const legOccluders = resolveMeshes(core, LEG_OCCLUDER_MESHES);
  const segmentIndices = SEGMENT_MESHES.map((group) => resolveMeshes(core, group));

  let active = false;
  let grabSeg = 4;
  let startClientX = 0;
  let startClientY = 0;
  let startUnitX = 0;
  let startUnitY = 0;
  const anchor = { x: 0.3, y: -0.4 };

  const jointTargets = JOINTS.map(() => 0);
  const jointSprings: Spring1D[] = JOINTS.map(() => ({ x: 0, v: 0 }));
  let flipTarget = 0;
  const flipSpring: Spring1D = { x: 0, v: 0 };

  const squishTarget = { x: 0, y: 0 };
  const squishSpringX: Spring1D = { x: 0, v: 0 };
  const squishSpringY: Spring1D = { x: 0, v: 0 };

  return {
    stepPostPhysics(dt: number): void {
      let anyJointActive = active;
      for (let j = 0; j < JOINTS.length; j++) {
        const cfg = JOINTS[j];
        let t = active ? jointTargets[j] : 0;
        if (active && j > grabSeg) {
          t = clamp(-jointSprings[j - 1].v * 0.12, -16, 16);
        }
        stepSpring(jointSprings[j], t, cfg.k, cfg.c, dt);
        if (Math.abs(jointSprings[j].x) > 0.02 || Math.abs(jointSprings[j].v) > 0.05) {
          anyJointActive = true;
        }
      }

      stepSpring(flipSpring, active ? flipTarget : 0, FLIP_K, FLIP_C, dt);
      if (Math.abs(flipSpring.x) > 1e-3 || Math.abs(flipSpring.v) > 1e-3) anyJointActive = true;

      stepSpring(squishSpringX, active ? squishTarget.x : 0, SQUISH_K, SQUISH_C, dt);
      stepSpring(squishSpringY, active ? squishTarget.y : 0, SQUISH_K, SQUISH_C, dt);

      if (!anyJointActive) return;

      for (let j = 0; j < JOINTS.length; j++) {
        params.addParam(JOINTS[j].param, jointSprings[j].x);
      }
      if (Math.abs(flipSpring.x) > 1e-3) {
        params.addParam(FLIP_PARAM, clamp(flipSpring.x, -1, 1));
      }
    },

    applyVertexDeform(): void {
      const dr = raw?.drawables;
      if (!dr) return;
      const sx = squishSpringX.x;
      const sy = squishSpringY.x;
      if (Math.abs(sx) < 1e-5 && Math.abs(sy) < 1e-5) return;

      const segGroup = segmentIndices[grabSeg];
      const segCenter = segGroup.length > 0 ? drawableCentroid(raw, segGroup[0], 0, -0.5) : anchor;
      const cx = segCenter.x;
      const cy = segCenter.y;
      const inv2Sigma2 = 1 / (2 * SQUISH_SIGMA * SQUISH_SIGMA);
      const cutoff2 = (SQUISH_SIGMA * 3.4) * (SQUISH_SIGMA * 3.4);

      for (const dIdx of tailDrawables) {
        const vp = dr.vertexPositions[dIdx];
        if (!vp) continue;
        for (let i = 0; i < vp.length; i += 2) {
          const vx = vp[i];
          const vy = vp[i + 1];
          if (vy >= ROOT_LOCK_Y) continue;
          const rx = vx - cx;
          const ry = vy - cy;
          const d2 = rx * rx + ry * ry;
          if (d2 > cutoff2) continue;

          const rootFree = 1 - smoothstep(-0.08, ROOT_LOCK_Y, vy);
          if (rootFree <= 1e-4) continue;
          const w = Math.exp(-d2 * inv2Sigma2) * rootFree;
          vp[i] = vx + sx * w;
          vp[i + 1] = vy + sy * w;
        }
      }
    },

    tryPointerDown(clientX: number, clientY: number): TailZone | null {
      const opacities = raw?.drawables?.opacities;
      if (!opacities || !tailDrawables.some((i) => opacities[i] > 0.05)) return null;

      const u = coords.screenToUnit(clientX, clientY);
      if (hitVisible(raw, legOccluders, u.x, u.y)) return null;
      if (!hitVisible(raw, tailDrawables, u.x, u.y)) return null;

      let foundSeg = -1;
      for (let s = segmentIndices.length - 1; s >= 0; s--) {
        if (hitVisible(raw, segmentIndices[s], u.x, u.y)) {
          foundSeg = s;
          break;
        }
      }
      if (foundSeg < 0) {
        let bestDist = Infinity;
        for (let s = 0; s < segmentIndices.length; s++) {
          if (segmentIndices[s].length === 0) continue;
          const c = drawableCentroid(raw, segmentIndices[s][0], 0, -0.5);
          const dist = Math.hypot(u.x - c.x, u.y - c.y);
          if (dist < bestDist) {
            bestDist = dist;
            foundSeg = s;
          }
        }
      }

      active = true;
      grabSeg = Math.max(0, Math.min(JOINTS.length - 1, foundSeg));
      startClientX = clientX;
      startClientY = clientY;
      startUnitX = u.x;
      startUnitY = u.y;
      anchor.x = u.x;
      anchor.y = u.y;
      for (let j = 0; j < JOINTS.length; j++) jointTargets[j] = 0;
      flipTarget = 0;
      squishTarget.x = squishTarget.y = 0;

      const twitchSign = u.x >= 0 ? 1 : -1;
      for (let j = 0; j <= grabSeg; j++) {
        jointSprings[j].v += twitchSign * (28 + j * 14);
      }

      return u.x < -0.05 ? 'left' : u.x > 0.14 ? 'right' : 'bottom';
    },

    pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number } {
      if (!active) return { dragX: 0, dragY: 0 };
      const u = coords.screenToUnit(clientX, clientY);
      const dx = u.x - startUnitX;
      const dy = u.y - startUnitY;

      let weightSum = 0;
      const weights: number[] = [];
      for (let j = 0; j <= grabSeg; j++) {
        const w = 0.55 + 0.45 * ((j + 1) / (grabSeg + 1));
        weights.push(w);
        weightSum += w;
      }

      for (let j = 0; j < JOINTS.length; j++) {
        if (j > grabSeg) {
          jointTargets[j] = 0;
          continue;
        }
        const cfg = JOINTS[j];
        const rx = startUnitX - cfg.px;
        const ry = startUnitY - cfg.py;
        const len = Math.hypot(rx, ry);
        if (len < 1e-4) {
          jointTargets[j] = 0;
          continue;
        }
        const tx = -ry / len;
        const ty = rx / len;
        const proj = dx * tx + dy * ty;
        const share = (weights[j] / weightSum) * 1.45;
        const deg = (proj / (len + 0.12)) * (180 / Math.PI) * share;
        jointTargets[j] = softClamp(deg, cfg.maxDeg);
      }

      flipTarget = grabSeg >= 3
        ? softClamp(-dy * 2.4 + dx * 0.9, 0.8)
        : softClamp(dx * 0.8, 0.35);

      squishTarget.x = softClamp(dx * 0.14, SQUISH_MAX);
      squishTarget.y = softClamp(dy * 0.14, SQUISH_MAX);

      return {
        dragX: clamp((clientX - startClientX) / DRAG_NORM_PX, -1, 1),
        dragY: clamp((startClientY - clientY) / DRAG_NORM_PX, -1, 1),
      };
    },

    pointerUp(): void {
      active = false;
      for (let j = 0; j < JOINTS.length; j++) jointTargets[j] = 0;
      flipTarget = 0;
      squishTarget.x = squishTarget.y = 0;
    },

    reset(): void {
      active = false;
      for (let j = 0; j < JOINTS.length; j++) {
        jointTargets[j] = 0;
        jointSprings[j].x = jointSprings[j].v = 0;
      }
      flipTarget = 0;
      flipSpring.x = flipSpring.v = 0;
      squishTarget.x = squishTarget.y = 0;
      squishSpringX.x = squishSpringX.v = 0;
      squishSpringY.x = squishSpringY.v = 0;
    },
  };
}
