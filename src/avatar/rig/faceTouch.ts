import type {
  CoordConverter,
  ExternalTouchState,
  FaceTouchMode,
  FaceTouchSnapshot,
  InternalModelLike,
  ParamAccessors,
  Spring1D,
} from './types';
import { EMPTY_EXTERNAL_TOUCH } from './types';
import {
  approach,
  clamp,
  collectPartDrawables,
  drawableCentroid,
  getBoundsModelSpace,
  hitVisible,
  pointInDrawable,
  smoothstep,
  softClamp,
  stepSpring,
} from './math';

export interface FaceTouchController {
  tryPointerDown(clientX: number, clientY: number): FaceTouchMode | null;
  pointerMove(clientX: number, clientY: number): void;
  pointerUp(): void;
  setExternalTouch(state: ExternalTouchState): void;
  stepPrePhysics(dt: number): void;
  stepPostPhysics(dt: number): void;
  applyVertexDeform(): void;
  getSnapshot(): FaceTouchSnapshot;
  reset(): void;
}

// Face parts whose meshes + clipping masks deform together under outer-cheek pull.
// Mouth (Part12) and nose (Part46) stay untouched.
const FACE_DEFORM_PARTS = [
  'Part15', 'Part39', 'Part45',
  'Part59', 'Part60', 'Part79',
];
// Direct children of Part99 that lie on the face (blush + face overlays).
const FACE_EXTRA_MESHES = [
  'ArtMesh327', 'ArtMesh328', 'ArtMesh335', 'ArtMesh338',
  'ArtMesh340', 'ArtMesh341',
];
const HEADPAT_PARTS = ['Part2', 'Part161', 'Part34'];
const EYE_LEFT_PARTS = ['Part48', 'Part43', 'Part49'];
const EYE_RIGHT_PARTS = ['Part37', 'Part35', 'Part36'];

// Outer-cheek pinch deformation constants (in Cubism model units; face width ~0.215).
const CHEEK_SIGMA = 0.044;
const CHEEK_MAX_OUTWARD = 0.015;
const CHEEK_MAX_INWARD = 0.006;
const CHEEK_MAX_Y = 0.008;
const CHEEK_DRAG_GAIN_X = 0.36;
const CHEEK_DRAG_GAIN_Y = 0.25;
const CHEEK_POKE_PUSH = 0.002;
const CHEEK_K = 240;
const CHEEK_C = 17;

const HEAD_K = 120;
const HEAD_C = 17;
const PAT_DRAG_RANGE = 130;

/**
 * Interactive face touch controller: outer-cheek elastic pull (with center/chin/eye protection),
 * eye poke flinch, headpat smile/blush, and coordinated facial reactions for all external touches.
 */
