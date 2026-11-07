import type { CharacterModelConfig } from '../types';

/**
 * DeepSeek-chan Live2D model (free model, see its terms of use file).
 * Files live in public/models/deepseek-chan/.
 * Emotion values are a first pass and need visual tuning.
 */
export const DEEPSEEK_CHAN_MODEL_CONFIG: CharacterModelConfig = {
  modelUrl: '/models/deepseek-chan/%E5%A4%A7%E8%82%A5%E9%B1%BC.model3.json',
  scale: 1.70,
  anchor: [0.5, 0.76],
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
    visemes: { a: 'ParamA', i: 'ParamI', u: 'ParamU', e: 'ParamE', o: 'ParamO' }
  },
  emotions: {
    relaxed: {},
    happy: { EyeSmile: 1, ParamMouthForm: 1 },
    teasing: { EyeSmile: 0.6, ParamMouthForm: 0.6, key7: 0.3 },
    blush: { key7: 1, ParamMouthForm: 0.4 },
    'blush-hardly': { key7: 0.6, ParamMouthForm: 0.2 },
    pouting: { key7: 0.3, ParamMouthForm: -0.5 },
    jealous: { ParamMouthForm: -0.5, ParamBrowLY: -0.5, ParamBrowRY: -0.5 },
    terrified: { key13: 1, BrowInnerUp: 1, ParamMouthForm: -0.6 },
    surprised: { ParamBrowLY: 1, ParamBrowRY: 1 },
    angry: { ParamBrowLY: -1, ParamBrowRY: -1, key1: 0.6, ParamMouthForm: -0.6 },
    sad: { key2: 1, BrowInnerUp: 1, ParamMouthForm: -0.8 }
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
