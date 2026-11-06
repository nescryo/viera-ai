import type { CharacterModelConfig } from '../types';

/**
 * DeepSeek-chan Live2D model (free model, no redistribution).
 * Files live in public/models/deepseek-chan/ and are gitignored.
 * Emotion values are a first pass and need visual tuning.
 */
export const DEEPSEEK_CHAN_MODEL_CONFIG: CharacterModelConfig = {
  modelUrl: '/models/deepseek-chan/%E5%A4%A7%E8%82%A5%E9%B1%BC.model3.json',
  scale: 1.35,
  anchor: [0.5, 0.62],
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
