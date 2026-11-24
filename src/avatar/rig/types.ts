import type * as PIXI from 'pixi.js';
import type { BreathSample } from '../breathing';
import type { ExpressionSpec } from '../../data/emotionRegistry';

/** 1D damped harmonic oscillator state. */
export interface Spring1D {
  x: number;
  v: number;
}

/** Raw Cubism Core model buffers exposed on `coreModel._model`. */
export interface RawCubismModel {
  parts?: {
    count: number;
    ids: ArrayLike<string>;
    parentIndices: Int32Array | number[];
  };
  drawables?: {
    count: number;
    ids: ArrayLike<string>;
    parentPartIndices: Int32Array | number[];
    opacities: Float32Array;
    vertexPositions: Float32Array[];
    indices: Uint16Array[];
    maskCounts: Int32Array | number[];
    masks: (Int32Array | number[])[];
  };
}

/** Subset of the Cubism 4 CoreModel API used by the avatar rig. */
export interface CoreModelLike {
  getParameterIndex(id: string): number;
  getParameterMinimumValue(index: number): number;
  getParameterMaximumValue(index: number): number;
  getParameterValueById(id: string): number;
  getParameterValueByIndex(index: number): number;
  setParameterValueById(id: string, value: number): void;
  addParameterValueById(id: string, value: number, weight?: number): void;
  getDrawableIndex(id: string): number;
  update(): void;
  _model?: RawCubismModel;
}

/** Subset of `pixi-live2d-display`'s Cubism 4 InternalModel API used by the rig. */
export interface InternalModelLike {
  coreModel: CoreModelLike;
  originalWidth: number;
  originalHeight: number;
  pixelsPerUnit: number;
  breath?: {
    setParameters(params: unknown[]): void;
  };
  motionManager?: {
    isFinished(): boolean;
  };
  getDrawableBounds(index: number, bounds?: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  on(event: 'beforeModelUpdate' | 'afterMotionUpdate', fn: () => void): void;
  off(event: 'beforeModelUpdate' | 'afterMotionUpdate', fn: () => void): void;
}

/** Minimal Live2DModel interface used by controllers. */
export interface Live2DModelLike {
  internalModel: InternalModelLike;
  toModelPosition(position: PIXI.Point, result?: PIXI.Point, skipUpdate?: boolean): PIXI.Point;
}

/** Converts viewport client coordinates into model-canvas or Cubism unit coordinates. */
export interface CoordConverter {
  screenToModel(clientX: number, clientY: number): { x: number; y: number };
  screenToUnit(clientX: number, clientY: number): { x: number; y: number };
}

/** Safe, clamped parameter read/write helpers bound to a CoreModel. */
export interface ParamAccessors {
  hasParam(id: string): boolean;
  getParam(id: string): number;
  setParam(id: string, value: number): void;
  addParam(id: string, delta: number): void;
  addScaled(id: string, normalizedDelta: number): void;
}

export type FaceTouchMode = 'cheek' | 'eye' | 'headpat';
export type EarSide = 'left' | 'right';
export type ArmSide = 'screenRight' | 'screenLeft';
export type SkirtSide = 'left' | 'center' | 'right';
export type ClothRegion = 'bow' | 'shoulder' | 'waist' | 'backBow' | 'garter';
export type ClothSide = 'left' | 'center' | 'right';
export type TailZone = 'left' | 'bottom' | 'right';
export type HairGroup = 'front' | 'late' | 'side';

export interface ClothHit {
  region: ClothRegion;
  side: ClothSide;
}

/** Active non-face touch state shared across controllers for coordinated reactions. */
export interface ExternalTouchState {
  chest: 'left' | 'right' | null;
  skirt: SkirtSide | null;
  cloth: ClothHit | null;
  tail: TailZone | null;
  ear: EarSide | null;
  arm: ArmSide | null;
  hair: HairGroup | null;
  dragX: number;
  dragY: number;
}

export const EMPTY_EXTERNAL_TOUCH: Readonly<ExternalTouchState> = {
  chest: null,
  skirt: null,
  cloth: null,
  tail: null,
  ear: null,
  arm: null,
  hair: null,
  dragX: 0,
  dragY: 0,
};

/** Live face-touch snapshot synced to body, head, hair, ear, and arm controllers. */
export interface FaceTouchSnapshot {
  mode: FaceTouchMode | null;
  cheekSide: 'left' | 'right';
  eyeSide: 'left' | 'right' | 'both';
  patHappy: number;
  patDragX: number;
  patDragY: number;
  cheekXNorm: number;
  cheekYNorm: number;
  headAngleY: number;
  headAngleZ: number;
}

/** Emotion-derived subtle posture and ear mood offsets. */
export interface EmotionMoodOffsets {
  /** Multiplier on idle body/head sway amplitude (e.g. calmer when sad, livelier when happy). */
  swayScale: number;
  /** Subtle ear perk (+) or droop (-) in -1..1. */
  earPerk: number;
  /** Subtle ear inward fold (-) or outward flare (+) in -1..1. */
  earFlare: number;
  /** Gentle torso vertical lift (+) or droop (-) in degrees. */
  postureY: number;
  /** Gentle shoulder hunch (+) or relaxation (-) in degrees. */
  shoulderY: number;
  /** Subtle head pitch bias in degrees. */
  headPitch: number;
  /** Subtle playful head tilt bias in degrees. */
  headTilt: number;
}

/** Per-frame companion state passed from Scene into the rig orchestrator. */
export interface DeepSeekRigFrameState {
  spec: ExpressionSpec;
  isReplying: boolean;
  /** Current lip-sync mouth openness in 0..1 (provided in `stepPostPhysics`). */
  speechLevel?: number;
  breath: BreathSample;
}

/** Callback invoked right after `coreModel.update()` to apply local vertex deformations. */
export type VertexDeformCallback = () => void;
