import type {
  CoordConverter,
  InternalModelLike,
  ParamAccessors,
  Spring1D,
} from './types';
import { clamp, collectPartDrawables, stepSpring } from './math';

export interface ChestTouchController {
  tryPointerDown(clientX: number, clientY: number): 'left' | 'right' | null;
  pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number };
  pointerUp(): void;
  stepPostPhysics(dt: number, breathLevel: number): void;
  reset(): void;
}

const CHEST_PARTS = ['Part85', 'Part88', 'Part86'];
const CHEST_X = ['ChestX1', 'ChestX2', 'ChestX3'] as const;
const CHEST_Y = ['ChestY1', 'ChestY2', 'ChestY3'] as const;
const CHEST_GAIN = 0.3;
const BS_GAIN = 0.5;
const K = 140;
const C = 7;
const DRAG_RANGE = 160;

/**
 * Interactive chest touch & breathing lift controller.
 * Common drag drives `ChestX1..3` / `ChestY1..3`; left/right press asymmetry drives `ChestXBS`.
 */
export function createChestTouchController(
  internal: InternalModelLike,
  params: ParamAccessors,
  coords: CoordConverter,
): ChestTouchController {
  const raw = internal.coreModel._model;
  const drawables = collectPartDrawables(raw, CHEST_PARTS);

  let activeSide: 'left' | 'right' | null = null;
  let startX = 0;
  let startY = 0;
  const target = { x: 0, y: 0, bs: 0 };
  const springX: Spring1D = { x: 0, v: 0 };
  const springY: Spring1D = { x: 0, v: 0 };
  const springBs: Spring1D = { x: 0, v: 0 };

  const hitChest = (clientX: number, clientY: number): 'left' | 'right' | null => {
    const opacities = raw?.drawables?.opacities;
    if (!opacities || drawables.length === 0) return null;
    const p = coords.screenToModel(clientX, clientY);
    const b = { x: 0, y: 0, width: 0, height: 0 };
    let hit = false;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const i of drawables) {
      if (opacities[i] < 0.05) continue;
      internal.getDrawableBounds(i, b);
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + b.width);
      if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) hit = true;
    }
    if (!hit) return null;
    return p.x < (minX + maxX) / 2 ? 'left' : 'right';
  };

  return {
    tryPointerDown(clientX: number, clientY: number): 'left' | 'right' | null {
      const hit = hitChest(clientX, clientY);
      if (!hit) return null;
      activeSide = hit;
      startX = clientX;
      startY = clientY;
      target.x = 0;
      target.y = 0;
      // ChestXBS +1 pushes right side down and left side up (-1 does the reverse).
      target.bs = (hit === 'right' ? 1 : -1) * BS_GAIN;
      return hit;
    },

    pointerMove(clientX: number, clientY: number): { dragX: number; dragY: number } {
      if (!activeSide) return { dragX: 0, dragY: 0 };
      const nx = clamp((clientX - startX) / DRAG_RANGE, -1, 1);
      const ny = clamp((startY - clientY) / DRAG_RANGE, -1, 1);
      target.x = nx * CHEST_GAIN;
      target.y = ny * CHEST_GAIN;
      return { dragX: nx, dragY: ny };
    },

    pointerUp(): void {
      activeSide = null;
      target.x = 0;
      target.y = 0;
      target.bs = 0;
    },

    stepPostPhysics(dt: number, breathLevel: number): void {
      // Subtle chest inhale lift on ChestY4 complementing physics.
      if (Math.abs(breathLevel) > 1e-4) {
        params.addParam('ChestY4', breathLevel * 0.65);
      }

      stepSpring(springX, target.x, K, C, dt);
      stepSpring(springY, target.y, K, C, dt);
      stepSpring(springBs, target.bs, K, C, dt);

      const idle =
        activeSide === null &&
        Math.abs(springX.x) < 1e-4 &&
        Math.abs(springY.x) < 1e-4 &&
        Math.abs(springBs.x) < 1e-4;
      if (idle) return;

      for (const id of CHEST_X) params.addScaled(id, springX.x);
      for (const id of CHEST_Y) params.addScaled(id, springY.x);
      params.addScaled('ChestXBS', springBs.x);
    },

    reset(): void {
      activeSide = null;
      target.x = target.y = target.bs = 0;
      springX.x = springX.v = 0;
      springY.x = springY.v = 0;
      springBs.x = springBs.v = 0;
    },
  };
}
