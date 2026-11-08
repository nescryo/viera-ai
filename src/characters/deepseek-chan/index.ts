import type { CharacterPackage } from '../types';
import { DEEPSEEK_CHAN_METADATA, DEEPSEEK_CHAN_MODEL_CONFIG } from './config';
import { DEEPSEEK_CHAN_CANON_LORE } from './lore';

export * from './config';

export const DEEPSEEK_CHAN_PACKAGE: CharacterPackage = {
  ...DEEPSEEK_CHAN_METADATA,
  systemPrompt: DEEPSEEK_CHAN_CANON_LORE,
  model: DEEPSEEK_CHAN_MODEL_CONFIG
};

export default DEEPSEEK_CHAN_PACKAGE;
