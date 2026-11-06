import type { CharacterPackage } from '../types';
import { DEEPSEEK_CHAN_METADATA, DEEPSEEK_CHAN_MODEL_CONFIG } from './config';

export * from './config';

export const DEEPSEEK_CHAN_PACKAGE: CharacterPackage = {
  ...DEEPSEEK_CHAN_METADATA,
  systemPrompt: '',
  model: DEEPSEEK_CHAN_MODEL_CONFIG
};

export default DEEPSEEK_CHAN_PACKAGE;
