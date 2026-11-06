import type { Persona } from '../types';

/** Logical avatar parameter names mapped to model-specific Live2D parameter IDs. */
export interface Live2DParamMap {
  angleX: string;
  angleY: string;
  angleZ: string;
  bodyAngleX?: string;
  eyeBallX: string;
  eyeBallY: string;
  mouthOpen: string;
  mouthForm: string;
  breath?: string;
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
