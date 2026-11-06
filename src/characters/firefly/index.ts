import type { CharacterPackage } from '../types';
import { FIREFLY_CANON_LORE } from './lore';
import { FIREFLY_METADATA, FIREFLY_MODEL_CONFIG } from './config';

export * from './lore';
export * from './config';

export const FIREFLY_PACKAGE: CharacterPackage = {
  ...FIREFLY_METADATA,
  systemPrompt: FIREFLY_CANON_LORE,
  model: FIREFLY_MODEL_CONFIG
};

export default FIREFLY_PACKAGE;
