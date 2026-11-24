import { ArmMotion } from '../armMotion';
import type {
  ArmSide,
  CoordConverter,
  ExternalTouchState,
  FaceTouchMode,
  InternalModelLike,
  ParamAccessors,
  Spring1D,
} from './types';
import { EMPTY_EXTERNAL_TOUCH } from './types';
import {
  ARM_REST_HAND_LOCAL_X,
  ARM_REST_HAND_LOCAL_Y,
  clamp,
  collectPartDrawables,
  hitVisible,
  softClamp,
  solveArmIK,
  stepSpring,
} from './math';

export interface ArmMoodInput {
  faceMode: FaceTouchMode | null;
  patHappy: number;
  external: ExternalTouchState;
  speechLevel: number;
  bodyDriverX: number;
}

export interface ArmTouchController {
  tryPointerDown(clientX: number, clientY: number): ArmSide | null;
  pointerMove(clientX: number, clientY: number, dt: number): { dragX: number; dragY: number };
  pointerUp(): void;
  setMoodInput(input: ArmMoodInput): void;
  stepPostPhysics(dt: number): void;
  reset(): void;
}

const ARM_CONFIG = {
  screenRight: {
    sideSign: 1,
    armMotionSide: 'l' as const,
    shoulderX: 0.105,
    shoulderY: 0.466,
    upperParts: ['Part68'],
    foreParts: ['Part128'],
    handParts: ['Part130'],
    upperJoint: 'Param36',
    perspJoint: 'Param39',
    elbowJoint: 'Param41',
    elbowDegPerUnit: 170,
    fineArm: 'LArm',
    fineFore: 'LForearm',
    wrist: 'LWrist',
    hand: 'LHand',
    hand2: 'LHand2',
    sleeveX: ['LSleeveX1', 'LSleeveX2', 'LSleeveX3'] as const,
    sleeveY: ['LSleeveY', 'LSleeveY2', 'LSleeveY3'] as const,
  },
  screenLeft: {
    sideSign: -1,
    armMotionSide: 'r' as const,
    shoulderX: -0.105,
    shoulderY: 0.466,
    upperParts: ['Part94'],
    foreParts: ['Part129'],
    handParts: ['Part131'],
    upperJoint: 'Param62',
    perspJoint: 'Param59',
    elbowJoint: 'Param60',
    elbowDegPerUnit: 205,
    fineArm: 'RArm',
    fineFore: 'RForearm',
    wrist: 'RWrist',
    hand: 'RHand',
    hand2: 'RHand2',
    sleeveX: ['RSleeveX1', 'RSleeveX2', 'RSleeveX3', 'RSleeveX4'] as const,
    sleeveY: ['RSleeveY1', 'RSleeveY2', 'RSleeveY3'] as const,
  },
} as const;

const UPPER_K = 68;
const UPPER_C = 10.2;
const ELBOW_K = 84;
const ELBOW_C = 11.4;
const PERSP_K = 76;
const PERSP_C = 11.2;

const FINE_ARM_K = 120;
const FINE_ARM_C = 12.0;
const FINE_FORE_K = 105;
const FINE_FORE_C = 10.2;
const WRIST_K = 115;
const WRIST_C = 9.2;
const HAND_K = 135;
const HAND_C = 10.8;

const SLEEVE_K = [132, 102, 80, 68] as const;
const SLEEVE_C = [10.8, 8.4, 6.8, 5.8] as const;

const DRAG_NORM_PX = 180;
const RAD_TO_DEG = 180 / Math.PI;

interface ArmState {
  upper: Spring1D;
  elbow: Spring1D;
  persp: Spring1D;
  fineArm: Spring1D;
  fineFore: Spring1D;
  wrist: Spring1D;
  hand: Spring1D;
  hand2: Spring1D;
  sleeveX: [Spring1D, Spring1D, Spring1D, Spring1D];
  sleeveY: [Spring1D, Spring1D, Spring1D];
  targetUpper: number;
  targetElbow: number;
  targetPersp: number;
  targetFineArm: number;
  targetFineFore: number;
  targetWrist: number;
  targetHand: number;
  targetHand2: number;
  grabZone: 'upper' | 'fore' | 'hand';
  grabLocalStartX: number;
  grabLocalStartY: number;
  startUnitX: number;
  startUnitY: number;
}

