import type {
  CoordConverter,
  EarSide,
  EmotionMoodOffsets,
  ExternalTouchState,
  FaceTouchMode,
  InternalModelLike,
  ParamAccessors,
  Spring1D,
} from './types';
import { EMPTY_EXTERNAL_TOUCH } from './types';
import {
  clamp,
  collectPartDrawables,
  drawableCentroid,
  hitVisible,
  resolveMeshes,
  smoothstep,
  softClamp,
  stepSpring,
} from './math';

export interface EarMoodInput {
  faceMode: FaceTouchMode | null;
  cheekSide: 'left' | 'right';
  eyeSide: 'left' | 'right' | 'both';
  patHappy: number;
  patDragX: number;
  headAngleY: number;
  headAngleZ: number;
  external: ExternalTouchState;
  mood: EmotionMoodOffsets;
}

export interface EarTouchController {
  tryPointerDown(clientX: number, clientY: number): EarSide | null;
  pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number };
  pointerUp(): void;
  setMoodInput(input: EarMoodInput): void;
  stepPostPhysics(dt: number): void;
  applyVertexDeform(): void;
  triggerTwitch(side?: EarSide | 'both', strength?: number): void;
  reset(): void;
}

// Verified Part159 whale-ear drawables & rig parameter mappings from `.moc3`.
// Note: model author cross-named Flip params:
//   Screen-LEFT ear  (x < 0, "<"): LControl, LEar1..3, RFlip (< Flip x), RFlip2 (< Flip y)
//   Screen-RIGHT ear (x > 0, ">"): RControl, REar1..3, LFlip (> Flip x), LFlip2 (> Flip y)
const EAR_CONFIG = {
  left: {
    meshes: ['ArtMesh256', 'ArtMesh257', 'ArtMesh258', 'ArtMesh259', 'ArtMesh260', 'ArtMesh261'],
    control: 'LControl',
    chain: ['LEar1', 'LEar2', 'LEar3'] as const,
    flipX: 'RFlip',
    flipY: 'RFlip2',
    outwardSign: -1,
  },
  right: {
    meshes: ['ArtMesh264', 'ArtMesh265', 'ArtMesh266', 'ArtMesh267', 'ArtMesh268', 'ArtMesh269'],
    control: 'RControl',
    chain: ['REar1', 'REar2', 'REar3'] as const,
    flipX: 'LFlip',
    flipY: 'LFlip2',
    outwardSign: 1,
  },
} as const;

// Parts rendered IN FRONT of Part159 that occlude the inner ear root.
const EAR_OCCLUDER_PARTS = [
  'Part15', 'Part39', 'Part45',
  'Part48', 'Part43', 'Part49',
  'Part37', 'Part35', 'Part36',
  'Part2', 'Part5', 'Part6', 'Part7',
  'Part155', 'Part148',
];

const CTRL_K = 155;
const CTRL_C = 14.5;
const CHAIN_K = [170, 145, 125] as const;
const CHAIN_C = [13.5, 11.2, 9.4] as const;
const FLIP_K = 140;
const FLIP_C = 13.0;

const SQUISH_SIGMA = 0.056;
const SQUISH_MAX = 0.015;
const SQUISH_K = 220;
const SQUISH_C = 16;
const DRAG_NORM_PX = 120;

const NEUTRAL_MOOD: EmotionMoodOffsets = {
  swayScale: 1,
  earPerk: 0,
  earFlare: 0,
  postureY: 0,
  shoulderY: 0,
  headPitch: 0,
  headTilt: 0,
};

interface EarState {
  ctrl: Spring1D;
  chain: [Spring1D, Spring1D, Spring1D];
  flipX: Spring1D;
  flipY: Spring1D;
  targetCtrl: number;
  targetChain: number;
  targetFlipX: number;
  targetFlipY: number;
  squishX: Spring1D;
  squishY: Spring1D;
  targetSquishX: number;
  targetSquishY: number;
  grabRelX: number;
  grabRelY: number;
  rubEnergy: number;
}

function makeEarState(outwardSign: number): EarState {
  return {
    ctrl: { x: 0, v: 0 },
    chain: [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }],
    flipX: { x: 0, v: 0 },
    flipY: { x: 0, v: 0 },
    targetCtrl: 0,
    targetChain: 0,
    targetFlipX: 0,
    targetFlipY: 0,
    squishX: { x: 0, v: 0 },
    squishY: { x: 0, v: 0 },
    targetSquishX: 0,
    targetSquishY: 0,
    grabRelX: outwardSign * 0.135,
    grabRelY: 0.05,
    rubEnergy: 0,
  };
}

