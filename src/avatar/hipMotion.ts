import { Spring } from './spring';

/** Sampled hip motion, each channel in -1..1. */
export interface HipSample {
  /** Weight shift: the hips drift side to side on a slow wave. */
  shift: number;
  /** Breath: a tiny rise and fall that ties the hips to the chest. */
  breath: number;
}

/** Soft spring so the hips ease into every pose and never snap. */
const SHIFT_STIFFNESS = 12;
const SHIFT_DAMPING = 5;
/** Breath coupling trails the chest a little. */
const BREATH_STIFFNESS = 30;
const BREATH_DAMPING = 8;

/**
 * Standing weight shift (重心移動): the hips drift slowly side to side on two incommensurate
 * waves (periods of roughly 9 and 21 seconds), plus a tiny breath-driven rise and fall.
 * Holds only numeric state, so it can be unit-tested without a renderer.
 */
export class HipMotion {
  private readonly shift = new Spring(SHIFT_STIFFNESS, SHIFT_DAMPING);
  private readonly breath = new Spring(BREATH_STIFFNESS, BREATH_DAMPING);

  /**
   * Advances the hip motion.
   * @param delta Frame delta in seconds.
   * @param elapsed Elapsed time in seconds.
   * @param breathLevel Breath level, about 0..1 (see `BreathingCycle`).
   * @param amount Overall strength (0..1). Lower it while speaking to keep the hips calm.
   */
  public step(delta: number, elapsed: number, breathLevel = 0, amount = 1): HipSample {
    const wave = Math.sin(elapsed * 0.7) * 0.65 + Math.sin(elapsed * 0.3 + 1.1) * 0.35;
    return {
      shift: clamp(this.shift.step(wave * amount, delta)),
      // Centered on 0.5 so a mid-breath level adds nothing.
      breath: clamp(this.breath.step((breathLevel - 0.5) * 2 * amount, delta))
    };
  }
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
