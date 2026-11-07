import type { Persona } from '../types';

/** A parameter that moves with the breath. */
export interface BreathTarget {
  /** Model parameter ID. */
  id: string;
  /** Offset in parameter units reached at full inhale. Negative values reverse the direction. */
  amount: number;
  /** `chest` follows the breath directly; `shoulder` and `head` trail it slightly. */
  channel: 'chest' | 'shoulder' | 'head';
}

/** A parameter nudged by a jiggle spring. */
export interface JiggleTarget {
  /** Model parameter ID. */
  id: string;
  /** Scales the -1..1 jiggle sample. Negative values reverse the direction. */
  amount: number;
  /** Which jiggle axis drives it. */
  axis: 'x' | 'y';
  /** When true, `amount` is a fraction of the parameter's half-range instead of raw units. */
  relative?: boolean;
}

/** An arm parameter driven by idle sway and speaking gestures. */
export interface ArmTarget {
  /** Model parameter ID. */
  id: string;
  /** Fraction of the parameter's half-range reached at full swing. Negative reverses the direction. */
  amount: number;
  /**
   * Which signal drives it. `lift` is the smoothed head pitch (-1..1); use it with an
   * `amount` that rotates the arm or shoulder against the tilt so the arm keeps hanging down.
   */
  channel: 'arm' | 'forearm' | 'wrist' | 'hand' | 'lift';
  /** Which arm it belongs to. */
  side: 'l' | 'r';
}

/** A hip parameter driven by the standing weight shift or the breath. */
export interface HipTarget {
  /** Model parameter ID. */
  id: string;
  /** Fraction of the parameter's half-range reached at full swing. Negative reverses the direction. */
  amount: number;
  /** `shift` is the slow side-to-side weight shift; `breath` is the tiny breath-driven rise and fall. */
  channel: 'shift' | 'breath';
}

/** Logical avatar parameter names mapped to model-specific Live2D parameter IDs. */
export interface Live2DParamMap {
  angleX: string;
  angleY: string;
  angleZ: string;
  bodyAngleX?: string;
  bodyAngleZ?: string;
  eyeBallX: string;
  eyeBallY: string;
  mouthOpen: string;
  mouthForm: string;
  breath?: string;
  /**
   * Extra parameters nudged by the breath, added on top of whatever motion and physics
   * already set this frame (so physics-driven bounce is kept).
   */
  breathTargets?: BreathTarget[];
  /**
   * Parameters driven by the chest jiggle spring, added on top of physics output.
   * `amount` scales the -1..1 jiggle sample (negative reverses the direction).
   */
  jiggleTargets?: JiggleTarget[];
  /**
   * Ribbon and bow parameters swung by a looser spring that trails the head.
   * Added on top of physics output.
   */
  ribbonTargets?: JiggleTarget[];
  /**
   * Skirt parameters swung by a soft spring that trails the body.
   * Added on top of physics output.
   */
  skirtTargets?: JiggleTarget[];
  /** Hip parameters for the standing weight shift and breath coupling, added on top of physics output. */
  hipTargets?: HipTarget[];
  /** Arm and hand parameters for idle sway and speaking gestures, added on top of physics output. */
  armTargets?: ArmTarget[];
  /** Optional vowel parameters driven by lip-sync visemes. */
  visemes?: { a: string; i: string; u: string; e: string; o: string };
}

/** Parameter ID -> target value. Unlisted parameters relax back to their default. */
export type EmotionParams = Record<string, number>;

export interface CharacterModelConfig {
  /** URL of the Live2D `.model3.json` (Cubism 3/4), URL-encoded if it contains non-ASCII characters */
  modelUrl: string;
  /** Model height as a fraction of the viewport height (e.g. 0.9) */
  scale: number;
  /** Where the model's center sits in the viewport, as fractions [x, y] (0..1) */
  anchor: [number, number];
  /** Model-specific parameter IDs */
  params: Live2DParamMap;
  /** Emotion ID -> parameter targets. Emotions without an entry fall back to the default. */
  emotions: Record<string, EmotionParams>;
  /**
   * Modifier ID -> parameter deltas at full weight (1.0). They are scaled by the weight and
   * added on top of the base emotion, so `sad+blush:low` mixes both.
   */
  modifiers?: Record<string, EmotionParams>;
  /**
   * Mask render textures needed by the model (default 1). Cubism fits 36 clipping masks
   * in one; each extra texture adds 32. Check the console for "not supported mask count".
   */
  maskRenderTextures?: number;
  /** Attribution text required by the model license */
  credits?: string;
}

/**
 * Self-contained character package: a Persona plus the Live2D model
 * configuration used by the viewport.
 */
export interface CharacterPackage extends Persona {
  /** Live2D model and viewport specs */
  model: CharacterModelConfig;
}
