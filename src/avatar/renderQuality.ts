/** Renderer settings derived from the display's pixel ratio. */
export interface RenderQuality {
  /** Pixel ratio the canvas renders at. */
  resolution: number;
  /** MSAA is redundant at high pixel ratios and costs fill rate. */
  antialias: boolean;
}

/** Rendering above this pixel ratio costs a lot of fill rate for no visible gain. */
export const MAX_RESOLUTION = 2;

/**
 * Picks the canvas resolution and antialiasing for a display.
 * The resolution is capped at {@link MAX_RESOLUTION}; antialiasing is only
 * enabled below a pixel ratio of 2, where edges would otherwise look jagged.
 * @param devicePixelRatio The display's `window.devicePixelRatio` (invalid values fall back to 1).
 */
export function resolveRenderQuality(devicePixelRatio: number): RenderQuality {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const resolution = Math.min(dpr, MAX_RESOLUTION);
  return { resolution, antialias: resolution < 2 };
}
