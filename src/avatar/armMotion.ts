import { Spring } from './spring';

/** Arm segments driven by sway, gestures and swing. */
export type MotionChannel = 'arm' | 'forearm' | 'wrist' | 'hand';
/**
 * Sampled channels. `lift` is not a body part: it is the smoothed head-pitch signal (-1..1)
 * used to counter-rotate arm and shoulder parameters so the arms keep hanging down when
 * the head and chest tilt up toward the pointer.
 */
export type ArmChannel = MotionChannel | 'lift';
/** Character's left or right arm. */
export type ArmSide = 'l' | 'r';
/** Sampled arm motion, each channel in -1..1. */
export type ArmSample = Record<ArmSide, Record<ArmChannel, number>>;

const SIDES: ArmSide[] = ['l', 'r'];
const CHANNELS: MotionChannel[] = ['arm', 'forearm', 'wrist', 'hand'];

/** Peak idle sway per channel (fraction of the -1..1 range). */
const IDLE_AMPLITUDE: Record<MotionChannel, number> = { arm: 0.25, forearm: 0.3, wrist: 0.3, hand: 0.2 };
/** Peak speaking gesture per channel (fraction of the -1..1 range). */
const GESTURE_AMPLITUDE: Record<MotionChannel, number> = { arm: 0.6, forearm: 0.7, wrist: 0.6, hand: 0.5 };
/** Phase offset of the right arm against the left, so the arms never move in sync. */
const RIGHT_PHASE = 2.4;
/** The right arm's sway runs at a slightly different rate, so the pair keeps drifting apart. */
const RIGHT_RATE = 1.13;
/** Smoothed speech level above which new gestures start. */
const SPEECH_THRESHOLD = 0.05;
/** Seconds between gestures while speaking. Each arm keeps its own timer. */
const GESTURE_INTERVAL_MIN = 0.5;
const GESTURE_INTERVAL_MAX = 1.4;
/** Pointer swing: the arms lag behind body movement, more toward the hand. Gain converts lag (driver units) to -1..1. */
const SWING_GAIN: Record<MotionChannel, number> = { arm: 0.06, forearm: 0.1, wrist: 0.14, hand: 0.16 };
/** Per-side swing springs. Different values make the arms trail by different amounts. */
const SWING_SPRING: Record<ArmSide, [number, number]> = { l: [35, 4.5], r: [27, 3.8] };
/** Per-side lift springs: the arms settle against head pitch at different speeds, so they never move in unison. */
const LIFT_SPRING: Record<ArmSide, [number, number]> = { l: [40, 8], r: [26, 6.5] };
/** Soft springs so arms ease into every pose and never snap. */
const ARM_STIFFNESS = 30;
const ARM_DAMPING = 7;

/**
 * Arm life: a slow idle sway (incommensurate sine waves per segment, the right arm on its own
 * phase and rate), random gestures while speech is audible, a trailing swing when the body
 * moves, and a gravity-compensation signal that follows head pitch. Each arm has its own
 * springs and gesture timer, so the pair stays asymmetric.
 * Holds only numeric state, so it can be unit-tested without a renderer.
 */
export class ArmMotion {
  private readonly springs = {} as Record<ArmSide, Record<MotionChannel, Spring>>;
  private readonly gesture = {} as Record<ArmSide, Record<MotionChannel, number>>;
  private readonly swingFollow = {} as Record<ArmSide, Spring>;
  private readonly liftFollow = {} as Record<ArmSide, Spring>;
  private readonly nextGestureIn: Record<ArmSide, number> = { l: 0, r: 0 };
  private readonly speech = new Spring(20, 9);
  private swingPrimed = false;
  private readonly random: () => number;

  /** @param random Random source in 0..1 (inject a fixed one in tests). */
  constructor(random: () => number = Math.random) {
    this.random = random;
    for (const side of SIDES) {
      this.springs[side] = {} as Record<MotionChannel, Spring>;
      this.gesture[side] = {} as Record<MotionChannel, number>;
      for (const channel of CHANNELS) {
        this.springs[side][channel] = new Spring(ARM_STIFFNESS, ARM_DAMPING);
        this.gesture[side][channel] = 0;
      }
      this.swingFollow[side] = new Spring(...SWING_SPRING[side]);
      this.liftFollow[side] = new Spring(...LIFT_SPRING[side]);
    }
  }

  /**
   * Advances the arm motion.
   * @param delta Frame delta in seconds.
   * @param elapsed Elapsed time in seconds.
   * @param speechLevel Current speech loudness or mouth openness in 0..1.
   * @param amount Overall strength (0..1).
   * @param driverX Horizontal body driver in degrees (pointer lean plus sway). The arms swing
   *   against its changes, then settle. A steady driver adds no swing.
   * @param lift Head pitch in -1..1 (pointer.y, positive looking up). Smoothed per side into
   *   the `lift` channel, which the character config maps to counter-rotations.
   */
  public step(delta: number, elapsed: number, speechLevel = 0, amount = 1, driverX = 0, lift = 0): ArmSample {
    if (!this.swingPrimed) {
      // Start at rest on the first frame instead of swinging in from zero.
      for (const side of SIDES) this.swingFollow[side].value = driverX;
      this.swingPrimed = true;
    }

    const speech = Math.max(0, Math.min(1, this.speech.step(clamp01(speechLevel), delta)));
    const speaking = speech > SPEECH_THRESHOLD;

    const out = {} as ArmSample;
    for (const side of SIDES) {
      const swingLag = driverX - this.swingFollow[side].step(driverX, delta);

      this.nextGestureIn[side] -= delta;
      if (speaking && this.nextGestureIn[side] <= 0) {
        this.pickGesture(side);
        this.nextGestureIn[side] = GESTURE_INTERVAL_MIN + this.random() * (GESTURE_INTERVAL_MAX - GESTURE_INTERVAL_MIN);
      } else if (!speaking) {
        this.relaxGesture(side);
        this.nextGestureIn[side] = 0;
      }

      const phase = side === 'l' ? 0 : RIGHT_PHASE;
      const rate = side === 'l' ? 1 : RIGHT_RATE;
      const sample = {} as Record<ArmChannel, number>;
      for (const channel of CHANNELS) {
        const target =
          (this.idleWave(channel, elapsed * rate, phase) * IDLE_AMPLITUDE[channel] +
            this.gesture[side][channel] * GESTURE_AMPLITUDE[channel] * speech) *
          amount;
        const swing = swingLag * SWING_GAIN[channel] * amount;
        sample[channel] = clamp(this.springs[side][channel].step(target, delta) + swing);
      }
      sample.lift = clamp(this.liftFollow[side].step(clamp(lift), delta));
      out[side] = sample;
    }
    return out;
  }

  private idleWave(channel: MotionChannel, t: number, phase: number): number {
    switch (channel) {
      case 'arm':
        return Math.sin(t * 0.9 + phase) * 0.6 + Math.sin(t * 0.37 + phase * 1.7) * 0.4;
      case 'forearm':
        return Math.sin(t * 1.3 + phase + 1) * 0.7 + Math.sin(t * 0.53 + phase) * 0.3;
      case 'wrist':
        return Math.sin(t * 1.7 + phase + 2);
      case 'hand':
        return Math.sin(t * 2.1 + phase + 0.5) * 0.5;
    }
  }

  private pickGesture(side: ArmSide): void {
    for (const channel of CHANNELS) this.gesture[side][channel] = this.random() * 2 - 1;
  }

  private relaxGesture(side: ArmSide): void {
    for (const channel of CHANNELS) this.gesture[side][channel] = 0;
  }
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
