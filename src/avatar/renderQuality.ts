/** Renderer settings derived from the display's pixel ratio. */
export interface RenderQuality {
  /** Pixel ratio the canvas renders at. */
  resolution: number;
  /** MSAA is redundant at high pixel ratios and costly on high-DPR tiled GPUs. */
  antialias: boolean;
}

/** Resolution cap (rendering above 2x costs fill rate for no visible gain). */
export const MAX_RESOLUTION = 2;

/**
 * Picks the canvas resolution and antialiasing for a display without downgrading mobile visuals.
 * Caps resolution at {@link MAX_RESOLUTION} and enables MSAA whenever the rendered resolution
 * is below 2x so anime lineart stays crisp on both desktop and mobile screens.
 * @param devicePixelRatio The display's `window.devicePixelRatio` (invalid values fall back to 1).
 */
export function resolveRenderQuality(devicePixelRatio: number): RenderQuality {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const resolution = Math.min(dpr, MAX_RESOLUTION);
  return { resolution, antialias: resolution < 2 };
}
