import * as PIXI from 'pixi.js';
import type {
  CoordConverter,
  CoreModelLike,
  EmotionMoodOffsets,
  Live2DModelLike,
  ParamAccessors,
  RawCubismModel,
  Spring1D,
} from './types';

/** Measured 2-link arm geometry & rig constants from DeepSeek-chan's `.moc3`. */
export const ARM_L1 = 0.245;
export const ARM_L2 = 0.253;
export const ARM_THETA1_REST_DEG = -77.3;
export const ARM_PHI_REST_DEG = 19.9;
export const ARM_REST_HAND_LOCAL_X = 0.190;
export const ARM_REST_HAND_LOCAL_Y = -0.452;

const RAD_TO_DEG = 180 / Math.PI;
// Semi-implicit Euler stays stable well below dt < 2/sqrt(K); even for the stiffest rig spring
// (K=280 -> limit 0.119s), 1/60s gives >7x safety margin while halving sub-step work on mobile.
const MAX_SPRING_SUBSTEP = 1 / 60;

/** Clamps `v` into `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Smooth hyperbolic tangent soft saturation within `(-lim, +lim)`. */
export function softClamp(v: number, lim: number): number {
  return lim * Math.tanh(v / lim);
}

/** Cubic Hermite smoothstep in `[0, 1]`. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach toward `target`. */
export function approach(cur: number, target: number, rate: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

/**
 * Advances a 1D damped spring using sub-stepped semi-implicit Euler so stiff springs
 * stay numerically stable across frame drops.
 */
export function stepSpring(s: Spring1D, target: number, k: number, c: number, dt: number): void {
  if (dt <= 0) return;
  const steps = Math.max(1, Math.ceil(dt / MAX_SPRING_SUBSTEP));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (k * (target - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
}

/**
 * Steps a passively coupled cascading spring chain (e.g. hair segments from root to tip).
 * Each child trails its parent plus a tip-weighted direct share for a clean traveling wave.
 */
export function stepHairChain(
  segs: Spring1D[],
  rootTarget: number,
  kArr: readonly number[],
  cArr: readonly number[],
  tipWeight: number,
  dt: number,
): void {
  const n = segs.length;
  for (let i = 0; i < n; i++) {
    const depth = n > 1 ? i / (n - 1) : 1;
    const directShare = rootTarget * (0.72 + 0.34 * depth * tipWeight);
    const target = i === 0
      ? clamp(directShare, -1, 1)
      : clamp(segs[i - 1].x * 0.78 + directShare * 0.24, -1, 1);
    stepSpring(segs[i], target, kArr[i], cArr[i], dt);
  }
}

/**
 * Solves 2-bone analytical IK in mirrored shoulder-local coordinates (`lx` outward, `ly` up).
 * Always picks the natural elbow-down/outward branch so elbow flexion stays `>= 0` (no hyperextension).
 */
export function solveArmIK(
  targetLocalX: number,
  targetLocalY: number,
  elbowDegPerUnit: number,
): { upper: number; elbow: number; persp: number } {
  const rawDist = Math.hypot(targetLocalX, targetLocalY);
  const d = clamp(rawDist, 0.14, ARM_L1 + ARM_L2 - 0.006);
  const alpha = Math.atan2(targetLocalY, targetLocalX);

  const cosBeta = clamp((ARM_L1 * ARM_L1 + d * d - ARM_L2 * ARM_L2) / (2 * ARM_L1 * d), -1, 1);
  const beta = Math.acos(cosBeta);
  const theta1Deg = (alpha - beta) * RAD_TO_DEG;

  const cosGamma = clamp((ARM_L1 * ARM_L1 + ARM_L2 * ARM_L2 - d * d) / (2 * ARM_L1 * ARM_L2), -1, 1);
  const phiDeg = (Math.PI - Math.acos(cosGamma)) * RAD_TO_DEG;

  const dTheta1 = theta1Deg - ARM_THETA1_REST_DEG;
  const upper = dTheta1 >= 0
    ? clamp(dTheta1 / 125, 0, 0.82)
    : clamp(dTheta1 / 28, -0.62, 0);

  const dPhi = Math.max(0, phiDeg - ARM_PHI_REST_DEG);
  const elbow = clamp(dPhi / elbowDegPerUnit, 0, 0.82);

  // Subtle upper-arm foreshortening as the forearm raises/curls toward torso.
  const persp = clamp(elbow * 0.42 + Math.max(0, upper) * 0.14, 0, 0.5);
  return { upper, elbow, persp };
}

/**
 * Exact point-in-triangle-mesh hit test in 2D coordinates with an AABB early reject.
 */
export function pointInTriangleMesh(
  vp: Float32Array,
  indices: Uint16Array,
  ux: number,
  uy: number,
): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < vp.length; i += 2) {
    const x = vp[i];
    const y = vp[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (ux < minX || ux > maxX || uy < minY || uy > maxY) return false;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 2;
    const i1 = indices[i + 1] * 2;
    const i2 = indices[i + 2] * 2;
    const ax = vp[i0];
    const ay = vp[i0 + 1];
    const bx = vp[i1];
    const by = vp[i1 + 1];
    const cx = vp[i2];
    const cy = vp[i2 + 1];

    const v0x = cx - ax;
    const v0y = cy - ay;
    const v1x = bx - ax;
    const v1y = by - ay;
    const v2x = ux - ax;
    const v2y = uy - ay;
    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;
    const denom = dot00 * dot11 - dot01 * dot01;
    if (Math.abs(denom) < 1e-12) continue;
    const inv = 1 / denom;
    const u = (dot11 * dot02 - dot01 * dot12) * inv;
    const v = (dot00 * dot12 - dot01 * dot02) * inv;
    if (u >= -1e-4 && v >= -1e-4 && u + v <= 1 + 1e-4) return true;
  }
  return false;
}

/** Tests whether Cubism unit point `(ux, uy)` lies inside a drawable's rigged mesh. */
export function pointInDrawable(
  raw: RawCubismModel | undefined,
  drawableIndex: number,
  ux: number,
  uy: number,
): boolean {
  if (drawableIndex < 0 || !raw?.drawables) return false;
  const vp = raw.drawables.vertexPositions[drawableIndex];
  const indices = raw.drawables.indices[drawableIndex];
  if (!vp || !indices) return false;
  return pointInTriangleMesh(vp, indices, ux, uy);
}

/** Returns true if any visible drawable in `drawables` contains `(ux, uy)`. */
export function hitVisible(
  raw: RawCubismModel | undefined,
  drawables: readonly number[],
  ux: number,
  uy: number,
): boolean {
  const opacities = raw?.drawables?.opacities;
  if (!opacities) return false;
  return drawables.some((i) => opacities[i] > 0.05 && pointInDrawable(raw, i, ux, uy));
}

/** Collects all drawable indices belonging to any part in `partIds` (including descendants). */
export function collectPartDrawables(
  raw: RawCubismModel | undefined,
  partIds: readonly string[],
): number[] {
  const parts = raw?.parts;
  const dr = raw?.drawables;
  if (!parts || !dr) return [];
  const inSet = new Set<number>();
  const ids = Array.from(parts.ids);
  for (const id of partIds) {
    const idx = ids.indexOf(id);
    if (idx >= 0) inSet.add(idx);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < parts.count; i++) {
      const p = parts.parentIndices[i];
      if (p >= 0 && inSet.has(p) && !inSet.has(i)) {
        inSet.add(i);
        changed = true;
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < dr.count; i++) {
    if (inSet.has(dr.parentPartIndices[i])) out.push(i);
  }
  return out;
}

/** Resolves ArtMesh IDs into valid drawable indices. */
export function resolveMeshes(core: CoreModelLike, ids: readonly string[]): number[] {
  return ids.map((id) => core.getDrawableIndex(id)).filter((i) => i >= 0);
}

/** Computes the vertex centroid of a drawable in Cubism unit space. */
export function drawableCentroid(
  raw: RawCubismModel | undefined,
  drawableIndex: number,
  fallbackX = 0,
  fallbackY = 0.59,
): { x: number; y: number } {
  if (drawableIndex < 0 || !raw?.drawables) return { x: fallbackX, y: fallbackY };
  const vp = raw.drawables.vertexPositions[drawableIndex];
  if (!vp || vp.length === 0) return { x: fallbackX, y: fallbackY };
  let sx = 0;
  let sy = 0;
  const n = vp.length / 2;
  for (let i = 0; i < vp.length; i += 2) {
    sx += vp[i];
    sy += vp[i + 1];
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: fallbackX, y: fallbackY };
}

/** Computes the combined AABB of `drawables` in Cubism unit space. */
export function getBoundsModelSpace(
  raw: RawCubismModel | undefined,
  drawables: readonly number[],
  requireVisible = true,
): { minX: number; maxX: number; minY: number; maxY: number; valid: boolean } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const dr = raw?.drawables;
  if (!dr) return { minX, maxX, minY, maxY, valid: false };

  for (const idx of drawables) {
    if (requireVisible && dr.opacities[idx] < 0.05) continue;
    const vp = dr.vertexPositions[idx];
    if (!vp) continue;
    for (let i = 0; i < vp.length; i += 2) {
      const x = vp[i];
      const y = vp[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY, valid: Number.isFinite(minX) };
}

interface ParamSlot {
  index: number;
  min: number;
  max: number;
}

/**
 * Creates clamped O(1) parameter read/write helpers with cached indices and bounds.
 * Uses `setParameterValueByIndex` when available to avoid Cubism's per-call O(N) string scan
 * over all 509 parameters, and rejects out-of-range missing-parameter indices safely.
 */
export function createParamAccessors(core: CoreModelLike): ParamAccessors {
  const slotCache = new Map<string, ParamSlot | null>();
  const paramCount = typeof core.getParameterCount === 'function'
    ? core.getParameterCount()
    : Infinity;
  const writeByIndex = typeof core.setParameterValueByIndex === 'function'
    ? (slot: ParamSlot, _id: string, value: number) => core.setParameterValueByIndex!(slot.index, value)
    : (_slot: ParamSlot, id: string, value: number) => core.setParameterValueById(id, value);

  const getSlot = (id: string): ParamSlot | null => {
    let slot = slotCache.get(id);
    if (slot === undefined) {
      const index = core.getParameterIndex(id);
      if (index < 0 || index >= paramCount) {
        slot = null;
      } else {
        const min = core.getParameterMinimumValue(index);
        const max = core.getParameterMaximumValue(index);
        slot = Number.isFinite(min) && Number.isFinite(max) ? { index, min, max } : null;
      }
      slotCache.set(id, slot);
    }
    return slot;
  };

  return {
    hasParam(id: string): boolean {
      return getSlot(id) !== null;
    },

    getParam(id: string): number {
      const slot = getSlot(id);
      return slot ? core.getParameterValueByIndex(slot.index) : 0;
    },

    setParam(id: string, value: number): void {
      const slot = getSlot(id);
      if (!slot) return;
      writeByIndex(slot, id, clamp(value, slot.min, slot.max));
    },

    addParam(id: string, delta: number): void {
      if (Math.abs(delta) < 1e-4) return;
      const slot = getSlot(id);
      if (!slot) return;
      const cur = core.getParameterValueByIndex(slot.index);
      writeByIndex(slot, id, clamp(cur + delta, slot.min, slot.max));
    },

    addScaled(id: string, normalizedDelta: number): void {
      if (Math.abs(normalizedDelta) < 1e-4) return;
      const slot = getSlot(id);
      if (!slot) return;
      const cur = core.getParameterValueByIndex(slot.index);
      const delta = normalizedDelta >= 0 ? normalizedDelta * slot.max : -normalizedDelta * slot.min;
      writeByIndex(slot, id, clamp(cur + delta, slot.min, slot.max));
    },
  };
}

/**
 * Builds viewport -> model-canvas / Cubism-unit converters that stay accurate when the
 * canvas is offset or resized (e.g. chess split-screen mode).
 */
export function createCoordConverter(
  model: Live2DModelLike,
  view: HTMLCanvasElement,
  screen: { width: number; height: number },
): CoordConverter {
  const internal = model.internalModel;
  const pt = new PIXI.Point();

  const screenToModel = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = view.getBoundingClientRect();
    const scaleX = rect.width > 0 ? screen.width / rect.width : 1;
    const scaleY = rect.height > 0 ? screen.height / rect.height : 1;
    pt.set((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    const mp = model.toModelPosition(pt);
    return { x: mp.x, y: mp.y };
  };

  const screenToUnit = (clientX: number, clientY: number): { x: number; y: number } => {
    const mp = screenToModel(clientX, clientY);
    const ppu = internal.pixelsPerUnit;
    return {
      x: (mp.x - internal.originalWidth / 2) / ppu,
      y: -(mp.y - internal.originalHeight / 2) / ppu,
    };
  };

  return { screenToModel, screenToUnit };
}

/**
 * Derives subtle body-language and whale-ear mood offsets from Viera's active emotion spec.
 * Kept gentle so touch reactions, gaze, and lip-sync always remain clear and natural.
 */
export function computeEmotionMoodOffsets(
  base: string | null,
  baseWeight: number,
  modifiers: Record<string, number>,
): EmotionMoodOffsets {
  const w = clamp(baseWeight, 0, 1);
  const blush = clamp(modifiers.blush ?? 0, 0, 1);
  const gloom = clamp(modifiers.gloom ?? 0, 0, 1);
  const coldSweat = clamp(modifiers['cold-sweat'] ?? 0, 0, 1);

  let swayScale = 1;
  let earPerk = 0;
  let earFlare = 0;
  let postureY = 0;
  let shoulderY = 0;
  let headPitch = 0;
  let headTilt = 0;

  switch (base) {
    case 'happy':
      swayScale = 1 + 0.18 * w;
      earPerk += 0.28 * w;
      earFlare += 0.1 * w;
      postureY += 1.6 * w;
      shoulderY -= 2.5 * w;
      headTilt += 2.2 * w;
      break;
    case 'teasing':
      swayScale = 1 + 0.1 * w;
      earPerk += 0.18 * w;
      headTilt += 4.2 * w;
      headPitch += 1.2 * w;
      break;
    case 'pouting':
      swayScale = 1 - 0.12 * w;
      earPerk -= 0.22 * w;
      earFlare -= 0.14 * w;
      headTilt -= 3.0 * w;
      shoulderY += 3.5 * w;
      break;
    case 'jealous':
      swayScale = 1 - 0.15 * w;
      earPerk -= 0.26 * w;
      earFlare -= 0.16 * w;
      headPitch -= 1.5 * w;
      shoulderY += 4.0 * w;
      break;
    case 'sad':
      swayScale = 1 - 0.35 * w;
      earPerk -= 0.45 * w;
      earFlare -= 0.22 * w;
      postureY -= 2.8 * w;
      headPitch -= 4.0 * w;
      shoulderY -= 3.5 * w;
      break;
    case 'angry':
      swayScale = 1 - 0.22 * w;
      earPerk -= 0.3 * w;
      earFlare -= 0.25 * w;
      postureY += 1.2 * w;
      shoulderY += 6.5 * w;
      headPitch -= 2.0 * w;
      break;
    case 'surprised':
      swayScale = 1 - 0.1 * w;
      earPerk += 0.42 * w;
      earFlare += 0.18 * w;
      postureY += 2.2 * w;
      shoulderY += 7.5 * w;
      headPitch += 2.5 * w;
      break;
    case 'terrified':
      swayScale = 1 - 0.3 * w;
      earPerk -= 0.48 * w;
      earFlare -= 0.32 * w;
      postureY -= 3.2 * w;
      shoulderY += 11.0 * w;
      headPitch -= 2.5 * w;
      break;
    default:
      break;
  }

  // Layer modifier nuances cleanly.
  if (blush > 0) {
    earPerk -= 0.16 * blush;
    earFlare -= 0.1 * blush;
    headPitch -= 1.8 * blush;
    shoulderY += 3.0 * blush;
  }
  if (gloom > 0) {
    swayScale *= 1 - 0.2 * gloom;
    earPerk -= 0.22 * gloom;
    postureY -= 1.8 * gloom;
    headPitch -= 2.5 * gloom;
  }
  if (coldSweat > 0) {
    earPerk -= 0.14 * coldSweat;
    shoulderY += 4.0 * coldSweat;
  }

  return {
    swayScale: clamp(swayScale, 0.45, 1.35),
    earPerk: clamp(earPerk, -0.75, 0.65),
    earFlare: clamp(earFlare, -0.5, 0.4),
    postureY: clamp(postureY, -5, 4),
    shoulderY: clamp(shoulderY, -8, 14),
    headPitch: clamp(headPitch, -7, 5),
    headTilt: clamp(headTilt, -6, 6),
  };
}
