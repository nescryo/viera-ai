/** Current eye fixation offset, in the same -1..1 units as the eyeball parameters. */
export interface SaccadeOffset {
  x: number;
  y: number;
}

const MIN_INTERVAL = 0.4;
const MAX_INTERVAL = 2.2;
/** Maximum offset on each axis. */
const MAX_OFFSET = 0.25;
/** Eyes move fast: this is the rate (1/s) used to reach a new fixation point. */
const SACCADE_RATE = 30;

/**
 * Stochastic eye micro-saccades. At random intervals the fixation point jumps to a
 * new nearby offset, and the eyes reach it very quickly. Shorter intervals are more
 * likely than long ones, as in real idle eye behaviour.
 * Holds only numeric state, so it can be unit-tested without a renderer.
 */
export class SaccadeGenerator {
  private timer: number;
  private targetX = 0;
  private targetY = 0;
  private x = 0;
  private y = 0;

  private readonly random: () => number;

  /** @param random Random source returning 0..1 (injectable for tests). */
  constructor(random: () => number = Math.random) {
    this.random = random;
    this.timer = this.nextInterval();
  }

  private nextInterval(): number {
    // Squaring skews the draw toward short intervals.
    const r = this.random();
    return MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * r * r;
  }

  /**
   * Advances the generator.
   * @param delta Frame delta in seconds.
   * @param amount Strength (0..1). Scales the offset, e.g. lower it while the viewer is being looked at.
   */
  public step(delta: number, amount = 1): SaccadeOffset {
    this.timer -= delta;
    if (this.timer <= 0) {
      this.targetX = (this.random() * 2 - 1) * MAX_OFFSET;
      this.targetY = (this.random() * 2 - 1) * MAX_OFFSET;
      this.timer = this.nextInterval();
    }
    const k = 1 - Math.exp(-SACCADE_RATE * delta);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    return { x: this.x * amount, y: this.y * amount };
  }
}
