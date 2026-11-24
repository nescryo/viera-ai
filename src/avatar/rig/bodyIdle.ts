import type { BreathSample } from '../breathing';
import type {
  EmotionMoodOffsets,
  ExternalTouchState,
  FaceTouchMode,
  InternalModelLike,
  ParamAccessors,
  Spring1D,
} from './types';
import { EMPTY_EXTERNAL_TOUCH } from './types';
import { approach, clamp, stepSpring } from './math';

export interface BodyIdleInput {
  faceMode: FaceTouchMode | null;
  cheekSide: 'left' | 'right';
  eyeSide: 'left' | 'right' | 'both';
  patHappy: number;
  patDragX: number;
  patDragY: number;
  cheekXNorm: number;
  cheekYNorm: number;
  external: ExternalTouchState;
  followActive: boolean;
  followX: number;
  followY: number;
  isReplying: boolean;
  breath: BreathSample;
  mood: EmotionMoodOffsets;
}

export interface BodyIdleController {
  setInput(input: BodyIdleInput): void;
  stepPrePhysics(dt: number): void;
  stepPostPhysics(dt: number): void;
  triggerStartle(dirX: number, strength?: number): void;
  reset(): void;
}

// Body posture & micro-idle spring tuning.
const POSTURE_K = 48;
const POSTURE_C = 11.5;
const SHY_K = 56;
const SHY_C = 12.5;
const SACCADE_RATE = 22;

const NEUTRAL_MOOD: EmotionMoodOffsets = {
  swayScale: 1,
  earPerk: 0,
  earFlare: 0,
  postureY: 0,
  shoulderY: 0,
  headPitch: 0,
  headTilt: 0,
};

const ZERO_BREATH: BreathSample = { level: 0, velocity: 0, shoulder: 0, head: 0 };

/**
 * Two-stage full-body idle and reactive posture controller.
 * Stage A (`stepPrePhysics`) feeds `PositionX/Y/Z` into Live2D's native physics pipeline before
 * `physics.evaluate()`, waking up chest, skirt, sleeves, ribbons, gem specular, and tail physics.
 * Stage B (`stepPostPhysics`) applies crisp direct posture offsets, grounded weight shift,
 * emotion-coupled posture nuances, subtle head drift, and eye micro-saccades after physics.
 */