/**
 * Whale-ear controller with organic idle twitches (including double-flicks), emotion-coupled
 * perk/droop, touch coordination, 2D drag/rub shiver, and root-locked outer-fin vertex squish.
 */
export function createEarTouchController(
  internal: InternalModelLike,
  params: ParamAccessors,
  coords: CoordConverter,
): EarTouchController {
  const core = internal.coreModel;
  const raw = core._model;

  const noseIdx = core.getDrawableIndex('ArtMesh46');
  const occluders = collectPartDrawables(raw, EAR_OCCLUDER_PARTS);
  const earDrawables: Record<EarSide, number[]> = {
    left: resolveMeshes(core, EAR_CONFIG.left.meshes),
    right: resolveMeshes(core, EAR_CONFIG.right.meshes),
  };

  let activeSide: EarSide | null = null;
  let startClientX = 0;
  let startClientY = 0;
  let lastClientX = 0;
  let lastClientY = 0;
  let startUnitX = 0;
  let startUnitY = 0;
  let elapsed = 0;

  let idleTwitchTimer = 3.2 + Math.random() * 3.5;
  let doubleFlickPending: { side: EarSide; delay: number; strength: number } | null = null;

  const ears: Record<EarSide, EarState> = {
    left: makeEarState(-1),
    right: makeEarState(1),
  };

  let mood: EarMoodInput = {
    faceMode: null,
    cheekSide: 'left',
    eyeSide: 'both',
    patHappy: 0,
    patDragX: 0,
    headAngleY: 0,
    headAngleZ: 0,
    external: { ...EMPTY_EXTERNAL_TOUCH },
    mood: NEUTRAL_MOOD,
  };

  const applyTwitchImpulse = (side: EarSide, strength: number, allowDouble = true): void => {
    const st = ears[side];
    const cfg = EAR_CONFIG[side];
    const s = clamp(strength, 0.25, 1.5);
    st.ctrl.v += 5.2 * s;
    st.chain[0].v += 6.5 * s;
    st.chain[1].v += 4.2 * s;
    st.chain[2].v += 2.8 * s;
    st.flipX.v += -cfg.outwardSign * 3.8 * s;
    st.flipY.v += -2.4 * s;
    if (allowDouble && Math.random() < 0.45) {
      doubleFlickPending = { side, delay: 0.16 + Math.random() * 0.08, strength: s * 0.65 };
    }
  };

  return {
    setMoodInput(next: EarMoodInput): void {
      mood = next;
    },

    stepPostPhysics(dt: number): void {
      elapsed += dt;

      // 1. Handle scheduled second beat of a double-flick twitch.
      if (doubleFlickPending) {
        doubleFlickPending.delay -= dt;
        if (doubleFlickPending.delay <= 0) {
          const { side, strength } = doubleFlickPending;
          doubleFlickPending = null;
          if (activeSide !== side) applyTwitchImpulse(side, strength, false);
        }
      }

      // 2. Random organic idle ear twitch (paused while actively touching ears).
      if (!activeSide) {
        idleTwitchTimer -= dt;
        if (idleTwitchTimer <= 0) {
          idleTwitchTimer = 4.2 + Math.random() * 5.8;
          const roll = Math.random();
          const amp = 0.45 + Math.random() * 0.35;
          if (roll < 0.42) {
            applyTwitchImpulse('left', amp, true);
          } else if (roll < 0.84) {
            applyTwitchImpulse('right', amp, true);
          } else {
            applyTwitchImpulse('left', amp * 0.85, false);
            doubleFlickPending = { side: 'right', delay: 0.11, strength: amp * 0.75 };
          }
        }
      }

      // 3. Step springs combining live head angle, LLM emotion mood, and touch reactions.
      const ext = mood.external;
      for (const side of ['left', 'right'] as const) {
        const st = ears[side];
        const cfg = EAR_CONFIG[side];
        const isDragged = activeSide === side;
        st.rubEnergy = Math.max(0, st.rubEnergy - dt * 2.2);

        let tCtrl = 0;
        let tChain = 0;
        let tFlipX = 0;
        let tFlipY = 0;

        if (isDragged) {
          const shiver = st.rubEnergy > 0.05 ? Math.sin(elapsed * 32) * Math.min(st.rubEnergy, 1) * 0.18 : 0;
          tCtrl = st.targetCtrl + shiver * 0.6;
          tChain = st.targetChain + shiver;
          tFlipX = st.targetFlipX;
          tFlipY = st.targetFlipY;
        } else {
          // Live head coupling + subtle LLM emotion mood baseline.
          const headLift = clamp(-mood.headAngleY * 0.016, -0.22, 0.28);
          const headSway = clamp(mood.headAngleZ * 0.014, -0.22, 0.22) * cfg.outwardSign;
          tCtrl += mood.mood.earPerk * 0.75;
          tChain += headLift + headSway + mood.mood.earPerk;
          tFlipX += cfg.outwardSign * mood.mood.earFlare;
          tFlipY += -mood.mood.earPerk * 0.35;

          if (activeSide && activeSide !== side) {
            tCtrl += -0.22;
            tChain += -0.18;
            tFlipX += -cfg.outwardSign * 0.2;
          } else if (mood.faceMode === 'headpat' || mood.patHappy > 0.02) {
            const h = mood.patHappy;
            tCtrl += 0.32 * h;
            tChain += 0.38 * h + mood.patDragX * 0.28 * cfg.outwardSign;
            tFlipY += -0.2 * h;
          } else if (ext.chest) {
            tCtrl += -0.52;
            tChain += -0.42;
            tFlipX += -cfg.outwardSign * 0.32;
            tFlipY += 0.25;
          } else if (ext.skirt) {
            const lift = clamp(ext.dragY, 0, 1);
            tCtrl += -0.35 - 0.22 * lift;
            tChain += -0.28 - 0.18 * lift;
            tFlipX += -cfg.outwardSign * 0.25;
          } else if (ext.tail) {
            tCtrl += 0.45;
            tChain += 0.52;
            tFlipX += cfg.outwardSign * 0.22;
            tFlipY += -0.28;
          } else if (mood.faceMode === 'eye' && (mood.eyeSide === side || mood.eyeSide === 'both')) {
            tCtrl += -0.45;
            tChain += -0.35;
            tFlipX += -cfg.outwardSign * 0.3;
          } else if (mood.faceMode === 'cheek' && mood.cheekSide === side) {
            tCtrl += -0.18;
            tChain += -0.15;
          }
        }

        stepSpring(st.ctrl, clamp(tCtrl, -1, 1), CTRL_K, CTRL_C, dt);
        stepSpring(st.chain[0], clamp(tChain, -1, 1), CHAIN_K[0], CHAIN_C[0], dt);
        stepSpring(st.chain[1], clamp(tChain * 0.65 + st.chain[0].x * 0.45, -1, 1), CHAIN_K[1], CHAIN_C[1], dt);
        stepSpring(st.chain[2], clamp(tChain * 0.45 + st.chain[1].x * 0.6, -1, 1), CHAIN_K[2], CHAIN_C[2], dt);
        stepSpring(st.flipX, clamp(tFlipX, -1, 1), FLIP_K, FLIP_C, dt);
        stepSpring(st.flipY, clamp(tFlipY, -1, 1), FLIP_K, FLIP_C, dt);

        stepSpring(st.squishX, isDragged ? st.targetSquishX : 0, SQUISH_K, SQUISH_C, dt);
        stepSpring(st.squishY, isDragged ? st.targetSquishY : 0, SQUISH_K, SQUISH_C, dt);

        params.addParam(cfg.control, st.ctrl.x);
        params.addParam(cfg.chain[0], st.chain[0].x);
        params.addParam(cfg.chain[1], st.chain[1].x);
        params.addParam(cfg.chain[2], st.chain[2].x);
        params.addParam(cfg.flipX, st.flipX.x);
        params.addParam(cfg.flipY, st.flipY.x);
      }
    },

    applyVertexDeform(): void {
      const dr = raw?.drawables;
      if (!dr) return;
      const nose = drawableCentroid(raw, noseIdx, 0, 0.588);
      const inv2Sigma2 = 1 / (2 * SQUISH_SIGMA * SQUISH_SIGMA);
      const cutoff2 = (SQUISH_SIGMA * 3.2) * (SQUISH_SIGMA * 3.2);

      for (const side of ['left', 'right'] as const) {
        const st = ears[side];
        if (Math.abs(st.squishX.x) < 1e-5 && Math.abs(st.squishY.x) < 1e-5) continue;
        const cfg = EAR_CONFIG[side];
        const cx = nose.x + st.grabRelX;
        const cy = nose.y + st.grabRelY;

        for (const dIdx of earDrawables[side]) {
          const vp = dr.vertexPositions[dIdx];
          if (!vp) continue;
          for (let i = 0; i < vp.length; i += 2) {
            const vx = vp[i];
            const vy = vp[i + 1];
            const outDist = (vx - nose.x) * cfg.outwardSign;
            if (outDist <= 0.072) continue;
            const rx = vx - cx;
            const ry = vy - cy;
            const d2 = rx * rx + ry * ry;
            if (d2 > cutoff2) continue;

            const rootFree = smoothstep(0.072, 0.115, outDist);
            const w = Math.exp(-d2 * inv2Sigma2) * rootFree;
            if (w <= 1e-4) continue;
            vp[i] = vx + st.squishX.x * w;
            vp[i + 1] = vy + st.squishY.x * w;
          }
        }
      }
    },

    tryPointerDown(clientX: number, clientY: number): EarSide | null {
      const u = coords.screenToUnit(clientX, clientY);
      if (hitVisible(raw, occluders, u.x, u.y)) return null;

      let hitSide: EarSide | null = null;
      for (const side of ['left', 'right'] as const) {
        if (hitVisible(raw, earDrawables[side], u.x, u.y)) {
          hitSide = side;
          break;
        }
      }
      if (!hitSide) return null;

      activeSide = hitSide;
      startClientX = lastClientX = clientX;
      startClientY = lastClientY = clientY;
      startUnitX = u.x;
      startUnitY = u.y;

      const nose = drawableCentroid(raw, noseIdx, 0, 0.588);
      const st = ears[hitSide];
      st.grabRelX = u.x - nose.x;
      st.grabRelY = u.y - nose.y;
      st.targetCtrl = 0;
      st.targetChain = 0;
      st.targetFlipX = 0;
      st.targetFlipY = 0;
      st.targetSquishX = 0;
      st.targetSquishY = 0;

      applyTwitchImpulse(hitSide, 0.95, false);
      return hitSide;
    },

    pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number } {
      if (!activeSide) return { dragX: 0, dragY: 0 };
      const u = coords.screenToUnit(clientX, clientY);
      const dx = u.x - startUnitX;
      const dy = u.y - startUnitY;
      const st = ears[activeSide];
      const cfg = EAR_CONFIG[activeSide];

      const stepPx = Math.hypot(clientX - lastClientX, clientY - lastClientY);
      st.rubEnergy = Math.min(1.5, st.rubEnergy + stepPx / 38);
      lastClientX = clientX;
      lastClientY = clientY;

      const outward = dx * cfg.outwardSign;
      const inwardFold = Math.min(0, outward);
      st.targetCtrl = softClamp(dy * 9.5 + inwardFold * 4.5, 0.95);
      st.targetChain = softClamp(dy * 10.5 + inwardFold * 5.5 + Math.max(0, outward) * 1.4, 0.95);
      st.targetFlipX = softClamp(-dx * 12.0, 0.95);
      st.targetFlipY = softClamp(-dy * 10.0, 0.9);

      st.targetSquishX = softClamp(dx * 0.28, SQUISH_MAX);
      st.targetSquishY = softClamp(dy * 0.16, SQUISH_MAX * 0.7);

      return {
        dragX: clamp((clientX - startClientX) / DRAG_NORM_PX, -1, 1),
        dragY: clamp((startClientY - clientY) / DRAG_NORM_PX, -1, 1),
      };
    },

    pointerUp(): void {
      if (activeSide) {
        const st = ears[activeSide];
        st.targetCtrl = 0;
        st.targetChain = 0;
        st.targetFlipX = 0;
        st.targetFlipY = 0;
        st.targetSquishX = 0;
        st.targetSquishY = 0;
      }
      activeSide = null;
    },

    triggerTwitch(side: EarSide | 'both' = 'both', strength = 0.75): void {
      if (side === 'both') {
        applyTwitchImpulse('left', strength, false);
        applyTwitchImpulse('right', strength * 0.9, false);
      } else {
        applyTwitchImpulse(side, strength, false);
      }
    },

    reset(): void {
      activeSide = null;
      doubleFlickPending = null;
      for (const side of ['left', 'right'] as const) {
        const st = ears[side];
        st.ctrl.x = st.ctrl.v = 0;
        for (const c of st.chain) { c.x = 0; c.v = 0; }
        st.flipX.x = st.flipX.v = 0;
        st.flipY.x = st.flipY.v = 0;
        st.squishX.x = st.squishX.v = 0;
        st.squishY.x = st.squishY.v = 0;
        st.targetCtrl = st.targetChain = st.targetFlipX = st.targetFlipY = 0;
        st.targetSquishX = st.targetSquishY = 0;
        st.rubEnergy = 0;
      }
    },
  };
}
