import { describe, it, expect } from 'vitest';
import { validateProfileInput, genderLabel } from '../src/services/profileValidation';

describe('validateProfileInput', () => {
  it('adds a leading @ and trims the display name', () => {
    const result = validateProfileInput({ username: 'nescryo', nickname: '  Klein  ' });
    expect(result).toEqual({ ok: true, username: '@nescryo', nickname: 'Klein' });
  });

  it('keeps a single @ when the user already typed one', () => {
    const result = validateProfileInput({ username: '@@nescryo', nickname: 'Klein' });
    expect(result).toMatchObject({ ok: true, username: '@nescryo' });
  });

  it('rejects usernames shorter than 3 characters', () => {
    const result = validateProfileInput({ username: '@ab', nickname: 'Klein' });
    expect(result).toEqual({ ok: false, error: 'Username must be at least 3 characters long.' });
  });

  it('rejects usernames longer than 20 characters', () => {
    const result = validateProfileInput({ username: 'a'.repeat(21), nickname: 'Klein' });
    expect(result.ok).toBe(false);
  });

  it('accepts exactly 20 characters', () => {
    const result = validateProfileInput({ username: 'a'.repeat(20), nickname: 'Klein' });
    expect(result.ok).toBe(true);
  });

  it('rejects characters other than letters, numbers and underscores', () => {
    for (const bad of ['john doe', 'john-doe', 'jöhn', 'john.doe']) {
      expect(validateProfileInput({ username: bad, nickname: 'Klein' }).ok).toBe(false);
    }
  });

  it('rejects an empty or whitespace display name', () => {
    const result = validateProfileInput({ username: 'nescryo', nickname: '   ' });
    expect(result).toEqual({ ok: false, error: 'Display name cannot be empty.' });
  });
});

describe('genderLabel', () => {
  it('returns a label for a chosen gender', () => {
    expect(genderLabel('male')).toBe('Male');
    expect(genderLabel('non-binary')).toBe('Non-binary');
  });

  it('returns null when nothing is set', () => {
    expect(genderLabel(undefined)).toBeNull();
    expect(genderLabel('unspecified')).toBeNull();
  });
});
