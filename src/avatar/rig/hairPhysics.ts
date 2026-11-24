import type {
  CoordConverter,
  HairGroup,
  InternalModelLike,
  ParamAccessors,
  Spring1D,
} from './types';
import { clamp, drawableCentroid, resolveMeshes, softClamp, stepHairChain, stepSpring } from './math';

export interface HairPhysicsInput {
  patActive: boolean;
  patDragX: number;
  patDragY: number;
  patHappy: number;
}

export interface HairPhysicsController {
  tryPointerDown(clientX: number, clientY: number): HairGroup | null;
  pointerMove(clientX: number, clientY: number, dt: number): { dragX: number; dragY: number };
  pointerUp(): void;
  setInput(input: HairPhysicsInput): void;
  stepPostPhysics(dt: number): void;
  triggerImpulse(dirX: number, liftY?: number): void;
  reset(): void;
}

const range = (a: number, b: number): string[] =>
  Array.from({ length: b - a + 1 }, (_, i) => `ArtMesh${a + i}`);

// All 26 verified active hair parameters from DeepSeek-chan's `.moc3`.
// Probed signs: +X moves hair screen-right; +Y lifts/floats hair up; +LateHairZ swings back hair screen-right.
const HAIR_DEF = {
  front: {
    xParams: ['FrontHairX1', 'FrontHairX2', 'FrontHairX3', 'FrontHairX4'] as const,
    yParams: ['FrontHairY1', 'FrontHairY2', 'FrontHairY3', 'FrontHairY4'] as const,
    meshes: [...range(3, 8), ...range(22, 25), 'ArtMesh199', 'ArtMesh200'],
    kX: [115, 92, 74, 60] as const,
    cX: [8.4, 7.5, 6.7, 6.0] as const,
    kY: [125, 100, 80, 64] as const,
    cY: [9.0, 8.0, 7.2, 6.4] as const,
    gravScale: 0.56,
    inertiaX: 0.72,
    inertiaY: 0.85,
    breezeAmp: 0.024,
    breezePhase: 0.0,
  },
  side: {
    xParams: ['SideHairX1', 'SideHairX2', 'SideHairX3', 'SideHairX4'] as const,
    yParams: ['SideHairY1', 'SideHairY2', 'SideHairY3', 'SideHairY4'] as const,
    meshes: [
      'ArtMesh0', 'ArtMesh2', ...range(9, 19), 'ArtMesh26', 'ArtMesh27',
      ...range(112, 121), 'ArtMesh201', 'ArtMesh255',
    ],
    kX: [92, 74, 58, 46] as const,
    cX: [7.2, 6.4, 5.7, 5.1] as const,
    kY: [104, 82, 64, 50] as const,
    cY: [7.8, 7.0, 6.2, 5.5] as const,
    gravScale: 0.92,
    inertiaX: 1.0,
    inertiaY: 1.08,
    breezeAmp: 0.038,
    breezePhase: 1.4,
  },
  late: {
    xParams: ['LateHairX1', 'LateHairX2', 'LateHairX3', 'LateHairX4', 'LateHairX5'] as const,
    yParams: ['LateHairY1', 'LateHairY2', 'LateHairY3', 'LateHairY4'] as const,
    meshes: [...range(160, 170), ...range(172, 184), 'ArtMesh330', 'ArtMesh339'],
    kX: [82, 66, 52, 42, 34] as const,
    cX: [7.0, 6.3, 5.6, 5.1, 4.7] as const,
    kY: [94, 74, 58, 46] as const,
    cY: [7.8, 7.0, 6.2, 5.6] as const,
    gravScale: 1.02,
    inertiaX: 1.12,
    inertiaY: 1.18,
    breezeAmp: 0.048,
    breezePhase: 2.7,
  },
} as const;

const HIT_ORDER: readonly HairGroup[] = ['front', 'late', 'side'];
const LATE_HAIR_Z_PARAM = 'LateHairZ';
const LATE_Z_K = 52;
const LATE_Z_C = 5.6;

const DRAG_RANGE = 155;
const DRAG_GAIN = 0.78;
const DEG_TO_RAD = Math.PI / 180;

interface HairChainState {
  x: Spring1D[];
  y: Spring1D[];
}

