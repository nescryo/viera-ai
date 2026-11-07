import { Spring } from './spring';

/** Sampled jiggle, each axis in -1..1. */
export interface JiggleSample {
  /** Sideways swing. Lags behind the driver, then overshoots and settles. */
  x: number;
  /** Vertical bounce. Lags behind the driver, then overshoots and settles. */
  y: number;
}

/** Tuning for one jiggling body part. */
export interface JiggleOptions {
  /** Spring constant k. Lower is looser and slower. */
  stiffness: number;
  /** Damping on the horizontal spring. Lower keeps swinging longer. */
  dampingX: number;
  /** Damping on the vertical spring. */
  dampingY: number;
  /** Converts horizontal lag (driver units) into the -1..1 range. */
  gainX: number;
  /** Converts vertical lag (driver units) into the -1..1 range. */
  gainY: number;
}

/** Chest: heavy, tightly damped, so it settles quickly. */
export const CHEST_JIGGLE: JiggleOptions = {
  stiffness: 70,
  dampingX: 5,
  dampingY: 6,
  gainX: 0.15,
  gainY: 0.8
};

/** Ribbons: light, looser spring, so they float and trail the head a little longer. */
export const RIBBON_JIGGLE: JiggleOptions = {
  stiffness: 40,
  dampingX: 3.2,
  dampingY: 3.2,
  gainX: 0.06,
  gainY: 0.5
};

/**
 * Secondary-motion jiggle. A damped spring chases each driver signal, and the gap
 * between the driver and the spring is the swing. A steady driver gives zero offset;
 * a change in the driver kicks the part and it wobbles back to rest.
 * Holds only numeric state, so it can be unit-tested without a renderer.
 */
export class ChestJiggle {
  private readonly followX: Spring;
  private readonly followY: Spring;
  private readonly options: JiggleOptions;
  private primed = false;

  /** @param options Spring and gain tuning (default: chest). */
  constructor(options: JiggleOptions = CHEST_JIGGLE) {
    this.options = options;
    this.followX = new Spring(options.stiffness, options.dampingX);
    this.followY = new Spring(options.stiffness, options.dampingY);
  }

  /**
   * Advances the jiggle.
   * @param delta Frame delta in seconds.
   * @param driverX Horizontal driver, e.g. body lean in degrees.
   * @param driverY Vertical driver, e.g. breath level.
   * @param amount Overall strength (0..1).
   */
  public step(delta: number, driverX: number, driverY: number, amount = 1): JiggleSample {
    if (!this.primed) {
      // Start at rest on the first frame instead of swinging in from zero.
      this.followX.value = driverX;
      this.followY.value = driverY;
      this.primed = true;
    }
    const lagX = driverX - this.followX.step(driverX, delta);
    const lagY = driverY - this.followY.step(driverY, delta);
    return {
      x: clamp(lagX * this.options.gainX * amount),
      y: clamp(lagY * this.options.gainY * amount)
    };
  }
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
