import type { Persona } from '../types';

export interface CharacterModelConfig {
  /** Path to character .pmx model (e.g. '/models/firefly/firefly.pmx') */
  pmxUrl: string;
  /** Directory containing model textures and toon maps (e.g. '/models/firefly/') */
  resourcePath: string;
  /** Human height in meters for scale normalization (e.g. 1.65) */
  targetHeight: number;
  /** Initial horizontal and vertical position offset for model group (e.g. [-0.65, 0, 0]) */
  initialOffset: [number, number, number];
  /** Camera portrait framing calibrated for this character */
  cameraFraming: {
    position: [number, number, number];
    lookAt: [number, number, number];
    fov?: number;
  };
  /** Optional custom stage / skydome configuration */
  stage?: {
    pmxUrl: string;
    resourcePath: string;
    textureUrl: string;
    scale: [number, number, number];
    position: [number, number, number];
  };
}

/**
 * Universal, self-contained character package specification.
 * Fully compatible with standard Persona while equipping the 3D viewport with
 * dynamic cel-shading, asset loading, and camera framing directives.
 */
export interface CharacterPackage extends Persona {
  /** 3D model, viewport, and camera specs */
  model: CharacterModelConfig;
}
