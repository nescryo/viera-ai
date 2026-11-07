import type { CharacterModelConfig } from '../types';

/**
 * DeepSeek-chan Live2D model (free model, see its terms of use file).
 * Files live in public/models/deepseek-chan/.
 * Emotion values are a first pass and need visual tuning.
 */
export const DEEPSEEK_CHAN_MODEL_CONFIG: CharacterModelConfig = {
  modelUrl: '/models/deepseek-chan/%E5%A4%A7%E8%82%A5%E9%B1%BC.model3.json',
  scale: 1.80,
  anchor: [0.5, 0.79],
  maskRenderTextures: 2, // the model has 49 clipping masks (> 36)
  params: {
    angleX: 'ParamAngleX',
    angleY: 'ParamAngleY',
    angleZ: 'ParamAngleZ',
    bodyAngleX: 'ParamBodyAngleX',
    bodyAngleZ: 'ParamBodyAngleZ',
    eyeBallX: 'ParamEyeBallX',
    eyeBallY: 'ParamEyeBallY',
    mouthOpen: 'ParamMouthOpenY',
    mouthForm: 'ParamMouthForm',
    breath: 'ParamBreath',
    // Added on top of physics output. Ranges: ChestY* -1..1, BodyAngleY/ShoulderY/ShoulderYy -30..30.
    breathTargets: [
      { id: 'ChestY4', amount: 1, channel: 'chest' },
      { id: 'ParamBodyAngleY', amount: 3, channel: 'chest' },
      { id: 'ShoulderY', amount: 6, channel: 'shoulder' },
      { id: 'ShoulderYy', amount: 8, channel: 'shoulder' }
    ],
    // Chest jiggle on top of physics. Ranges: ChestX*/ChestY* -1..1.
    jiggleTargets: [
      { id: 'ChestX1', amount: 0.3, axis: 'x' },
      { id: 'ChestX2', amount: 0.3, axis: 'x' },
      { id: 'ChestY1', amount: 0.4, axis: 'y' },
      { id: 'ChestY2', amount: 0.3, axis: 'y' },
      { id: 'ChestY3', amount: 0.3, axis: 'y' }
    ],
    // Ribbon swing on top of physics. Amounts are fractions of each parameter's half-range.
    ribbonTargets: [
      ...['LRibbonX1', 'LRibbonX2', 'LRibbonX3', 'LRibbonX4'].map((id) => ({ id, amount: 0.25, axis: 'x' as const, relative: true })),
      ...['RRibbonX1', 'RRibbonX2', 'RRibbonX3', 'RRibbonX4'].map((id) => ({ id, amount: 0.25, axis: 'x' as const, relative: true })),
      ...['ribbonX1', 'ribbonX2', 'ribbonX3', 'ribbonX4', 'ribbonX5', 'ribbonX6', 'ribbonX7'].map((id) => ({ id, amount: 0.25, axis: 'x' as const, relative: true })),
      ...['ribbonY1', 'ribbonY2', 'ribbonY3', 'ribbonY4', 'ribbonY5', 'ribbonY6', 'ribbonY7'].map((id) => ({ id, amount: 0.25, axis: 'y' as const, relative: true }))
    ],
    // Soft skirt swing on top of physics. Amounts are fractions of each parameter's half-range;
    // first pass, needs visual tuning.
    skirtTargets: [
      ...['SkirtX1', 'SkirtX2', 'SkirtX3', 'SkirtX4'].map((id) => ({ id, amount: 0.08, axis: 'x' as const, relative: true })),
      ...['SkirtLayerX1', 'SkirtLayerX2', 'SkirtLayerX3', 'SkirtLayerX4', 'SkirtLayerX5', 'SkirtLayerX6'].map((id) => ({ id, amount: 0.06, axis: 'x' as const, relative: true })),
      ...['SkirtY', 'SkirtY2', 'SkirtY3', 'SkirtY4', 'SkirtY5'].map((id) => ({ id, amount: 0.05, axis: 'y' as const, relative: true }))
    ],
    // Standing weight shift and breath coupling at the hips, on top of physics. Amounts are
    // fractions of each parameter's half-range. First pass: the ranges and the direction of
    // each parameter were not checked, and HipAngleYUP / HipAngleYDOWN are assumed to be
    // opposite halves. Needs visual tuning.
    hipTargets: [
      { id: 'HipAngleZ', amount: 0.12, channel: 'shift' },
      { id: 'HipZ1', amount: 0.1, channel: 'shift' },
      { id: 'HipZ2', amount: 0.1, channel: 'shift' },
      { id: 'HipAngleYUP', amount: 0.05, channel: 'breath' },
      { id: 'HipAngleYDOWN', amount: -0.05, channel: 'breath' }
    ],
    // Arm sway and speaking gestures. Amounts are fractions of each parameter's half-range;
    // signs and sizes are a first pass and need visual tuning.
    armTargets: [
      { id: 'LArm', amount: 0.35, channel: 'arm', side: 'l' },
      { id: 'LForearm', amount: 0.4, channel: 'forearm', side: 'l' },
      { id: 'LWrist', amount: 0.4, channel: 'wrist', side: 'l' },
      { id: 'LHand', amount: 0.3, channel: 'hand', side: 'l' },
      { id: 'RArm', amount: 0.35, channel: 'arm', side: 'r' },
      { id: 'RForearm', amount: 0.4, channel: 'forearm', side: 'r' },
      { id: 'RWrist', amount: 0.4, channel: 'wrist', side: 'r' },
      { id: 'RHand', amount: 0.3, channel: 'hand', side: 'r' },
      // Gravity compensation: counter-rotate against head pitch (pointer.y) so the arms keep
      // hanging down when the head and chest tilt up. Signs and sizes are guesses (the arm
      // parameter ranges were not checked); flip the sign if the arms lift more, not less.
      { id: 'LArm', amount: -0.5, channel: 'lift', side: 'l' },
      { id: 'RArm', amount: -0.5, channel: 'lift', side: 'r' },
      { id: 'LForearm', amount: -0.2, channel: 'lift', side: 'l' },
      { id: 'RForearm', amount: -0.2, channel: 'lift', side: 'r' },
      { id: 'ShoulderY', amount: -0.3, channel: 'lift', side: 'l' }
    ],
    visemes: { a: 'ParamA', i: 'ParamI', u: 'ParamU', e: 'ParamE', o: 'ParamO' }
  },
  emotions: {
    relaxed: {},
    happy: { EyeSmile: 1, ParamMouthForm: 1 },
    teasing: { EyeSmile: 0.6, ParamMouthForm: 0.6, key7: 0.3 },
    pouting: { key7: 0.3, ParamMouthForm: -0.5 },
    jealous: { ParamMouthForm: -0.5, ParamBrowLY: -0.5, ParamBrowRY: -0.5 },
    terrified: { key13: 1, BrowInnerUp: 1, ParamMouthForm: -0.6 },
    surprised: { ParamBrowLY: 1, ParamBrowRY: 1 },
    angry: { ParamBrowLY: -1, ParamBrowRY: -1, key1: 0.6, ParamMouthForm: -0.6 },
    sad: { key2: 1, BrowInnerUp: 1, ParamMouthForm: -0.8 }
  },
  // Deltas at weight 1. First pass, needs visual tuning. Rig parameters: key7 blush, key1 black
  // face (gloom), key2 tears, key13 cold sweat. Their Exp3 files all set 1.0 with Add blend.
  modifiers: {
    blush: { key7: 1 },
    gloom: { key1: 1 },
    tears: { key2: 1 },
    'cold-sweat': { key13: 1 }
  },
  credits: 'DeepSeek-chan: illustration & PSD by Kamiya Ryoko, Live2D rigging by 霓虹猫_NeonNeko'
};

/** Persona fields are intentionally empty for now; the AI service falls back to a generic prompt. */
export const DEEPSEEK_CHAN_METADATA = {
  id: 'deepseek-chan',
  name: 'DeepSeek-chan',
  tagline: '',
  greeting: '',
  avatarUrl: '',
  voice: { pitch: 1, rate: 1, lang: 'en-US' },
  category: 'Original' as const
};
