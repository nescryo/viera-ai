import { Spring } from './spring';

/** Sampled head and body offsets, in Live2D parameter units (degrees on standard rigs). */
export interface SwaySample {
  /** Head roll (head tilt) for `ParamAngleZ`. */
  headRoll: number;
  /** Extra head yaw for `ParamAngleX`. */
  headYaw: number;
  /** Body lean sideways for `ParamBodyAngleX`. */
  bodyX: number;
  /** Body roll for `ParamBodyAngleZ`. */
  bodyZ: number;
}

/** Peak head roll in degrees. */
const HEAD_ROLL_DEG = 9;
/** Peak extra head yaw in degrees. */
const HEAD_YAW_DEG = 5;
/** Peak body lean in degrees. */
const BODY_X_DEG = 4;
/** Peak body roll in degrees. */
const BODY_Z_DEG = 3;
/** How much the pointer position tilts the head, in degrees at full deflection. */
const POINTER_ROLL_DEG = 6;
/** The head follows the body with a softer spring so it trails slightly. */
const HEAD_STIFFNESS = 60;
const HEAD_DAMPING = 11;

/**
 * Idle posture sway: the body drifts slowly side to side while the head tilts
 * (首かしげ) on its own slower wave, driven through springs so it never snaps.
 * Several incommensurate sine waves make the pattern hard to notice as a loop.
 * Holds only numeric state, so it can be unit-tested without a renderer.
 */
export class IdleSway {
  private readonly roll = new Spring(HEAD_STIFFNESS, HEAD_DAMPING);
  private readonly yaw = new Spring(HEAD_STIFFNESS, HEAD_DAMPING);
  private readonly bodyX = new Spring();
  private readonly bodyZ = new Spring();

  /**
   * Advances the sway.
   * @param delta Frame delta in seconds.
   * @param elapsed Elapsed time in seconds.
   * @param pointerX Horizontal gaze target in -1..1; tilts the head slightly toward it.
   * @param amount Overall strength (0..1). Lower it while speaking to keep the head calm.
   */
  public step(delta: number, elapsed: number, pointerX = 0, amount = 1): SwaySample {
    const t = elapsed;
    const bodyWave = Math.sin(t * 1.8) * 0.7 + Math.sin(t * 0.77 + 1.3) * 0.3;
    const headWave = Math.sin(t * 1.5 + 0.8) * 0.65 + Math.sin(t * 0.61) * 0.35;
    const yawWave = Math.sin(t * 1.1 + 2.1);

    return {
      headRoll: this.roll.step((headWave * HEAD_ROLL_DEG - pointerX * POINTER_ROLL_DEG) * amount, delta),
      headYaw: this.yaw.step(yawWave * HEAD_YAW_DEG * amount, delta),
      bodyX: this.bodyX.step(bodyWave * BODY_X_DEG * amount, delta),
      // Body rolls against the head tilt so the pose stays balanced.
      bodyZ: this.bodyZ.step(-bodyWave * BODY_Z_DEG * amount, delta)
    };
  }
}
