/** Renderer settings derived from the display's pixel ratio and form factor. */
export interface RenderQuality {
  /** Pixel ratio the canvas renders at. */
  resolution: number;
  /** MSAA is redundant at high pixel ratios and costly on mobile tiled GPUs. */
  antialias: boolean;
}

/** Desktop resolution cap (rendering above 2x costs fill rate for no visible gain). */
export const MAX_RESOLUTION = 2;
/** Mobile resolution cap to reduce GPU fill-rate on 4K Live2D textures + 49 clipping masks. */
export const MOBILE_MAX_RESOLUTION = 1.25;
/** Cubism physics evaluation rate on desktop (Hz). */
export const DESKTOP_PHYSICS_FPS = 60;
/** Cubism physics evaluation rate on mobile (Hz); Cubism interpolates smoothly between ticks. */
export const MOBILE_PHYSICS_FPS = 30;
/** Viewport width threshold below which a display is treated as mobile. */
export const MOBILE_WIDTH_BREAKPOINT = 768;

/** Minimal viewport environment surface for mobile detection (injectable in tests). */
export interface ViewportEnv {
  innerWidth: number;
  matchMedia?: (query: string) => { matches: boolean };
}

/**
 * Detects touch-primary or compact mobile viewports so rendering and physics budgets adapt
 * without degrading desktop quality.
 */
export function isMobileDevice(env?: ViewportEnv): boolean {
  const win = env ?? (typeof window !== 'undefined' ? window : undefined);
  if (!win) return false;
  if (win.innerWidth <= MOBILE_WIDTH_BREAKPOINT) return true;
  return Boolean(win.matchMedia?.('(pointer: coarse)').matches);
}

/**
 * Picks the canvas resolution and antialiasing for a display.
 * Desktop caps resolution at {@link MAX_RESOLUTION} and disables MSAA at >= 2x.
 * Mobile caps resolution at {@link MOBILE_MAX_RESOLUTION} and disables MSAA to preserve
 * smooth frame pacing on tiled mobile GPUs.
 * @param devicePixelRatio The display's `window.devicePixelRatio` (invalid values fall back to 1).
 * @param isMobile Whether the target viewport is a mobile/touch device.
 */
export function resolveRenderQuality(devicePixelRatio: number, isMobile = false): RenderQuality {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (isMobile) {
    return { resolution: Math.min(dpr, MOBILE_MAX_RESOLUTION), antialias: false };
  }
  const resolution = Math.min(dpr, MAX_RESOLUTION);
  return { resolution, antialias: resolution < 2 };
}

/** Returns the target Cubism physics simulation tick rate (Hz) for the current device class. */
export function resolvePhysicsFps(isMobile: boolean): number {
  return isMobile ? MOBILE_PHYSICS_FPS : DESKTOP_PHYSICS_FPS;
}

/**
 * Overrides the Cubism 4 physics evaluation tick rate on a loaded InternalModel.
 * CubismPhysics linearly interpolates between ticks, so 30Hz stays smooth on 60Hz displays
 * while halving per-frame physics CPU work and temporary array allocations on mobile.
 */
export function setPhysicsFps(internalModel: unknown, fps: number): void {
  if (!Number.isFinite(fps) || fps <= 0) return;
  const rig = (internalModel as { physics?: { _physicsRig?: { fps?: number } } })?.physics?._physicsRig;
  if (rig && typeof rig.fps === 'number') {
    rig.fps = fps;
  }
}
