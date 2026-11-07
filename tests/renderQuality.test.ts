import { describe, expect, it } from 'vitest';
import { MAX_RESOLUTION, resolveRenderQuality } from '../src/avatar/renderQuality';

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
});