function makeArmState(): ArmState {
  return {
    upper: { x: 0, v: 0 },
    elbow: { x: 0, v: 0 },
    persp: { x: 0, v: 0 },
    fineArm: { x: 0, v: 0 },
    fineFore: { x: 0, v: 0 },
    wrist: { x: 0, v: 0 },
    hand: { x: 0, v: 0 },
    hand2: { x: 0, v: 0 },
    sleeveX: [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }],
    sleeveY: [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }],
    targetUpper: 0,
    targetElbow: 0,
    targetPersp: 0,
    targetFineArm: 0,
    targetFineFore: 0,
    targetWrist: 0,
    targetHand: 0,
    targetHand2: 0,
    grabZone: 'hand',
    grabLocalStartX: ARM_REST_HAND_LOCAL_X,
    grabLocalStartY: ARM_REST_HAND_LOCAL_Y,
    startUnitX: 0,
    startUnitY: 0,
  };
}

/**
 * Articulated 2-bone arm controller combining analytical IK dragging, touch-mood postures,
 * Viera's asymmetric idle sway & speaking gestures, and cascading billowing maid sleeves.
 */
export function createArmTouchController(
  internal: InternalModelLike,
  params: ParamAccessors,
  coords: CoordConverter,
): ArmTouchController {
  const raw = internal.coreModel._model;

  const drawables: Record<ArmSide, { upper: number[]; fore: number[]; hand: number[] }> = {
    screenRight: {
      upper: collectPartDrawables(raw, ARM_CONFIG.screenRight.upperParts),
      fore: collectPartDrawables(raw, ARM_CONFIG.screenRight.foreParts),
      hand: collectPartDrawables(raw, ARM_CONFIG.screenRight.handParts),
    },
    screenLeft: {
      upper: collectPartDrawables(raw, ARM_CONFIG.screenLeft.upperParts),
      fore: collectPartDrawables(raw, ARM_CONFIG.screenLeft.foreParts),
      hand: collectPartDrawables(raw, ARM_CONFIG.screenLeft.handParts),
    },
  };

  let activeSide: ArmSide | null = null;
  let startClientX = 0;
  let startClientY = 0;
  let lastUnitX = 0;
  let lastUnitY = 0;
  let dragVelX = 0;
  let dragVelY = 0;
  let elapsed = 0;

  const armMotion = new ArmMotion();
  const arms: Record<ArmSide, ArmState> = {
    screenRight: makeArmState(),
    screenLeft: makeArmState(),
  };

  let mood: ArmMoodInput = {
    faceMode: null,
    patHappy: 0,
    external: { ...EMPTY_EXTERNAL_TOUCH },
    speechLevel: 0,
    bodyDriverX: 0,
  };

  return {
    setMoodInput(next: ArmMoodInput): void {
      mood = next;
    },

    stepPostPhysics(dt: number): void {
      elapsed += dt;
      dragVelX *= Math.exp(-10 * dt);
      dragVelY *= Math.exp(-10 * dt);

      const ext = mood.external;
      const hasTouchMood = Boolean(
        ext.chest || ext.skirt || ext.tail || ext.ear || mood.faceMode === 'headpat' || mood.patHappy > 0.02,
      );
      const speechSample = armMotion.step(
        dt,
        elapsed,
        mood.speechLevel,
        hasTouchMood ? 0.25 : 1,
        mood.bodyDriverX,
        0,
      );

      for (const side of ['screenRight', 'screenLeft'] as const) {
        const cfg = ARM_CONFIG[side];
        const st = arms[side];
        const isDragged = activeSide === side;
        const ambient = speechSample[cfg.armMotionSide];

        let mUpper = 0;
        let mElbow = 0;
        let mPersp = 0;
        let mHand = 0;
        let mHand2 = 0;

        if (!isDragged) {
          if (ext.chest) {
            mUpper = -0.1;
            mElbow = 0.08;
            mPersp = 0.06;
            mHand = 0.55;
            mHand2 = 0.45;
          } else if (ext.skirt) {
            const lift = clamp(ext.dragY, 0, 1);
            mUpper = -0.06;
            mElbow = 0.06 + 0.06 * lift;
            mHand = 0.45 + 0.3 * lift;
            mHand2 = 0.35;
          } else if (ext.tail) {
            mElbow = 0.07;
            mHand = 0.5;
            mHand2 = 0.4;
          } else if (ext.ear) {
            const isTouchedSide = (ext.ear === 'left' && side === 'screenLeft') || (ext.ear === 'right' && side === 'screenRight');
            mElbow = isTouchedSide ? 0.08 : 0.02;
            mHand = isTouchedSide ? 0.45 : 0.15;
            mHand2 = isTouchedSide ? 0.35 : 0.1;
          } else if (mood.faceMode === 'headpat' || mood.patHappy > 0.02) {
            mHand = -0.3 * mood.patHappy;
            mHand2 = -0.22 * mood.patHappy;
          } else if (mood.speechLevel > 0.05) {
            // Subtle natural elbow lift & open-hand gesture accent while speaking.
            const gestureLift = Math.max(0, ambient.forearm);
            mElbow = clamp(gestureLift * 0.06, 0, 0.08);
            mPersp = clamp(mElbow * 0.35, 0, 0.04);
          }
        }

        const tUpper = isDragged ? st.targetUpper : mUpper;
        const tElbow = isDragged ? st.targetElbow : mElbow;
        const tPersp = isDragged ? st.targetPersp : mPersp;

        stepSpring(st.upper, tUpper, UPPER_K, UPPER_C, dt);
        stepSpring(st.elbow, tElbow, ELBOW_K, ELBOW_C, dt);
        stepSpring(st.persp, tPersp, PERSP_K, PERSP_C, dt);

        // Ambient idle sway + speaking gestures layered into fine rig channels when not dragged.
        const ambArm = isDragged ? 0 : ambient.arm * 0.22;
        const ambFore = isDragged ? 0 : ambient.forearm * 0.26;
        const ambWrist = isDragged ? 0 : ambient.wrist * 0.26;
        const ambHand = isDragged ? 0 : ambient.hand * 0.2;

        const jointSpeedOut = st.upper.v * 0.45 + st.elbow.v * 0.35;
        const fineArmTarget = isDragged
          ? st.targetFineArm
          : clamp(ambArm - st.upper.v * 0.2, -0.5, 0.5);
        const fineForeTarget = isDragged
          ? st.targetFineFore
          : clamp(ambFore - st.upper.v * 0.32 - st.elbow.v * 0.25, -0.65, 0.65);
        const wristTarget = isDragged
          ? softClamp(st.targetWrist - st.elbow.v * 0.35, 0.85)
          : clamp(ambWrist - st.elbow.v * 0.45 - st.upper.v * 0.3, -0.75, 0.75);

        const handTarget = isDragged
          ? softClamp(st.targetHand - st.wrist.v * 0.16, 0.9)
          : clamp(mHand + ambHand - st.wrist.v * 0.18 - jointSpeedOut * 0.22, -0.85, 0.9);
        const hand2Target = isDragged
          ? softClamp(st.targetHand2 + st.wrist.v * 0.14, 0.85)
          : clamp(mHand2 + ambHand * 0.6 + st.wrist.v * 0.15, -0.8, 0.85);

        stepSpring(st.fineArm, fineArmTarget, FINE_ARM_K, FINE_ARM_C, dt);
        stepSpring(st.fineFore, fineForeTarget, FINE_FORE_K, FINE_FORE_C, dt);
        stepSpring(st.wrist, wristTarget, WRIST_K, WRIST_C, dt);
        stepSpring(st.hand, handTarget, HAND_K, HAND_C, dt);
        stepSpring(st.hand2, hand2Target, HAND_K, HAND_C, dt);

        // Cascading billowing sleeves trailing horizontal & vertical arm motion.
        const armOutVel = st.upper.v * 0.9 + st.fineArm.v * 0.55 + (isDragged ? dragVelX * cfg.sideSign * 0.4 : 0);
        const armUpVel = st.upper.v * 0.75 + st.elbow.v * 0.6 + (isDragged ? dragVelY * 0.45 : 0);
        const sleeveXDrive = softClamp(-armOutVel * 0.55 + st.upper.x * 0.35 + st.fineArm.x * 0.25, 0.95);
        const sleeveYDrive = softClamp(-armUpVel * 0.65 - st.upper.x * 0.3, 0.95);

        for (let i = 0; i < cfg.sleeveX.length; i++) {
          const prev = i === 0 ? sleeveXDrive : st.sleeveX[i - 1].x * 0.75 + sleeveXDrive * 0.35;
          stepSpring(st.sleeveX[i], clamp(prev, -1, 1), SLEEVE_K[i], SLEEVE_C[i], dt);
        }
        for (let i = 0; i < cfg.sleeveY.length; i++) {
          const prev = i === 0 ? sleeveYDrive : st.sleeveY[i - 1].x * 0.75 + sleeveYDrive * 0.35;
          stepSpring(st.sleeveY[i], clamp(prev, -1, 1), SLEEVE_K[i], SLEEVE_C[i], dt);
        }

        if (Math.abs(st.upper.x) > 1e-4) params.addParam(cfg.upperJoint, st.upper.x);
        if (st.elbow.x > 1e-4) params.addParam(cfg.elbowJoint, Math.max(0, st.elbow.x));
        if (Math.abs(st.persp.x) > 1e-4) params.addParam(cfg.perspJoint, st.persp.x);
        params.addScaled(cfg.fineArm, st.fineArm.x);
        params.addScaled(cfg.fineFore, st.fineFore.x);
        params.addScaled(cfg.wrist, st.wrist.x);
        params.addScaled(cfg.hand, st.hand.x);
        params.addScaled(cfg.hand2, st.hand2.x);
        for (let i = 0; i < cfg.sleeveX.length; i++) params.addParam(cfg.sleeveX[i], st.sleeveX[i].x);
        for (let i = 0; i < cfg.sleeveY.length; i++) params.addParam(cfg.sleeveY[i], st.sleeveY[i].x);
      }
    },

    tryPointerDown(clientX: number, clientY: number): ArmSide | null {
      const u = coords.screenToUnit(clientX, clientY);

      for (const side of ['screenRight', 'screenLeft'] as const) {
        const d = drawables[side];
        const hitHand = hitVisible(raw, d.hand, u.x, u.y);
        const hitFore = !hitHand && hitVisible(raw, d.fore, u.x, u.y);
        const hitUpper = !hitHand && !hitFore && hitVisible(raw, d.upper, u.x, u.y);
        if (!hitHand && !hitFore && !hitUpper) continue;

        activeSide = side;
        startClientX = clientX;
        startClientY = clientY;
        lastUnitX = u.x;
        lastUnitY = u.y;
        dragVelX = 0;
        dragVelY = 0;

        const cfg = ARM_CONFIG[side];
        const st = arms[side];
        st.grabZone = hitHand ? 'hand' : hitFore ? 'fore' : 'upper';
        st.startUnitX = u.x;
        st.startUnitY = u.y;
        st.grabLocalStartX = (u.x - cfg.shoulderX) * cfg.sideSign;
        st.grabLocalStartY = u.y - cfg.shoulderY;

        st.hand.v += 2.8;
        st.wrist.v += 1.8;
        return side;
      }

      return null;
    },

    pointerMove(clientX: number, clientY: number, dt: number): { dragX: number; dragY: number } {
      if (!activeSide) return { dragX: 0, dragY: 0 };
      const u = coords.screenToUnit(clientX, clientY);
      const cfg = ARM_CONFIG[activeSide];
      const st = arms[activeSide];

      const dx = u.x - st.startUnitX;
      const dy = u.y - st.startUnitY;
      const safeDt = Math.max(dt, 1 / 120);
      dragVelX = clamp((u.x - lastUnitX) / safeDt, -2.5, 2.5);
      dragVelY = clamp((u.y - lastUnitY) / safeDt, -2.5, 2.5);
      lastUnitX = u.x;
      lastUnitY = u.y;

      const dLocalX = dx * cfg.sideSign;
      const dLocalY = dy;

      if (st.grabZone === 'upper') {
        const targetLocalX = st.grabLocalStartX + dLocalX * 0.9;
        const targetLocalY = st.grabLocalStartY + dLocalY * 0.9;
        const baseAng = Math.atan2(st.grabLocalStartY, st.grabLocalStartX) * RAD_TO_DEG;
        const nextAng = Math.atan2(targetLocalY, targetLocalX) * RAD_TO_DEG;
        let dAng = nextAng - baseAng;
        if (dAng > 180) dAng -= 360;
        if (dAng < -180) dAng += 360;

        st.targetUpper = dAng >= 0 ? clamp(dAng / 125, 0, 0.72) : clamp(dAng / 28, -0.55, 0);
        st.targetElbow = clamp(Math.max(0, dLocalY) * 0.55, 0, 0.35);
        st.targetPersp = clamp(Math.max(0, st.targetUpper) * 0.16, 0, 0.25);
        st.targetFineArm = softClamp(dLocalX * 1.1 + dLocalY * 0.6, 0.45);
        st.targetFineFore = softClamp(-dragVelX * cfg.sideSign * 0.25, 0.5);
        st.targetWrist = softClamp(-dragVelY * 0.25, 0.6);
        st.targetHand = softClamp(0.25 + dLocalY * 0.6, 0.65);
        st.targetHand2 = softClamp(-dLocalX * 0.5, 0.5);
      } else {
        const reachBoost = st.grabZone === 'fore' ? 1.25 : 1.0;
        const goalX = ARM_REST_HAND_LOCAL_X + dLocalX * reachBoost;
        const goalY = ARM_REST_HAND_LOCAL_Y + dLocalY * reachBoost;

        const ik = solveArmIK(goalX, goalY, cfg.elbowDegPerUnit);
        st.targetUpper = ik.upper;
        st.targetElbow = ik.elbow;
        st.targetPersp = ik.persp;

        st.targetFineArm = softClamp((dLocalX * 0.55 + dLocalY * 0.45) * 0.7, 0.35);
        st.targetFineFore = softClamp((dLocalX * 0.4 + dLocalY * 0.5) * 0.85, 0.45);
        st.targetWrist = softClamp(dLocalX * 1.1 + dLocalY * 1.4 - dragVelY * 0.22, 0.85);
        st.targetHand = softClamp(-dLocalY * 1.25 - dLocalX * 0.6, 0.85);
        st.targetHand2 = softClamp(dLocalX * 1.1 - dLocalY * 0.5, 0.75);
      }

      return {
        dragX: clamp((clientX - startClientX) / DRAG_NORM_PX, -1, 1),
        dragY: clamp((startClientY - clientY) / DRAG_NORM_PX, -1, 1),
      };
    },

    pointerUp(): void {
      if (activeSide) {
        const st = arms[activeSide];
        st.targetUpper = 0;
        st.targetElbow = 0;
        st.targetPersp = 0;
        st.targetFineArm = 0;
        st.targetFineFore = 0;
        st.targetWrist = 0;
        st.targetHand = 0;
        st.targetHand2 = 0;
      }
      activeSide = null;
    },

    reset(): void {
      activeSide = null;
      dragVelX = 0;
      dragVelY = 0;
      for (const side of ['screenRight', 'screenLeft'] as const) {
        const st = arms[side];
        for (const s of [
          st.upper, st.elbow, st.persp,
          st.fineArm, st.fineFore, st.wrist, st.hand, st.hand2,
          ...st.sleeveX, ...st.sleeveY,
        ]) {
          s.x = 0;
          s.v = 0;
        }
        st.targetUpper = st.targetElbow = st.targetPersp = 0;
        st.targetFineArm = st.targetFineFore = st.targetWrist = st.targetHand = st.targetHand2 = 0;
      }
    },
  };
}