export function createFaceTouchController(
  internal: InternalModelLike,
  params: ParamAccessors,
  coords: CoordConverter,
): FaceTouchController {
  const core = internal.coreModel;
  const raw = core._model;

  const faceSkinIdx = core.getDrawableIndex('ArtMesh245');
  const faceJawIdx = core.getDrawableIndex('ArtMesh109');
  const noseIdx = core.getDrawableIndex('ArtMesh46');
  const eyeLeftDrawables = collectPartDrawables(raw, EYE_LEFT_PARTS);
  const eyeRightDrawables = collectPartDrawables(raw, EYE_RIGHT_PARTS);
  const eyeAllDrawables = [...eyeLeftDrawables, ...eyeRightDrawables];
  const headpatDrawables = collectPartDrawables(raw, HEADPAT_PARTS);

  // Build deduplicated face vertex-deformation drawable set (including clipping masks).
  const deformSet = new Set<number>(collectPartDrawables(raw, FACE_DEFORM_PARTS));
  for (const id of FACE_EXTRA_MESHES) {
    const idx = core.getDrawableIndex(id);
    if (idx >= 0) deformSet.add(idx);
  }
  const dr = raw?.drawables;
  if (dr) {
    const initialList = Array.from(deformSet);
    for (const idx of initialList) {
      const mc = dr.maskCounts[idx];
      const masks = dr.masks[idx];
      for (let m = 0; m < mc; m++) {
        const mid = masks[m];
        const name = dr.ids[mid] ?? '';
        const num = /^ArtMesh(\d+)$/.exec(name);
        if (num && Number(num[1]) >= 28 && Number(num[1]) <= 43) continue;
        deformSet.add(mid);
      }
    }
  }
  const faceDeformDrawables = Array.from(deformSet);

  let mode: FaceTouchMode | null = null;
  let cheekSide: 'left' | 'right' = 'left';
  let eyeSide: 'left' | 'right' | 'both' = 'both';
  let startClientX = 0;
  let startClientY = 0;
  let lastClientX = 0;
  let lastClientY = 0;
  let startUnitX = 0;
  let startUnitY = 0;

  const grabRel = { x: -0.055, y: -0.03 };
  const cheekTarget = { x: 0, y: 0 };
  const cheekSpringX: Spring1D = { x: 0, v: 0 };
  const cheekSpringY: Spring1D = { x: 0, v: 0 };

  const headSpringX: Spring1D = { x: 0, v: 0 };
  const headSpringY: Spring1D = { x: 0, v: 0 };
  const headSpringZ: Spring1D = { x: 0, v: 0 };

  let patHoldTime = 0;
  let patRubEnergy = 0;
  const patDrag = { x: 0, y: 0 };

  const react = {
    blush: 0,
    blushHold: 0,
    patHappy: 0,
    eyePokeL: 0,
    eyePokeR: 0,
    chestShy: 0,
    skirtShy: 0,
    clothReact: 0,
    tailShy: 0,
    earReact: 0,
    cheekReact: 0,
    eyeX: 0,
    eyeY: 0,
    browL: 0,
    browR: 0,
    mouthForm: 0,
    mouthX: 0,
    mouthOpen: 0,
    mouthPucker: 0,
    squintL: 0,
    squintR: 0,
  };

  let lastEarSide: 'left' | 'right' = 'left';
  let external: ExternalTouchState = { ...EMPTY_EXTERNAL_TOUCH };

  return {
    setExternalTouch(state: ExternalTouchState): void {
      external = state;
      if (state.ear) lastEarSide = state.ear;
    },

    stepPrePhysics(dt: number): void {
      // 1. Update headpat rub & happiness progression.
      if (mode === 'headpat') {
        patHoldTime += dt;
        patRubEnergy = Math.max(0, patRubEnergy - dt * 1.4);
        const happyRate = patRubEnergy > 0.15 ? 4.2 : 1.7;
        const targetHappy = patHoldTime > 0.08 || patRubEnergy > 0.1 ? 1 : 0.45;
        react.patHappy = approach(react.patHappy, targetHappy, happyRate, dt);
        react.blushHold = Math.max(react.blushHold, 2.2);
      } else {
        patHoldTime = 0;
        patRubEnergy = Math.max(0, patRubEnergy - dt * 3.0);
        react.patHappy = approach(react.patHappy, 0, 3.2, dt);
      }

      // 2. Update touch reaction envelopes.
      react.cheekReact = approach(react.cheekReact, mode === 'cheek' ? 1 : 0, mode === 'cheek' ? 10 : 4.5, dt);
      react.eyePokeL = approach(
        react.eyePokeL,
        mode === 'eye' && (eyeSide === 'left' || eyeSide === 'both') ? 1 : 0,
        mode === 'eye' ? 18 : 6,
        dt,
      );
      react.eyePokeR = approach(
        react.eyePokeR,
        mode === 'eye' && (eyeSide === 'right' || eyeSide === 'both') ? 1 : 0,
        mode === 'eye' ? 18 : 6,
        dt,
      );
      react.chestShy = approach(react.chestShy, external.chest ? 1 : 0, external.chest ? 6.5 : 2.2, dt);
      react.skirtShy = approach(react.skirtShy, external.skirt ? 1 : 0, external.skirt ? 7.0 : 2.6, dt);
      react.clothReact = approach(react.clothReact, external.cloth ? 1 : 0, external.cloth ? 7.5 : 3.2, dt);
      react.tailShy = approach(react.tailShy, external.tail ? 1 : 0, external.tail ? 8.0 : 2.5, dt);
      react.earReact = approach(react.earReact, external.ear ? 1 : 0, external.ear ? 9.0 : 2.8, dt);

      if (mode === 'cheek') react.blushHold = Math.max(react.blushHold, 1.4);
      if (mode === 'eye') react.blushHold = Math.max(react.blushHold, 1.0);
      if (external.chest) react.blushHold = Math.max(react.blushHold, 2.6);
      if (external.skirt) react.blushHold = Math.max(react.blushHold, 2.0);
      if (external.tail) react.blushHold = Math.max(react.blushHold, 2.2);
      if (external.ear) react.blushHold = Math.max(react.blushHold, 2.0);
      if (external.cloth && (external.cloth.region === 'garter' || external.cloth.region === 'bow' || external.cloth.region === 'waist')) {
        react.blushHold = Math.max(react.blushHold, 1.6);
      }

      let targetBlush = 0;
      if (external.chest) targetBlush = Math.max(targetBlush, 0.92);
      if (external.skirt) targetBlush = Math.max(targetBlush, 0.58 + 0.28 * clamp(external.dragY, 0, 1));
      if (external.tail) targetBlush = Math.max(targetBlush, 0.68);
      if (external.ear) targetBlush = Math.max(targetBlush, 0.62);
      if (external.cloth) {
        const r = external.cloth.region;
        const b = r === 'garter' ? 0.62 : r === 'bow' || r === 'waist' ? 0.45 : 0.2;
        targetBlush = Math.max(targetBlush, b);
      }
      if (mode === 'headpat') targetBlush = Math.max(targetBlush, 0.25 + 0.55 * react.patHappy);
      if (mode === 'cheek') targetBlush = Math.max(targetBlush, 0.48);
      if (mode === 'eye') targetBlush = Math.max(targetBlush, 0.32);

      if (targetBlush > 0) {
        react.blush = approach(react.blush, targetBlush, 3.8, dt);
      } else if (react.blushHold > 0) {
        react.blushHold = Math.max(0, react.blushHold - dt);
        react.blush = approach(react.blush, react.blush * 0.88, 0.5, dt);
      } else {
        react.blush = approach(react.blush, 0, 1.2, dt);
      }

      // 3. Step cheek elastic spring.
      stepSpring(cheekSpringX, mode === 'cheek' ? cheekTarget.x : 0, CHEEK_K, CHEEK_C, dt);
      stepSpring(cheekSpringY, mode === 'cheek' ? cheekTarget.y : 0, CHEEK_K, CHEEK_C, dt);

      // 4. Compute desired head angle (degrees) for touch reactions.
      let htx = 0;
      let hty = 0;
      let htz = 0;
      if (mode === 'headpat') {
        htx = patDrag.x * 11;
        hty = -5.5 - 3.5 * react.patHappy + patDrag.y * 6;
        htz = patDrag.x * 16;
      } else if (mode === 'cheek') {
        const nx = clamp(cheekSpringX.x / CHEEK_MAX_OUTWARD, -1, 1);
        const ny = clamp(cheekSpringY.x / CHEEK_MAX_Y, -1, 1);
        htx = nx * 7.5;
        hty = ny * 4;
        htz = nx * 6 + (cheekSide === 'left' ? -1.5 : 1.5) * react.cheekReact;
      } else if (mode === 'eye') {
        hty = 6;
        htx = eyeSide === 'left' ? 8 : eyeSide === 'right' ? -8 : 0;
        htz = eyeSide === 'left' ? 7 : eyeSide === 'right' ? -7 : 0;
      } else if (external.chest) {
        htx = (external.chest === 'left' ? 6 : -6) + external.dragX * 5;
        hty = -9 + external.dragY * 3.5;
        htz = (external.chest === 'left' ? -6.5 : 6.5) + external.dragX * 5;
      } else if (external.skirt) {
        const sideBias = external.skirt === 'left' ? -4 : external.skirt === 'right' ? 4 : 0;
        htx = sideBias + external.dragX * 4;
        hty = -6.5 - clamp(external.dragY, 0, 1) * 3;
        htz = -sideBias * 0.8 + external.dragX * 3.5;
      } else if (external.cloth) {
        const sideBias = external.cloth.side === 'left' ? -4 : external.cloth.side === 'right' ? 4 : 0;
        const isLow = external.cloth.region === 'garter' || external.cloth.region === 'waist' || external.cloth.region === 'backBow';
        htx = sideBias + external.dragX * 4;
        hty = (isLow ? -5.5 : -3.0) + external.dragY * 2.5;
        htz = sideBias * 0.5 + external.dragX * 4;
      } else if (external.tail) {
        const sideBias = external.tail === 'left' ? -6 : external.tail === 'right' ? 6 : 0;
        htx = sideBias + external.dragX * 4.5;
        hty = -7 + external.dragY * 3;
        htz = -sideBias * 0.7 + external.dragX * 4;
      } else if (external.ear) {
        const sideBias = external.ear === 'left' ? -1 : 1;
        htx = -sideBias * 7 + external.dragX * 5;
        hty = -4.5 + external.dragY * 4;
        htz = sideBias * 9 + external.dragX * 5;
      } else if (external.hair === 'side') {
        htx = external.dragX * 7;
        hty = external.dragY * 4;
        htz = external.dragX * 9;
      } else if (external.arm) {
        htx = (external.arm === 'screenRight' ? 6 : -6) + external.dragX * 5;
        hty = -2.0 + external.dragY * 7.5;
        htz = (external.arm === 'screenRight' ? 3.5 : -3.5) + external.dragX * 4;
      }

      stepSpring(headSpringX, htx, HEAD_K, HEAD_C, dt);
      stepSpring(headSpringY, hty, HEAD_K, HEAD_C, dt);
      stepSpring(headSpringZ, htz, HEAD_K, HEAD_C, dt);

      // 5. Compute smooth facial expression deltas layered on top of Viera's LLM emotion.
      let tEyeX = 0;
      let tEyeY = 0;
      let tBrowL = 0;
      let tBrowR = 0;
      let tMouthForm = 0;
      let tMouthX = 0;
      let tMouthOpen = 0;
      let tMouthPucker = 0;
      let tSquintL = 0;
      let tSquintR = 0;

      if (react.patHappy > 0.01) {
        tBrowL += 0.25 * react.patHappy;
        tBrowR += 0.25 * react.patHappy;
        tMouthForm += 0.8 * react.patHappy;
      }

      if (react.cheekReact > 0.01) {
        const nx = clamp(cheekSpringX.x / CHEEK_MAX_OUTWARD, -1, 1);
        const ny = clamp(cheekSpringY.x / CHEEK_MAX_Y, -1, 1);
        const w = react.cheekReact;
        tEyeX += (cheekSide === 'left' ? -0.32 : 0.32) * w + nx * 0.12;
        tEyeY += -0.15 * w + ny * 0.1;
        tMouthX += clamp(nx * 0.25, -0.35, 0.35);
        const upPush = clamp(ny * 0.7, 0, 1) * w;
        if (cheekSide === 'left') tSquintR += 0.35 * upPush;
        else tSquintL += 0.35 * upPush;
      }

      if (react.eyePokeL > 0.01 || react.eyePokeR > 0.01) {
        const p = Math.max(react.eyePokeL, react.eyePokeR);
        tBrowR -= 0.4 * react.eyePokeL;
        tBrowL -= 0.4 * react.eyePokeR;
        tSquintR += 0.6 * react.eyePokeL;
        tSquintL += 0.6 * react.eyePokeR;
        tMouthForm -= 0.35 * p;
        tMouthOpen += 0.22 * p;
      }

      if (react.chestShy > 0.01) {
        const w = react.chestShy;
        tBrowL -= 0.55 * w;
        tBrowR -= 0.55 * w;
        tSquintL += 0.55 * w;
        tSquintR += 0.55 * w;
        tMouthForm -= 0.55 * w;
        tMouthPucker += 0.3 * w;
        tEyeY -= 0.42 * w;
        tEyeX += (external.chest === 'left' ? 0.35 : -0.35) * w;
      }

      if (react.skirtShy > 0.01) {
        const w = react.skirtShy;
        const lift = clamp(external.dragY, 0, 1);
        tBrowL -= 0.3 * w;
        tBrowR -= 0.3 * w;
        tSquintL += (0.25 + 0.25 * lift) * w;
        tSquintR += (0.25 + 0.25 * lift) * w;
        tMouthForm -= 0.3 * w;
        tMouthOpen += 0.16 * lift * w;
        tEyeY -= 0.55 * w;
        tEyeX += (external.skirt === 'left' ? -0.35 : external.skirt === 'right' ? 0.35 : 0) * w;
      }

      if (react.clothReact > 0.01 && external.cloth) {
        const w = react.clothReact;
        const { region, side } = external.cloth;
        const sx = side === 'left' ? -0.45 : side === 'right' ? 0.45 : 0;
        tEyeX += sx * w;
        tEyeY += (region === 'garter' ? -0.6 : region === 'waist' || region === 'backBow' ? -0.45 : -0.3) * w;
        if (region === 'garter' || region === 'bow' || region === 'waist') {
          tBrowL -= 0.2 * w;
          tBrowR -= 0.2 * w;
          tSquintL += 0.2 * w;
          tSquintR += 0.2 * w;
          tMouthForm -= 0.2 * w;
        }
      }

      if (react.tailShy > 0.01) {
        const w = react.tailShy;
        const pullMag = clamp(Math.hypot(external.dragX, external.dragY), 0, 1);
        tEyeX += (external.tail === 'left' ? -0.55 : external.tail === 'right' ? 0.55 : 0) * w;
        tEyeY -= 0.55 * w;
        tBrowL -= 0.28 * w;
        tBrowR -= 0.28 * w;
        tSquintL += (0.3 + 0.25 * pullMag) * w;
        tSquintR += (0.3 + 0.25 * pullMag) * w;
        tMouthForm -= 0.22 * w;
        tMouthOpen += 0.18 * pullMag * w;
      }

      if (react.earReact > 0.01) {
        const w = react.earReact;
        const s = lastEarSide === 'left' ? -1 : 1;
        tEyeX += s * 0.45 * w;
        tEyeY += 0.22 * w;
        tBrowL -= 0.22 * w;
        tBrowR -= 0.22 * w;
        if (lastEarSide === 'left') {
          tSquintR += 0.52 * w;
          tSquintL += 0.2 * w;
        } else {
          tSquintL += 0.52 * w;
          tSquintR += 0.2 * w;
        }
        tMouthForm -= 0.16 * w;
        tMouthOpen += 0.15 * w;
      }

      if (external.arm) {
        tEyeX += clamp((external.arm === 'screenRight' ? 0.5 : -0.5) + external.dragX * 0.35, -0.9, 0.9);
        tEyeY += clamp(-0.35 + external.dragY * 0.75, -0.7, 0.65);
      } else if (external.hair === 'side') {
        tEyeX += clamp(external.dragX * 0.6, -0.6, 0.6);
      }

      const r = 9;
      react.eyeX = approach(react.eyeX, tEyeX, r, dt);
      react.eyeY = approach(react.eyeY, tEyeY, r, dt);
      react.browL = approach(react.browL, tBrowL, r, dt);
      react.browR = approach(react.browR, tBrowR, r, dt);
      react.mouthForm = approach(react.mouthForm, tMouthForm, r, dt);
      react.mouthX = approach(react.mouthX, tMouthX, 14, dt);
      react.mouthOpen = approach(react.mouthOpen, tMouthOpen, r, dt);
      react.mouthPucker = approach(react.mouthPucker, tMouthPucker, r, dt);
      react.squintL = approach(react.squintL, tSquintL, 12, dt);
      react.squintR = approach(react.squintR, tSquintR, 12, dt);
    },

    stepPostPhysics(_dt: number): void {
      if (Math.abs(headSpringX.x) > 1e-3 || Math.abs(headSpringY.x) > 1e-3 || Math.abs(headSpringZ.x) > 1e-3) {
        params.addParam('ParamAngleX', headSpringX.x);
        params.addParam('ParamAngleY', headSpringY.x);
        params.addParam('ParamAngleZ', headSpringZ.x);
      }

      // Preserve LLM/manual expression blush if stronger.
      if (react.blush > 1e-3) {
        const cur = params.getParam('key7');
        params.setParam('key7', Math.max(cur, react.blush));
      }

      // Model ParamEyeROpen = screen-left eye; ParamEyeLOpen = screen-right eye.
      const earWinceScreenLeft = (lastEarSide === 'left' ? 0.34 : 0.1) * react.earReact;
      const earWinceScreenRight = (lastEarSide === 'right' ? 0.34 : 0.1) * react.earReact;
      const closeScreenLeft = clamp(Math.max(react.patHappy, react.eyePokeL, earWinceScreenLeft), 0, 1);
      const closeScreenRight = clamp(Math.max(react.patHappy, react.eyePokeR, earWinceScreenRight), 0, 1);
      const shyNarrow = 1 - 0.22 * react.chestShy;

      if (closeScreenLeft > 1e-3 || react.chestShy > 1e-3) {
        const curR = params.getParam('ParamEyeROpen');
        params.setParam('ParamEyeROpen', curR * shyNarrow * (1 - closeScreenLeft));
      }
      if (closeScreenRight > 1e-3 || react.chestShy > 1e-3) {
        const curL = params.getParam('ParamEyeLOpen');
        params.setParam('ParamEyeLOpen', curL * shyNarrow * (1 - closeScreenRight));
      }
      if (react.patHappy > 1e-3) params.addScaled('EyeSmile', react.patHappy);
      if (react.squintR > 1e-3) params.addScaled('REyeSquint', react.squintR);
      if (react.squintL > 1e-3) params.addScaled('LEyeSquint', react.squintL);

      if (Math.abs(react.eyeX) > 1e-3) params.addScaled('ParamEyeBallX', react.eyeX);
      if (Math.abs(react.eyeY) > 1e-3) params.addScaled('ParamEyeBallY', react.eyeY);
      if (Math.abs(react.browL) > 1e-3) params.addScaled('ParamBrowLY', react.browL);
      if (Math.abs(react.browR) > 1e-3) params.addScaled('ParamBrowRY', react.browR);
      if (Math.abs(react.mouthForm) > 1e-3) params.addScaled('ParamMouthForm', react.mouthForm);
      if (Math.abs(react.mouthX) > 1e-3) params.addScaled('MouthX', react.mouthX);
      if (react.mouthOpen > 1e-3) params.addScaled('ParamMouthOpenY', react.mouthOpen);
      if (react.mouthPucker > 1e-3) params.addScaled('Mouthpucker', react.mouthPucker);

      const sxNorm = clamp(cheekSpringX.x / CHEEK_MAX_OUTWARD, -1, 1);
      const syNorm = clamp(cheekSpringY.x / CHEEK_MAX_Y, -1, 1);
      if (Math.abs(sxNorm) > 1e-4 || Math.abs(syNorm) > 1e-4) {
        params.addScaled('CheeksWiggleX', sxNorm * 0.35);
        params.addScaled('CheeksWiggleY', syNorm * 0.35);
        if (cheekSide === 'left') {
          const outward = clamp(-sxNorm, 0, 1);
          params.addScaled('CheeckPuffR', outward * 0.55);
          params.addScaled('CheeksWiggleXR', sxNorm * 0.4);
        } else {
          const outward = clamp(sxNorm, 0, 1);
          params.addScaled('CheeckPuffL', outward * 0.55);
          params.addScaled('CheeksWiggleXL', -sxNorm * 0.4);
        }
      }
    },

    applyVertexDeform(): void {
      const drawables = raw?.drawables;
      if (!drawables) return;
      const outwardX = cheekSide === 'left' ? Math.min(0, cheekSpringX.x) : Math.max(0, cheekSpringX.x);
      const outwardMag = Math.abs(outwardX);
      if (outwardMag < 1e-5) return;

      const yScale = clamp(outwardMag / (CHEEK_MAX_OUTWARD * 0.5), 0, 1);
      const pullY = cheekSpringY.x * yScale;

      const nose = drawableCentroid(raw, noseIdx, 0, 0.588);
      const cx = nose.x + grabRel.x;
      const cy = nose.y + grabRel.y;
      const inv2Sigma2 = 1 / (2 * CHEEK_SIGMA * CHEEK_SIGMA);

      const chinLo = nose.y - 0.072;
      const chinHi = nose.y - 0.040;
      const eyeLo = nose.y - 0.008;
      const eyeHi = nose.y + 0.022;
      const isLeft = cheekSide === 'left';

      for (const dIdx of faceDeformDrawables) {
        const vp = drawables.vertexPositions[dIdx];
        if (!vp) continue;
        for (let i = 0; i < vp.length; i += 2) {
          const vx = vp[i];
          const vy = vp[i + 1];
          const sideDist = isLeft ? (nose.x - vx) : (vx - nose.x);
          if (sideDist <= 0.032) continue;
          if (vy <= chinLo || vy >= eyeHi) continue;
          const rx = vx - cx;
          const ry = vy - cy;
          const d2 = rx * rx + ry * ry;
          if (d2 > 0.025) continue;

          const centerProtect = smoothstep(0.032, 0.068, sideDist);
          const chinProtect = smoothstep(chinLo, chinHi, vy);
          const eyeProtect = 1 - smoothstep(eyeLo, eyeHi, vy);
          const w = Math.exp(-d2 * inv2Sigma2) * centerProtect * chinProtect * eyeProtect;
          if (w <= 1e-4) continue;

          vp[i] = vx + outwardX * w;
          vp[i + 1] = vy + pullY * w;
        }
      }
    },

    tryPointerDown(clientX: number, clientY: number): FaceTouchMode | null {
      const u = coords.screenToUnit(clientX, clientY);
      const eyeBounds = getBoundsModelSpace(raw, eyeAllDrawables, true);
      const eyeBottom = eyeBounds.valid ? eyeBounds.minY : 0.587;
      const eyeTop = eyeBounds.valid ? eyeBounds.maxY : 0.628;
      const nose = drawableCentroid(raw, noseIdx, 0, 0.588);

      const inFace = pointInDrawable(raw, faceJawIdx, u.x, u.y) ||
        pointInDrawable(raw, faceSkinIdx, u.x, u.y);

      if (inFace && u.y <= eyeBottom + 0.004) {
        mode = 'cheek';
        cheekSide = u.x < nose.x ? 'left' : 'right';
        const rawSide = Math.abs(u.x - nose.x);
        const clampedSide = clamp(rawSide, 0.062, 0.088);
        grabRel.x = cheekSide === 'left' ? -clampedSide : clampedSide;
        grabRel.y = clamp(u.y - nose.y, -0.048, -0.020);
        startClientX = lastClientX = clientX;
        startClientY = lastClientY = clientY;
        startUnitX = u.x;
        startUnitY = u.y;
        cheekTarget.x = (cheekSide === 'left' ? 1 : -1) * CHEEK_POKE_PUSH;
        cheekTarget.y = -CHEEK_POKE_PUSH * 0.35;
        return 'cheek';
      }

      const hitLeftEye = hitVisible(raw, eyeLeftDrawables, u.x, u.y);
      const hitRightEye = hitVisible(raw, eyeRightDrawables, u.x, u.y);
      if (hitLeftEye || hitRightEye || (inFace && u.y > eyeBottom + 0.004 && u.y <= eyeTop + 0.004)) {
        mode = 'eye';
        eyeSide = hitLeftEye && !hitRightEye ? 'left'
          : hitRightEye && !hitLeftEye ? 'right'
            : Math.abs(u.x - nose.x) < 0.015 ? 'both'
              : u.x < nose.x ? 'left' : 'right';
        startClientX = lastClientX = clientX;
        startClientY = lastClientY = clientY;
        return 'eye';
      }

      const inUpperHead = u.y >= eyeTop - 0.01 && (
        inFace || hitVisible(raw, headpatDrawables, u.x, u.y)
      );
      if (inUpperHead) {
        mode = 'headpat';
        startClientX = lastClientX = clientX;
        startClientY = lastClientY = clientY;
        patDrag.x = 0;
        patDrag.y = 0;
        return 'headpat';
      }

      return null;
    },

    pointerMove(clientX: number, clientY: number): void {
      if (!mode) return;
      if (mode === 'cheek') {
        const u = coords.screenToUnit(clientX, clientY);
        const rawDx = u.x - startUnitX;
        const rawDy = u.y - startUnitY;
        const basePokeX = (cheekSide === 'left' ? 1 : -1) * CHEEK_POKE_PUSH;
        const dragMag = Math.hypot(rawDx, rawDy);
        const pokeFade = 1 - smoothstep(0.003, 0.015, dragMag);
        const combinedX = rawDx * CHEEK_DRAG_GAIN_X + basePokeX * pokeFade;
        const outward = cheekSide === 'left' ? combinedX < 0 : combinedX > 0;
        const xLim = outward ? CHEEK_MAX_OUTWARD : CHEEK_MAX_INWARD;
        cheekTarget.x = softClamp(combinedX, xLim);
        cheekTarget.y = softClamp(rawDy * CHEEK_DRAG_GAIN_Y - CHEEK_POKE_PUSH * 0.35 * pokeFade, CHEEK_MAX_Y);
      } else if (mode === 'headpat') {
        patDrag.x = clamp((clientX - startClientX) / PAT_DRAG_RANGE, -1, 1);
        patDrag.y = clamp((startClientY - clientY) / PAT_DRAG_RANGE, -1, 1);
        const stepDist = Math.hypot(clientX - lastClientX, clientY - lastClientY);
        patRubEnergy = Math.min(2, patRubEnergy + stepDist / 45);
      }
      lastClientX = clientX;
      lastClientY = clientY;
    },

    pointerUp(): void {
      mode = null;
      cheekTarget.x = 0;
      cheekTarget.y = 0;
      patDrag.x = 0;
      patDrag.y = 0;
    },

    getSnapshot(): FaceTouchSnapshot {
      return {
        mode,
        cheekSide,
        eyeSide,
        patHappy: react.patHappy,
        patDragX: patDrag.x,
        patDragY: patDrag.y,
        cheekXNorm: clamp(cheekSpringX.x / CHEEK_MAX_OUTWARD, -1, 1),
        cheekYNorm: clamp(cheekSpringY.x / CHEEK_MAX_Y, -1, 1),
        headAngleY: headSpringY.x,
        headAngleZ: headSpringZ.x,
      };
    },

    reset(): void {
      mode = null;
      cheekTarget.x = cheekTarget.y = 0;
      cheekSpringX.x = cheekSpringX.v = 0;
      cheekSpringY.x = cheekSpringY.v = 0;
      headSpringX.x = headSpringX.v = 0;
      headSpringY.x = headSpringY.v = 0;
      headSpringZ.x = headSpringZ.v = 0;
      patDrag.x = patDrag.y = 0;
      patHoldTime = 0;
      patRubEnergy = 0;
      react.blush = 0;
      react.blushHold = 0;
      react.patHappy = 0;
      react.earReact = 0;
      external = { ...EMPTY_EXTERNAL_TOUCH };
    },
  };
}
