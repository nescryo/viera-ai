/** One sampled breathing state. All values are normalized, 0 = fully exhaled, 1 = fully inhaled. */
export interface BreathSample {
  /** Inhale level (0..1) for the model's breath parameter. Leads the other channels. */
  level: number;
  /** Smoothed rate of change (-1..1). Positive while inhaling. */
  velocity: number;
  /** Shoulder lift (0..1). Follows `level` with a short lag. */
  shoulder: number;
  /** Head lift (0..1). Follows `level` with a longer lag than the shoulders. */
  head: number;
}

/** Share of the cycle spent inhaling. */
const INHALE_END = 0.38;
/** Share of the cycle where the exhale finishes; the rest is a short rest before the next breath. */
const EXHALE_END = 0.9;
/** Each breath reaches a different depth within this range (1 = full). */
const MIN_DEPTH = 0.7;
/** Response speed (1/s) of the lagged channels. */
const SHOULDER_RATE = 3.2;
const HEAD_RATE = 2;

/** Eases 0..1 with zero slope at both ends. */
function easeInOut(x: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/** Deterministic pseudo-random value in 0..1 for a breath index. */
function hash01(n: number): number {
  const v = Math.sin((n + 1) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Natural breathing cycle: a shorter inhale, a longer exhale, a brief rest, a
 * different depth on every breath, and a slowly drifting period. The shoulders
 * and head trail the chest slightly, as they do on a real body.
 * Holds only numeric state, so it can be unit-tested without a renderer.
 */
export class BreathingCycle {
  private phase = 0;
  private breathIndex = 0;
  private depth = 1;
  private shoulder = 0;
  private head = 0;
  private readonly period: number;

  /** @param period Average seconds per breath (default 4.2). */
  constructor(period = 4.2) {
    this.period = period;
    this.depth = this.depthFor(0);
  }

  private depthFor(index: number): number {
    return MIN_DEPTH + (1 - MIN_DEPTH) * hash01(index);
  }

  /**
   * Advances the cycle.
   * @param delta Frame delta in seconds.
   * @param elapsed Elapsed time in seconds (drives the period drift).
   */
  public step(delta: number, elapsed: number): BreathSample {
    // Period varies by about +/-12% on a slow wave.
    const drift = 0.12 * Math.sin(elapsed * 0.37) + 0.05 * Math.sin(elapsed * 0.91);
    this.phase += delta / (this.period * (1 + drift));
    if (this.phase >= 1) {
      this.phase %= 1;
      this.breathIndex += 1;
      this.depth = this.depthFor(this.breathIndex);
    }

    const p = this.phase;
    let shape: number;
    let velocity: number;
    if (p < INHALE_END) {
      const x = p / INHALE_END;
      shape = easeInOut(x);
      velocity = Math.sin(Math.PI * x);
    } else if (p < EXHALE_END) {
      const x = (p - INHALE_END) / (EXHALE_END - INHALE_END);
      shape = 1 - easeInOut(x);
      velocity = -Math.sin(Math.PI * x) * 0.6;
    } else {
      shape = 0;
      velocity = 0;
    }

    const level = shape * this.depth;
    this.shoulder += (level - this.shoulder) * (1 - Math.exp(-SHOULDER_RATE * delta));
    this.head += (level - this.head) * (1 - Math.exp(-HEAD_RATE * delta));
    return { level, velocity: velocity * this.depth, shoulder: this.shoulder, head: this.head };
  }
}