function makeChain(nx: number, ny: number): HairChainState {
  return {
    x: Array.from({ length: nx }, () => ({ x: 0, v: 0 })),
    y: Array.from({ length: ny }, () => ({ x: 0, v: 0 })),
  };
}

/**
 * Multi-segment cascading hair physics (26 hair params + heavy back-hair pendulum `LateHairZ`)
 * driven by world-space gravity drape, head linear/angular inertia, headpat rub, and touch drag.
 */
export function createHairPhysicsController(
  internal: InternalModelLike,
  params: ParamAccessors,
  coords: CoordConverter,
): HairPhysicsController {
  const core = internal.coreModel;
  const raw = core._model;

  const noseIdx = core.getDrawableIndex('ArtMesh46');
  const groupDrawables: Record<HairGroup, number[]> = {
    front: resolveMeshes(core, HAIR_DEF.front.meshes),
    late: resolveMeshes(core, HAIR_DEF.late.meshes),
    side: resolveMeshes(core, HAIR_DEF.side.meshes),
  };

  let activeGroup: HairGroup | null = null;
  let startX = 0;
  let startY = 0;
  let lastClientX = 0;
  let lastClientY = 0;
  const dragTarget = { x: 0, y: 0 };
  const dragVel = { x: 0, y: 0 };

  let input: HairPhysicsInput = {
    patActive: false,
    patDragX: 0,
    patDragY: 0,
    patHappy: 0,
  };

  const chains: Record<HairGroup, HairChainState> = {
    front: makeChain(HAIR_DEF.front.xParams.length, HAIR_DEF.front.yParams.length),
    side: makeChain(HAIR_DEF.side.xParams.length, HAIR_DEF.side.yParams.length),
    late: makeChain(HAIR_DEF.late.xParams.length, HAIR_DEF.late.yParams.length),
  };
  const lateZ: Spring1D = { x: 0, v: 0 };

  let elapsed = 0;
  let hasPrev = false;
  let prevHeadX = 0;
  let prevHeadY = 0.59;
  let prevAngleX = 0;
  let prevAngleY = 0;
  let prevAngleZ = 0;
  let prevBodyZ = 0;
  let prevBodyY = 0;
  let smoothVelX = 0;
  let smoothVelY = 0;
  let smoothVelAngZ = 0;
  let smoothVelAngX = 0;
  let smoothVelAngY = 0;

  const hitAny = (drawables: readonly number[], clientX: number, clientY: number): boolean => {
    const opacities = raw?.drawables?.opacities;
    if (!opacities) return false;
    const p = coords.screenToModel(clientX, clientY);
    const b = { x: 0, y: 0, width: 0, height: 0 };
    for (const i of drawables) {
      if (opacities[i] < 0.05) continue;
      internal.getDrawableBounds(i, b);
      if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) return true;
    }
    return false;
  };

  return {
    setInput(next: HairPhysicsInput): void {
      input = next;
    },

    stepPostPhysics(dt: number): void {
      elapsed += dt;
      dragVel.x *= Math.exp(-12 * dt);
      dragVel.y *= Math.exp(-12 * dt);

      const ax = params.getParam('ParamAngleX');
      const ay = params.getParam('ParamAngleY');
      const az = params.getParam('ParamAngleZ');
      const bz = params.getParam('ParamBodyAngleZ');
      const by = params.getParam('ParamBodyAngleY');
      const headPos = drawableCentroid(raw, noseIdx, 0, 0.59);

      if (!hasPrev) {
        hasPrev = true;
        prevHeadX = headPos.x;
        prevHeadY = headPos.y;
        prevAngleX = ax;
        prevAngleY = ay;
        prevAngleZ = az;
        prevBodyZ = bz;
        prevBodyY = by;
      }

      const invDt = 1 / Math.max(dt, 1 / 120);
      const rawVelX = clamp((headPos.x - prevHeadX) * invDt, -1.8, 1.8);
      const rawVelY = clamp((headPos.y - prevHeadY) * invDt, -1.8, 1.8);
      const rawVelAngX = clamp((ax - prevAngleX) * invDt, -160, 160);
      const rawVelAngY = clamp((ay - prevAngleY) * invDt, -160, 160);
      const rawVelAngZ = clamp((az - prevAngleZ) * invDt, -160, 160);
      const rawVelBodyZ = clamp((bz - prevBodyZ) * invDt, -120, 120);
      const rawVelBodyY = clamp((by - prevBodyY) * invDt, -120, 120);

      prevHeadX = headPos.x;
      prevHeadY = headPos.y;
      prevAngleX = ax;
      prevAngleY = ay;
      prevAngleZ = az;
      prevBodyZ = bz;
      prevBodyY = by;

      const alpha = 1 - Math.exp(-26 * dt);
      smoothVelX += (rawVelX - smoothVelX) * alpha;
      smoothVelY += (rawVelY - smoothVelY) * alpha;
      smoothVelAngX += (rawVelAngX - smoothVelAngX) * alpha;
      smoothVelAngY += (rawVelAngY - smoothVelAngY) * alpha;
      smoothVelAngZ += (rawVelAngZ + rawVelBodyZ * 0.5 - smoothVelAngZ) * alpha;

      // 1. World-space gravity plumb-line from combined head + upper-body tilt.
      const totalTiltRad = (az + bz * 0.5) * DEG_TO_RAD;
      const gravityX = Math.sin(totalTiltRad) * 0.72;
      const gravityDrapeY = clamp(-ay * 0.004 - by * 0.005, -0.18, 0.18);

      // 2. Inertial lag from linear & angular head velocity.
      const baseInertiaX = -smoothVelX * 0.88 - smoothVelAngZ * 0.0052 - smoothVelAngX * 0.004;
      const baseInertiaY = -smoothVelY * 1.05 - smoothVelAngY * 0.0052 - rawVelBodyY * 0.0048;

      // 3. Step all 3 cascading hair chains (front bangs, side locks, long back hair).
      for (const key of ['front', 'side', 'late'] as const) {
        const cfg = HAIR_DEF[key];
        const st = chains[key];
        const isDragged = activeGroup === key;
        const isPatFront = key === 'front' && input.patActive;

        const breezeX =
          (Math.sin(elapsed * 1.05 + cfg.breezePhase) * 0.65 +
            Math.sin(elapsed * 0.48 + cfg.breezePhase * 1.7) * 0.35) *
          cfg.breezeAmp;
        const breezeY = Math.sin(elapsed * 1.4 + cfg.breezePhase + 0.9) * (cfg.breezeAmp * 0.55);

        let targetX = softClamp(
          gravityX * cfg.gravScale + baseInertiaX * cfg.inertiaX + breezeX,
          0.92,
        );
        let targetY = softClamp(
          gravityDrapeY * cfg.gravScale + baseInertiaY * cfg.inertiaY + breezeY,
          0.88,
        );

        if (isDragged) {
          targetX = softClamp(dragTarget.x + gravityX * 0.25, 0.95);
          targetY = softClamp(dragTarget.y + Math.abs(dragTarget.x) * 0.16, 0.95);
        } else if (isPatFront) {
          targetX = softClamp(input.patDragX * 0.68 + gravityX * 0.35, 0.92);
          targetY = softClamp(input.patDragY * 0.42 - input.patHappy * 0.18, 0.85);
        } else if (input.patActive) {
          targetX = softClamp(targetX + input.patDragX * (key === 'side' ? 0.28 : 0.22), 0.92);
        }

        const midSwing = st.x[Math.min(2, st.x.length - 1)].x;
        const arcLift = Math.min(0.15, midSwing * midSwing * 0.2);
        const tipWeight = key === 'late' ? 1.1 : key === 'side' ? 1.0 : 0.9;

        stepHairChain(st.x, targetX, cfg.kX, cfg.cX, tipWeight, dt);
        stepHairChain(st.y, clamp(targetY + arcLift, -0.95, 0.95), cfg.kY, cfg.cY, tipWeight, dt);

        for (let i = 0; i < cfg.xParams.length; i++) {
          params.addParam(cfg.xParams[i], clamp(st.x[i].x, -1, 1));
        }
        for (let i = 0; i < cfg.yParams.length; i++) {
          params.addParam(cfg.yParams[i], clamp(st.y[i].x, -1, 1));
        }
      }

      // 4. Heavy back-hair gravity pendulum (LateHairZ: -30..+30).
      const lateZDrag = activeGroup === 'late' ? dragTarget.x * 18 : 0;
      const lateZPat = input.patActive ? input.patDragX * 5.5 : 0;
      const lateZTarget = clamp(
        (az + bz * 0.5) * 0.52 +
          ax * 0.13 -
          smoothVelAngZ * 0.045 -
          smoothVelX * 7.5 +
          lateZDrag +
          lateZPat +
          Math.sin(elapsed * 0.82 + 2.1) * 0.5,
        -20,
        20,
      );
      stepSpring(lateZ, lateZTarget, LATE_Z_K, LATE_Z_C, dt);
      if (Math.abs(lateZ.x) > 0.02) {
        params.addParam(LATE_HAIR_Z_PARAM, lateZ.x);
      }
    },

    tryPointerDown(clientX: number, clientY: number): HairGroup | null {
      const hit = HIT_ORDER.find((k) => hitAny(groupDrawables[k], clientX, clientY));
      if (!hit) return null;
      activeGroup = hit;
      startX = lastClientX = clientX;
      startY = lastClientY = clientY;
      dragTarget.x = 0;
      dragTarget.y = 0;
      dragVel.x = 0;
      dragVel.y = 0;
      return hit;
    },

    pointerMove(clientX: number, clientY: number, dt: number): { dragX: number; dragY: number } {
      if (!activeGroup) return { dragX: 0, dragY: 0 };
      const nx = clamp((clientX - startX) / DRAG_RANGE, -1, 1);
      const ny = clamp((startY - clientY) / DRAG_RANGE, -1, 1);
      const safeDt = Math.max(dt, 1 / 120);
      dragVel.x = clamp(((clientX - lastClientX) / DRAG_RANGE) / safeDt, -8, 8);
      dragVel.y = clamp(((lastClientY - clientY) / DRAG_RANGE) / safeDt, -8, 8);
      lastClientX = clientX;
      lastClientY = clientY;

      dragTarget.x = nx * DRAG_GAIN;
      dragTarget.y = ny * DRAG_GAIN;
      return { dragX: nx, dragY: ny };
    },

    pointerUp(): void {
      if (activeGroup) {
        const st = chains[activeGroup];
        for (let i = 0; i < st.x.length; i++) {
          const w = 0.3 + 0.7 * (i / Math.max(1, st.x.length - 1));
          st.x[i].v += dragVel.x * 0.45 * w;
        }
        for (let i = 0; i < st.y.length; i++) {
          const w = 0.3 + 0.7 * (i / Math.max(1, st.y.length - 1));
          st.y[i].v += dragVel.y * 0.45 * w;
        }
      }
      activeGroup = null;
      dragTarget.x = 0;
      dragTarget.y = 0;
    },

    triggerImpulse(dirX: number, liftY = 0.85): void {
      const sign = dirX === 0 ? 1 : Math.sign(dirX);
      for (const key of ['front', 'side', 'late'] as const) {
        const st = chains[key];
        const amp = key === 'late' ? 1.0 : key === 'side' ? 0.9 : 0.65;
        for (let i = 0; i < st.x.length; i++) {
          const w = 0.5 + 0.5 * (i / Math.max(1, st.x.length - 1));
          st.x[i].v += sign * 1.5 * amp * w;
        }
        for (let i = 0; i < st.y.length; i++) {
          const w = 0.5 + 0.5 * (i / Math.max(1, st.y.length - 1));
          st.y[i].v += liftY * 2.3 * amp * w;
        }
      }
      lateZ.v += sign * 19;
    },

    reset(): void {
      activeGroup = null;
      dragTarget.x = 0;
      dragTarget.y = 0;
      dragVel.x = 0;
      dragVel.y = 0;
      hasPrev = false;
      smoothVelX = smoothVelY = smoothVelAngX = smoothVelAngY = smoothVelAngZ = 0;
      lateZ.x = lateZ.v = 0;
      for (const key of ['front', 'side', 'late'] as const) {
        for (const s of chains[key].x) { s.x = 0; s.v = 0; }
        for (const s of chains[key].y) { s.x = 0; s.v = 0; }
      }
    },
  };
}
