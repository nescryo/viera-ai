import type { CharacterPackage } from './types';
import { FIREFLY_PACKAGE } from './firefly';

export * from './types';
export { FIREFLY_PACKAGE } from './firefly';

/**
 * Official Registry of Installed 3D Characters
 * In the future, characters installed from GitHub Release tags are registered here.
 */
export const INSTALLED_CHARACTERS: CharacterPackage[] = [
  FIREFLY_PACKAGE
];

export const DEFAULT_CHARACTER_PACKAGE: CharacterPackage = FIREFLY_PACKAGE;

const CHARACTER_MAP = new Map<string, CharacterPackage>(
  INSTALLED_CHARACTERS.map((char) => [char.id.toLowerCase().trim(), char])
);

/**
 * Retrieves a character package by its unique ID with fallback to default character
 */
export function getCharacterPackage(id?: string | null): CharacterPackage {
  if (!id) return DEFAULT_CHARACTER_PACKAGE;
  return CHARACTER_MAP.get(id.toLowerCase().trim()) || DEFAULT_CHARACTER_PACKAGE;
}

/**
 * Checks if a character ID is installed in the local registry
 */
export function isCharacterInstalled(id?: string | null): boolean {
  if (!id) return false;
  return CHARACTER_MAP.has(id.toLowerCase().trim());
}
