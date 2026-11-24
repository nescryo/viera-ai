import type {
  CoordConverter,
  InternalModelLike,
  ParamAccessors,
  Spring1D,
} from './types';
import { clamp, drawableCentroid, softClamp, stepSpring } from './math';

export interface HeadFollowInput {
  enabled: boolean;
  suppressed: boolean;
  patActive: boolean;
  patHappy: number;
  patDragX: number;
  patDragY: number;
}

export interface HeadFollowController {
  setInput(input: HeadFollowInput): void;
  setPointer(clientX: number, clientY: number): void;
  clearPointer(): void;
  getFollowOffset(): { x: number; y: number };
  isPointerActive(): boolean;
  stepPrePhysics(dt: number): void;
  stepPostPhysics(dt: number): void;
  reset(): void;
}

// Verified active maid headdress parameters from DeepSeek-chan's `.moc3`.
const HAT_X_PARAMS = ['Hat_XA', 'Hat_XB', 'Hat_XC'] as const;
const HAT_Y_PARAMS = ['Hat_YA', 'Hat_YB', 'Hat_YC'] as const;

// Head ribbons trailing head motion (chained cascades for smooth ribbon float).
const HEAD_RIBBON_X_A = ['ribbonX1', 'ribbonX2', 'ribbonX3', 'ribbonX4'] as const;
const HEAD_RIBBON_Y_A = ['ribbonY1', 'ribbonY2', 'ribbonY3', 'ribbonY4'] as const;
const HEAD_RIBBON_X_B = ['ribbonX5', 'ribbonX7', 'ribbonX6'] as const;
const HEAD_RIBBON_Y_B = ['ribbonY5', 'ribbonY6', 'ribbonY7'] as const;

// Smooth cursor-tracking spring for head (critically damped feel, no jitter).
const FOLLOW_K = 46;
const FOLLOW_C = 12.6;
// Slightly faster eye tracking spring so eyes naturally lead the head toward the pointer.
const EYE_FOLLOW_K = 96;
const EYE_FOLLOW_C = 17.5;

// Cascading 3-stage springs for maid headdress lace/brim (base -> mid -> tip).
const HAT_X_K = [138, 108, 84] as const;
const HAT_X_C = [11.2, 8.6, 6.8] as const;
const HAT_Y_K = [148, 118, 92] as const;
const HAT_Y_C = [12.0, 9.4, 7.4] as const;

// Cascading 4-stage springs for silky head ribbons.
const RIBBON_X_K = [72, 56, 44, 36] as const;
const RIBBON_X_C = [6.4, 5.4, 4.6, 4.0] as const;
const RIBBON_Y_K = [82, 64, 50, 40] as const;
const RIBBON_Y_C = [7.0, 5.8, 5.0, 4.4] as const;

/**
 * Nose-anchored smooth cursor tracking plus cascading secondary springs for the maid
 * headdress (`Hat_XA..C/YA..C`) and head ribbons (`ribbonX1..7/Y1..7`).
 */