export function createBodyIdleController(
  internal: InternalModelLike,
  params: ParamAccessors,
): BodyIdleController {
  let elapsed = 0;
  let idleSuppress = 0;
  let headDriftSuppress = 0;

  let input: BodyIdleInput = {
    faceMode: null,
    cheekSide: 'left',
    eyeSide: 'both',
    patHappy: 0,
    patDragX: 0,
    patDragY: 0,
    cheekXNorm: 0,
    cheekYNorm: 0,
    external: { ...EMPTY_EXTERNAL_TOUCH },
    followActive: false,
    followX: 0,
    followY: 0,
    isReplying: false,
    breath: ZERO_BREATH,
    mood: NEUTRAL_MOOD,
  };

  // Pre-physics channels driving model.physics3.json (PositionX/Y/Z).
  const posX: Spring1D = { x: 0, v: 0 };
  const posY: Spring1D = { x: 0, v: 0 };
  const posZ: Spring1D = { x: 0, v: 0 };

  // Direct post-physics posture channels (bypass sluggish mob=0.01 PhysicsSetting4).
  const bodyTwistX: Spring1D = { x: 0, v: 0 };
  const bodyLeanZ: Spring1D = { x: 0, v: 0 };
  const bodyDropY: Spring1D = { x: 0, v: 0 };
  const hipTwistX: Spring1D = { x: 0, v: 0 };
  const hipSwayZ: Spring1D = { x: 0, v: 0 };
  const shoulderY: Spring1D = { x: 0, v: 0 };
  const shoulderZ: Spring1D = { x: 0, v: 0 };
  const kneeDip: Spring1D = { x: 0, v: 0 };
  const shyLeg: Spring1D = { x: 0, v: 0 };
  const shyTuck: Spring1D = { x: 0, v: 0 };
  const moodHeadPitch: Spring1D = { x: 0, v: 0 };
  const moodHeadTilt: Spring1D = { x: 0, v: 0 };

  // Organic micro-saccades.
  let saccadeTimer = 1.6;
  let saccadeTargetX = 0;
  let saccadeTargetY = 0;
  let saccadeX = 0;
  let saccadeY = 0;
  let breathSmooth = 0.5;
  let breathShoulderSmooth = 0.5;
  let breathHeadSmooth = 0.5;

  const hasAnyInteraction = (): boolean => {
    const ext = input.external;
    return Boolean(
      input.faceMode ||
      ext.chest ||
      ext.skirt ||
      ext.cloth ||
      ext.tail ||
      ext.ear ||
      ext.arm ||
      ext.hair,
    );
  };

  return {
    setInput(next: BodyIdleInput): void {
      input = next;
    },

    stepPrePhysics(dt: number): void {
      elapsed += dt;

      const mm = internal.motionManager;
      const motionPlaying = Boolean(mm && !mm.isFinished());
      const ext = input.external;
      const hasInteraction = hasAnyInteraction();
      const followMag = clamp(Math.hypot(input.followX, input.followY), 0, 1);

      // Suppress body idle strongly during direct touch, gently when following or replying.
      const targetSuppress = hasInteraction
        ? 1
        : input.isReplying
          ? 0.55
          : motionPlaying
            ? 0.5
            : followMag * 0.35;
      idleSuppress = approach(idleSuppress, targetSuppress, hasInteraction ? 7 : 2.4, dt);

      const targetHeadSuppress = hasInteraction
        ? 1
        : input.isReplying
          ? 0.55
          : followMag * 0.45;
      headDriftSuppress = approach(headDriftSuppress, targetHeadSuppress, hasInteraction ? 7 : 2.6, dt);

      const moodSway = input.mood.swayScale;
      const idleScale = (1 - idleSuppress * 0.72) * moodSway;

      // Sync to Viera's BreathingCycle (0..1) so chest, shoulders, head nod, and physics stay phase-locked.
      breathSmooth = approach(breathSmooth, clamp(input.breath.level, 0, 1), 10, dt);
      breathShoulderSmooth = approach(breathShoulderSmooth, clamp(input.breath.shoulder, 0, 1), 10, dt);
      breathHeadSmooth = approach(breathHeadSmooth, clamp(input.breath.head, 0, 1), 10, dt);
      const breathSigned = (breathSmooth - 0.5) * 2;
      const shoulderBreathSigned = (breathShoulderSmooth - 0.5) * 2;

      // Slow layered organic figure-8 weight shift across hips, ribcage, and shoulders.
      const swayPrimary = Math.sin(elapsed * 0.62) * 0.72 + Math.sin(elapsed * 0.27 + 1.1) * 0.28;
      const swaySecondary = Math.sin(elapsed * 0.43 + 0.7);
      const idlePosX = swayPrimary * 4.8 * idleScale;
      const idlePosZ = (swayPrimary * 3.8 + swaySecondary * 1.6) * idleScale;
      const idlePosY = (breathSigned * 3.4 + Math.sin(elapsed * 0.31) * 1.1) * idleScale;

      let rPosX = 0;
      let rPosY = input.mood.postureY * 0.65;
      let rPosZ = 0;
      let rTwistX = 0;
      let rLeanZ = 0;
      let rDropY = input.mood.postureY;
      let rHipX = 0;
      let rHipZ = 0;
      let rShoulderY = input.mood.shoulderY;
      let rShoulderZ = 0;
      let rKneeDip = 0;
      let rShyLeg = 0;
      let rShyTuck = 0;

      if (ext.chest) {
        const away = ext.chest === 'left' ? 1 : -1;
        rPosX = away * 6.5 + ext.dragX * 4.5;
        rPosY = -7.5 + ext.dragY * 3.5;
        rPosZ = away * 5.0 + ext.dragX * 3.5;
        rTwistX = away * 10 + ext.dragX * 6;
        rLeanZ = -away * 4.5 + ext.dragX * 3.5;
        rDropY = -5.5 + ext.dragY * 2.5;
        rHipX = away * 6;
        rHipZ = away * 4.5;
        rShoulderY = 16;
        rShoulderZ = away * 10;
        rKneeDip = 0.28;
        rShyLeg = away * 0.75;
        rShyTuck = 0.16;
      } else if (ext.skirt) {
        const sideBias = ext.skirt === 'left' ? 1 : ext.skirt === 'right' ? -1 : 0;
        const lift = clamp(ext.dragY, 0, 1);
        rPosX = sideBias * 5.5 + ext.dragX * 4.5;
        rPosY = -6.5 - lift * 4.5;
        rPosZ = sideBias * 4.5 + ext.dragX * 4.0;
        rTwistX = -sideBias * 7 + ext.dragX * 6;
        rLeanZ = sideBias * 3.5 + ext.dragX * 3;
        rDropY = -4.5 - lift * 4.0;
        rHipX = sideBias * 9 + ext.dragX * 6;
        rHipZ = sideBias * 6 + ext.dragX * 4;
        rShoulderY = 12 + lift * 6;
        rShoulderZ = sideBias * 8;
        rKneeDip = 0.25 + lift * 0.2;
        rShyLeg = (sideBias !== 0 ? sideBias : 1) * (0.55 + 0.3 * lift);
        rShyTuck = 0.08 + 0.1 * lift;
      } else if (ext.tail) {
        const sideBias = ext.tail === 'left' ? -1 : ext.tail === 'right' ? 1 : 0;
        const pullMag = clamp(Math.hypot(ext.dragX, ext.dragY), 0, 1);
        rPosX = sideBias * 5.0 + ext.dragX * 5.5;
        rPosY = -4.5 + ext.dragY * 4.0;
        rPosZ = sideBias * 4.5 + ext.dragX * 4.5;
        rTwistX = sideBias * 9 + ext.dragX * 7;
        rLeanZ = -sideBias * 4.0 + ext.dragX * 3.5;
        rDropY = -3.0 + ext.dragY * 3.0;
        rHipX = sideBias * 11 + ext.dragX * 8;
        rHipZ = sideBias * 7.5 + ext.dragX * 5;
        rShoulderY = 11 + pullMag * 5;
        rShoulderZ = -sideBias * 9;
        rKneeDip = 0.18 + pullMag * 0.12;
        rShyLeg = sideBias * 0.6;
        rShyTuck = 0.08;
      } else if (ext.ear) {
        const sideBias = ext.ear === 'left' ? -1 : 1;
        rPosX = -sideBias * 4.0 + ext.dragX * 4.5;
        rPosY = -3.5 + ext.dragY * 3.5;
        rPosZ = -sideBias * 4.5 + ext.dragX * 4.5;
        rTwistX = -sideBias * 6 + ext.dragX * 5;
        rLeanZ = -sideBias * 4.0 + ext.dragX * 4.5;
        rDropY = -2.5 + ext.dragY * 2.5;
        rShoulderY = 10;
        rShoulderZ = -sideBias * 14;
        rKneeDip = 0.12;
        rShyLeg = -sideBias * 0.45;
      } else if (input.faceMode === 'headpat') {
        const happy = input.patHappy;
        rPosX = input.patDragX * 6.0;
        rPosY = -3.5 - happy * 2.5 + input.patDragY * 3.5;
        rPosZ = input.patDragX * 6.5;
        rTwistX = input.patDragX * 6.5;
        rLeanZ = input.patDragX * 5.0;
        rDropY = -2.0 - happy * 2.0 + input.patDragY * 2.5;
        rHipZ = input.patDragX * 3.5;
        rShoulderY = -8 * happy;
        rShoulderZ = input.patDragX * 8;
        rKneeDip = 0.08 * happy;
      } else if (input.faceMode === 'cheek') {
        const s = input.cheekSide === 'left' ? -1 : 1;
        rPosX = input.cheekXNorm * 5.5;
        rPosY = input.cheekYNorm * 3.0;
        rPosZ = input.cheekXNorm * 5.0;
        rTwistX = input.cheekXNorm * 7.0;
        rLeanZ = input.cheekXNorm * 4.5 + s * 1.5;
        rShoulderY = 5;
        rShoulderZ = input.cheekXNorm * 9;
      } else if (input.faceMode === 'eye') {
        const away = input.eyeSide === 'left' ? 1 : input.eyeSide === 'right' ? -1 : 0;
        rPosX = away * 4.5;
        rPosY = 3.5;
        rPosZ = away * 3.5;
        rTwistX = away * 5;
        rShoulderY = 12;
        rKneeDip = 0.1;
      } else if (ext.cloth) {
        const { region, side } = ext.cloth;
        const sideBias = side === 'left' ? -1 : side === 'right' ? 1 : 0;
        const isShy = region === 'garter' || region === 'waist' || region === 'bow';
        rPosX = ext.dragX * 5.5 + sideBias * 2.0;
        rPosY = (isShy ? -3.0 : 0) + ext.dragY * 3.5;
        rPosZ = ext.dragX * 5.0 + sideBias * 2.0;
        rTwistX = ext.dragX * 6.5 + sideBias * 3.0;
        rLeanZ = ext.dragX * 4.0;
        rHipX = region === 'garter' || region === 'waist' || region === 'backBow' ? ext.dragX * 6 : 0;
        rShoulderY = isShy ? 8 : ext.dragY * 8;
        rShoulderZ = ext.dragX * 8;
        rKneeDip = region === 'garter' ? 0.18 : isShy ? 0.1 : 0;
        rShyLeg = region === 'garter' ? -sideBias * 0.65 : isShy ? sideBias * 0.35 : 0;
      } else if (ext.arm) {
        const sideBias = ext.arm === 'screenRight' ? 1 : -1;
        rPosX = sideBias * 4.5 + ext.dragX * 5.0;
        rPosY = ext.dragY * 4.0;
        rPosZ = sideBias * 3.5 + ext.dragX * 4.5;
        rTwistX = sideBias * 7.5 + ext.dragX * 5.5;
        rLeanZ = sideBias * 3.0 + ext.dragX * 3.5;
        rShoulderY = clamp(ext.dragY * 14 + 5, -10, 18);
        rShoulderZ = sideBias * (10 + ext.dragY * 8);
      } else if (ext.hair) {
        rPosX = ext.dragX * 4.0;
        rPosY = ext.dragY * 2.5;
        rPosZ = ext.dragX * 4.0;
        rLeanZ = ext.dragX * 3.0;
        rShoulderZ = ext.dragX * 6.0;
      } else if (input.followActive && (Math.abs(input.followX) > 1e-3 || Math.abs(input.followY) > 1e-3)) {
        // Gentle upper-body & shoulder tracking toward cursor (feeds physics for skirt, chest, sleeves, tail, gem).
        const fx = input.followX;
        const fy = input.followY;
        rPosX += fx * 7.5;
        rPosY += fy * 5.5;
        rPosZ += fx * 5.5;
        rTwistX += fx * 9.5;
        rLeanZ += fx * 4.0;
        rDropY += fy * 3.6;
        rHipX += fx * 4.5;
        rHipZ += fx * 2.8;
        rShoulderY += fy * 5.5;
        rShoulderZ += fx * 6.5;
      }

      stepSpring(posX, idlePosX + rPosX, POSTURE_K, POSTURE_C, dt);
      stepSpring(posY, idlePosY + rPosY, POSTURE_K, POSTURE_C, dt);
      stepSpring(posZ, idlePosZ + rPosZ, POSTURE_K, POSTURE_C, dt);
      stepSpring(bodyTwistX, swayPrimary * 4.2 * idleScale + rTwistX, POSTURE_K, POSTURE_C, dt);
      stepSpring(bodyLeanZ, rLeanZ, POSTURE_K, POSTURE_C, dt);
      stepSpring(bodyDropY, breathSigned * 3.2 * idleScale + rDropY, POSTURE_K, POSTURE_C, dt);
      stepSpring(hipTwistX, swayPrimary * 4.0 * idleScale + rHipX, POSTURE_K, POSTURE_C, dt);
      stepSpring(hipSwayZ, swayPrimary * 3.5 * idleScale + rHipZ, POSTURE_K, POSTURE_C, dt);
      stepSpring(shoulderY, shoulderBreathSigned * 8.0 * idleScale + rShoulderY, SHY_K, SHY_C, dt);
      stepSpring(shoulderZ, swayPrimary * 5.0 * idleScale + rShoulderZ, SHY_K, SHY_C, dt);
      stepSpring(kneeDip, rKneeDip, SHY_K, SHY_C, dt);
      stepSpring(shyLeg, rShyLeg, SHY_K, SHY_C, dt);
      stepSpring(shyTuck, rShyTuck, SHY_K, SHY_C, dt);
      stepSpring(moodHeadPitch, hasInteraction ? 0 : input.mood.headPitch, 32, 10, dt);
      stepSpring(moodHeadTilt, hasInteraction ? 0 : input.mood.headTilt, 32, 10, dt);

      // Feed PositionX/Y/Z into Cubism physics pipeline (saveParameters runs right after afterMotionUpdate).
      params.setParam('PositionX', clamp(posX.x, -20, 20));
      params.setParam('PositionY', clamp(posY.x, -20, 20));
      params.setParam('PositionZ', clamp(posZ.x, -20, 20));

      // Step organic eye micro-saccades (subtle while replying, paused during direct touch).
      if (hasInteraction) {
        saccadeTargetX = 0;
        saccadeTargetY = 0;
        saccadeTimer = Math.min(saccadeTimer, 0.8);
      } else {
        saccadeTimer -= dt;
        if (saccadeTimer <= 0) {
          if (Math.random() < 0.45) {
            saccadeTargetX = (Math.random() - 0.5) * 0.06;
            saccadeTargetY = (Math.random() - 0.5) * 0.04;
            saccadeTimer = 1.6 + Math.random() * 2.2;
          } else {
            const amp = input.isReplying ? 0.11 : 0.22;
            saccadeTargetX = (Math.random() * 2 - 1) * amp;
            saccadeTargetY = (Math.random() * 2 - 1) * (amp * 0.55);
            saccadeTimer = 1.2 + Math.random() * 2.4;
          }
        }
      }
      saccadeX = approach(saccadeX, saccadeTargetX, SACCADE_RATE, dt);
      saccadeY = approach(saccadeY, saccadeTargetY, SACCADE_RATE, dt);
    },

    stepPostPhysics(_dt: number): void {
      const idleHeadScale = (1 - headDriftSuppress) * input.mood.swayScale;
      const headBreathSigned = (breathHeadSmooth - 0.5) * 2;

      // 1. Subtle organic head drift, breathing nod, and emotion posture bias.
      const hx = idleHeadScale > 0.01
        ? (Math.sin(elapsed * 0.53) * 4.4 + Math.sin(elapsed * 0.23 + 2.0) * 2.5) * idleHeadScale
        : 0;
      const hy = (idleHeadScale > 0.01
        ? (headBreathSigned * 2.4 + Math.sin(elapsed * 0.37 + 0.5) * 1.6) * idleHeadScale
        : headBreathSigned * 1.0) + moodHeadPitch.x;
      const hz = (idleHeadScale > 0.01
        ? (Math.sin(elapsed * 0.47 + 1.3) * 4.2 + Math.sin(elapsed * 0.19) * 1.8) * idleHeadScale
        : 0) + moodHeadTilt.x;

      if (Math.abs(hx) > 1e-3) params.addParam('ParamAngleX', hx);
      if (Math.abs(hy) > 1e-3) params.addParam('ParamAngleY', hy);
      if (Math.abs(hz) > 1e-3) params.addParam('ParamAngleZ', hz);

      // 2. Crisp torso, hip, shoulder, and shy-leg posture offsets.
      params.addParam('ParamBodyAngleX', clamp(bodyTwistX.x, -18, 18));
      params.addParam('ParamBodyAngleZ', clamp(bodyLeanZ.x, -12, 12));
      params.addParam('ParamBodyAngleY', clamp(bodyDropY.x, -14, 12));
      params.addParam('HipAngleX', clamp(hipTwistX.x, -16, 16));
      params.addParam('ParamHipAngleZ', clamp(hipSwayZ.x, -14, 14));
      params.addParam('LEGAngleZ2', clamp(hipSwayZ.x * 0.85, -14, 14));
      params.addParam('ShoulderY', clamp(shoulderY.x, -22, 24));
      params.addParam('ShoulderYy', clamp(shoulderY.x * 0.45, -12, 14));
      params.addParam('ShoulderZ', clamp(shoulderZ.x, -22, 22));
      params.addParam('HipZ2', clamp(kneeDip.x, 0, 0.55));
      params.addParam('Param33', clamp(shyLeg.x, -0.95, 0.95));
      if (shyTuck.x > 1e-3) {
        params.addParam('Param50', clamp(shyTuck.x, 0, 0.25));
      }

      // 3. Subtle eye micro-saccades (suppressed during touch).
      const saccadeScale = hasAnyInteraction() ? 0 : 1;
      if (saccadeScale > 0.05 && (Math.abs(saccadeX) > 1e-3 || Math.abs(saccadeY) > 1e-3)) {
        params.addParam('ParamEyeBallX', saccadeX * saccadeScale);
        params.addParam('ParamEyeBallY', saccadeY * saccadeScale);
      }
    },

    triggerStartle(dirX: number, strength = 1): void {
      const s = clamp(strength, 0.2, 1.5);
      const sign = dirX === 0 ? 1 : Math.sign(dirX);
      posY.v += -26 * s;
      shoulderY.v += 95 * s;
      bodyTwistX.v += sign * 35 * s;
      kneeDip.v += 1.4 * s;
      shyLeg.v += sign * 2.2 * s;
    },

    reset(): void {
      idleSuppress = 0;
      headDriftSuppress = 0;
      for (const s of [
        posX, posY, posZ,
        bodyTwistX, bodyLeanZ, bodyDropY,
        hipTwistX, hipSwayZ,
        shoulderY, shoulderZ,
        kneeDip, shyLeg, shyTuck,
        moodHeadPitch, moodHeadTilt,
      ]) {
        s.x = 0;
        s.v = 0;
      }
      saccadeTargetX = 0;
      saccadeTargetY = 0;
      saccadeX = 0;
      saccadeY = 0;
      params.setParam('PositionX', 0);
      params.setParam('PositionY', 0);
      params.setParam('PositionZ', 0);
    },
  };
}
