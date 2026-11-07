import type { EmotionParams } from '../characters/types';

/**
 * Resolves the parameter targets for an emotion, falling back to the default
 * emotion and finally to an empty target (neutral pose).
 */
export function resolveEmotionTargets(
  emotions: Record<string, EmotionParams>,
  emotionId: string,
  fallbackId: string
): EmotionParams {
  return emotions[emotionId] ?? emotions[fallbackId] ?? {};
}

/**
 * Resolves a base emotion plus weighted modifiers into parameter targets. The base preset is
 * scaled by `baseWeight`; each modifier's parameter deltas (defined at weight 1) are scaled by
 * its weight and added on top.
 * @param modifierDefs Modifier ID -> parameter deltas at full weight.
 * @param weights Modifier ID -> weight in 0..1. Unknown modifiers are ignored.
 */
export function resolveExpressionTargets(
  emotions: Record<string, EmotionParams>,
  modifierDefs: Record<string, EmotionParams> | undefined,
  emotionId: string,
  weights: Record<string, number>,
  fallbackId: string,
  baseWeight = 1
): EmotionParams {
  const targets: EmotionParams = {};
  for (const [paramId, value] of Object.entries(resolveEmotionTargets(emotions, emotionId, fallbackId))) {
    targets[paramId] = value * baseWeight;
  }
  for (const [modifierId, weight] of Object.entries(weights)) {
    const deltas = modifierDefs?.[modifierId];
    if (!deltas) continue;
    for (const [paramId, delta] of Object.entries(deltas)) {
      targets[paramId] = (targets[paramId] ?? 0) + delta * weight;
    }
  }
  return targets;
}

/** Frame-rate independent exponential smoothing factor. */
export function smoothFactor(rate: number, delta: number): number {
  return 1 - Math.exp(-rate * delta);
}

/**
 * Smoothly blends Live2D parameters toward emotion targets. Parameters that
 * were driven before but are absent from the new target relax back to 0.
 * Holds only numeric state, so it can be unit-tested without a renderer.
 */
export class ParamBlender {
  private current = new Map<string, number>();

  private readonly rate: number;

  constructor(rate = 7) {
    this.rate = rate;
  }

  /**
   * Advances the blend by one frame.
   * @param targets Parameter ID -> target value for the active emotion.
   * @param delta Frame delta in seconds.
   * @returns Parameter ID -> current blended value (all parameters ever driven).
   */
  public step(targets: EmotionParams, delta: number): ReadonlyMap<string, number> {
    for (const id of Object.keys(targets)) {
      if (!this.current.has(id)) this.current.set(id, 0);
    }
    const k = smoothFactor(this.rate, delta);
    for (const [id, value] of this.current) {
      const target = targets[id] ?? 0;
      this.current.set(id, value + (target - value) * k);
    }
    return this.current;
  }
}