export function createHeadFollowController(
  internal: InternalModelLike,
  params: ParamAccessors,
  coords: CoordConverter,
): HeadFollowController {
  const core = internal.coreModel;
  const raw = core._model;
  const noseIdx = core.getDrawableIndex('ArtMesh46');

  let input: HeadFollowInput = {
    enabled: true,
    suppressed: false,
    patActive: false,
    patHappy: 0,
    patDragX: 0,
    patDragY: 0,
  };

  let pointerActive = false;
  let pointerClientX = 0;
  let pointerClientY = 0;

  // Normalized follow cursor springs (-1..+1): eyes lead, head follows smoothly.
  const followX: Spring1D = { x: 0, v: 0 };
  const followY: Spring1D = { x: 0, v: 0 };
  const eyeFollowX: Spring1D = { x: 0, v: 0 };
  const eyeFollowY: Spring1D = { x: 0, v: 0 };

  // Secondary springs for maid headdress and head ribbons.
  const hatX: [Spring1D, Spring1D, Spring1D] = [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }];
  const hatY: [Spring1D, Spring1D, Spring1D] = [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }];
  const ribX: [Spring1D, Spring1D, Spring1D, Spring1D] = [
    { x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 },
  ];
  const ribY: [Spring1D, Spring1D, Spring1D, Spring1D] = [
    { x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 },
  ];

  let prevAngleX = 0;
  let prevAngleY = 0;
  let prevAngleZ = 0;

  return {
    setInput(next: HeadFollowInput): void {
      input = next;
    },

    setPointer(clientX: number, clientY: number): void {
      pointerActive = true;
      pointerClientX = clientX;
      pointerClientY = clientY;
    },

    clearPointer(): void {
      pointerActive = false;
    },

    getFollowOffset(): { x: number; y: number } {
      return { x: followX.x, y: followY.x };
    },

    isPointerActive(): boolean {
      return pointerActive;
    },

    stepPrePhysics(dt: number): void {
      let tx = 0;
      let ty = 0;
      if (input.enabled && !input.suppressed && pointerActive) {
        const u = coords.screenToUnit(pointerClientX, pointerClientY);
        const faceCenter = drawableCentroid(raw, noseIdx, 0, 0.59);
        // Smooth mapping relative to live face center works at any zoom, framing, or split layout.
        tx = softClamp((u.x - faceCenter.x) / 0.52, 1);
        ty = softClamp((u.y - faceCenter.y) / 0.45, 1);
      }

      stepSpring(followX, tx, FOLLOW_K, FOLLOW_C, dt);
      stepSpring(followY, ty, FOLLOW_K, FOLLOW_C, dt);
      stepSpring(eyeFollowX, tx, EYE_FOLLOW_K, EYE_FOLLOW_C, dt);
      stepSpring(eyeFollowY, ty, EYE_FOLLOW_K, EYE_FOLLOW_C, dt);
    },

    stepPostPhysics(dt: number): void {
      // 1. Apply direct head & eye cursor tracking (eyes slightly lead the head).
      const fx = followX.x;
      const fy = followY.x;
      if (Math.abs(fx) > 1e-4 || Math.abs(fy) > 1e-4) {
        params.addParam('ParamAngleX', fx * 24);
        params.addParam('ParamAngleY', fy * 18);
        params.addParam('ParamAngleZ', fx * -5.5 + fx * fy * -7.5);
      }
      if (Math.abs(eyeFollowX.x) > 1e-4 || Math.abs(eyeFollowY.x) > 1e-4) {
        params.addParam('ParamEyeBallX', clamp(eyeFollowX.x * 0.92, -1, 1));
        params.addParam('ParamEyeBallY', clamp(eyeFollowY.x * 0.82, -1, 1));
      }

      // 2. Read final combined head angles & angular velocity (covers follow, headpat, cheek, chest, ear, idle).
      const ax = params.getParam('ParamAngleX');
      const ay = params.getParam('ParamAngleY');
      const az = params.getParam('ParamAngleZ');
      const invDt = 1 / Math.max(dt, 1 / 120);
      const velX = clamp((ax - prevAngleX) * invDt, -180, 180);
      const velY = clamp((ay - prevAngleY) * invDt, -180, 180);
      const velZ = clamp((az - prevAngleZ) * invDt, -180, 180);
      prevAngleX = ax;
      prevAngleY = ay;
      prevAngleZ = az;

      // 3. Maid headdress (Hat_XA/B/C, Hat_YA/B/C): sways with head tilt/turn + compresses on headpat.
      const hatXDrive = softClamp(
        az * 0.026 + ax * 0.014 - velX * 0.0035 - velZ * 0.004 + (input.patActive ? input.patDragX * 0.72 : 0),
        0.95,
      );
      const hatYDrive = softClamp(
        ay * 0.018 - velY * 0.0045 - input.patHappy * 0.58 + (input.patActive ? input.patDragY * 0.42 : 0),
        0.95,
      );

      for (let i = 0; i < 3; i++) {
        const tx = i === 0 ? hatXDrive : hatX[i - 1].x * 0.78 + hatXDrive * 0.32;
        const ty = i === 0 ? hatYDrive : hatY[i - 1].x * 0.78 + hatYDrive * 0.32;
        stepSpring(hatX[i], clamp(tx, -1, 1), HAT_X_K[i], HAT_X_C[i], dt);
        stepSpring(hatY[i], clamp(ty, -1, 1), HAT_Y_K[i], HAT_Y_C[i], dt);
        params.addParam(HAT_X_PARAMS[i], hatX[i].x);
        params.addParam(HAT_Y_PARAMS[i], hatY[i].x);
      }

      // 4. Head ribbons (ribbonX1..7, ribbonY1..7): light trailing wave from head motion & headpat.
      const ribXDrive = softClamp(
        az * 0.024 + ax * 0.01 - velX * 0.0042 - velZ * 0.0045 + (input.patActive ? input.patDragX * 0.45 : 0),
        0.85,
      );
      const ribYDrive = softClamp(
        -ay * 0.014 - velY * 0.0045 - input.patHappy * 0.25 + (input.patActive ? input.patDragY * 0.3 : 0),
        0.8,
      );

      for (let i = 0; i < 4; i++) {
        const tx = i === 0 ? ribXDrive : ribX[i - 1].x * 0.78 + ribXDrive * 0.28;
        const ty = i === 0 ? ribYDrive : ribY[i - 1].x * 0.78 + ribYDrive * 0.28;
        stepSpring(ribX[i], clamp(tx, -1, 1), RIBBON_X_K[i], RIBBON_X_C[i], dt);
        stepSpring(ribY[i], clamp(ty, -1, 1), RIBBON_Y_K[i], RIBBON_Y_C[i], dt);
        params.addScaled(HEAD_RIBBON_X_A[i], ribX[i].x * 0.48);
        params.addScaled(HEAD_RIBBON_Y_A[i], ribY[i].x * 0.42);
      }
      for (let i = 0; i < 3; i++) {
        params.addScaled(HEAD_RIBBON_X_B[i], ribX[i + 1].x * 0.45);
        params.addScaled(HEAD_RIBBON_Y_B[i], ribY[i + 1].x * 0.4);
      }
    },

    reset(): void {
      pointerActive = false;
      followX.x = followX.v = 0;
      followY.x = followY.v = 0;
      eyeFollowX.x = eyeFollowX.v = 0;
      eyeFollowY.x = eyeFollowY.v = 0;
      for (const s of [...hatX, ...hatY, ...ribX, ...ribY]) {
        s.x = 0;
        s.v = 0;
      }
      prevAngleX = prevAngleY = prevAngleZ = 0;
    },
  };
}
