/**
 * Damped harmonic oscillator integrated with semi-implicit Euler.
 * The value is pulled toward a target like a spring, so motion eases in,
 * overshoots slightly and settles instead of snapping.
 * Holds only numeric state, so it can be unit-tested without a renderer.
 */
export class Spring {
  public value: number;
  public velocity = 0;

  private readonly stiffness: number;
  private readonly damping: number;
  private readonly mass: number;

  /**
   * @param stiffness Spring constant k (default 120).
   * @param damping Damping coefficient c (default 16, slightly under critical for k=120).
   * @param mass Mass m (default 1).
   * @param initial Starting value.
   */
  constructor(stiffness = 120, damping = 16, mass = 1, initial = 0) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
    this.value = initial;
  }

  /**
   * Advances the spring toward `target`.
   * Large deltas are split into sub-steps to keep the integrator stable.
   * @param target Value the spring is attracted to.
   * @param delta Frame delta in seconds.
   * @returns The new value.
   */
  public step(target: number, delta: number): number {
    const maxStep = 1 / 120;
    const steps = Math.max(1, Math.ceil(delta / maxStep));
    const dt = delta / steps;
    for (let i = 0; i < steps; i++) {
      const accel = (this.stiffness * (target - this.value) - this.damping * this.velocity) / this.mass;
      this.velocity += accel * dt;
      this.value += this.velocity * dt;
    }
    return this.value;
  }
}
