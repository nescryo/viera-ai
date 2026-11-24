import { describe, expect, it } from 'vitest';
import {
  DESKTOP_PHYSICS_FPS,
  isMobileDevice,
  MAX_RESOLUTION,
  MOBILE_MAX_RESOLUTION,
  MOBILE_PHYSICS_FPS,
  resolvePhysicsFps,
  resolveRenderQuality,
  setPhysicsFps,
} from '../src/avatar/renderQuality';

describe('resolveRenderQuality', () => {
  it('keeps antialiasing on standard displays', () => {
    expect(resolveRenderQuality(1)).toEqual({ resolution: 1, antialias: true });
    expect(resolveRenderQuality(1.5)).toEqual({ resolution: 1.5, antialias: true });
  });

  it('turns antialiasing off at pixel ratio 2', () => {
    expect(resolveRenderQuality(2)).toEqual({ resolution: 2, antialias: false });
  });

  it('caps the resolution on very dense displays', () => {
    expect(resolveRenderQuality(3).resolution).toBe(MAX_RESOLUTION);
    expect(resolveRenderQuality(3).antialias).toBe(false);
  });

  it('falls back to 1 for invalid values', () => {
    expect(resolveRenderQuality(0).resolution).toBe(1);
    expect(resolveRenderQuality(NaN).resolution).toBe(1);
  });

  it('caps resolution lower and disables antialiasing on mobile displays', () => {
    expect(resolveRenderQuality(3, true)).toEqual({
      resolution: MOBILE_MAX_RESOLUTION,
      antialias: false,
    });
    expect(resolveRenderQuality(1, true)).toEqual({
      resolution: 1,
      antialias: false,
    });
  });
});

describe('mobile viewport & physics FPS helpers', () => {
  it('detects mobile via narrow width or coarse pointer', () => {
    expect(isMobileDevice({ innerWidth: 390 })).toBe(true);
    expect(isMobileDevice({ innerWidth: 1280, matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(isMobileDevice({ innerWidth: 1280, matchMedia: () => ({ matches: false }) })).toBe(false);
  });

  it('selects 30Hz physics on mobile and 60Hz on desktop', () => {
    expect(resolvePhysicsFps(true)).toBe(MOBILE_PHYSICS_FPS);
    expect(resolvePhysicsFps(false)).toBe(DESKTOP_PHYSICS_FPS);
  });

  it('updates internal physics rig fps when present and ignores invalid inputs', () => {
    const internal = { physics: { _physicsRig: { fps: 60 } } };
    setPhysicsFps(internal, 30);
    expect(internal.physics._physicsRig.fps).toBe(30);
    setPhysicsFps(internal, 0);
    expect(internal.physics._physicsRig.fps).toBe(30);
    setPhysicsFps({}, 30);
  });
});
