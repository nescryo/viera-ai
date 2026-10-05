import type { UserProfile } from '../types';

export type Gender = NonNullable<UserProfile['gender']>;

export const GENDER_OPTIONS: { id: Gender; label: string }[] = [
  { id: 'unspecified', label: 'Prefer not to say' },
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'non-binary', label: 'Non-binary' },
];

export const USERNAME_MAX = 20;
export const NICKNAME_MAX = 20;
export const BIO_MAX = 500;

export type ProfileValidation =
  | { ok: true; username: string; nickname: string }
  | { ok: false; error: string };

/**
 * Validates the username and display name typed into the profile forms.
 * The username is normalized to a single leading "@". Shared by onboarding
 * and the profile editor so both apply the same rules.
 */
export function validateProfileInput(input: { username: string; nickname: string }): ProfileValidation {
  const raw = input.username.trim().replace(/^@+/, '');
  const handle = `@${raw}`;

  if (raw.length < 3) {
    return { ok: false, error: 'Username must be at least 3 characters long.' };
  }
  if (raw.length > USERNAME_MAX) {
    return { ok: false, error: `Username can be at most ${USERNAME_MAX} characters.` };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(raw)) {
    return { ok: false, error: 'Username can only contain letters, numbers, and underscores.' };
  }

  const nickname = input.nickname.trim();
  if (!nickname) {
    return { ok: false, error: 'Display name cannot be empty.' };
  }

  return { ok: true, username: handle, nickname };
}

/** Label for a stored gender value, or null when nothing worth showing is set. */
export function genderLabel(gender: UserProfile['gender']): string | null {
  if (!gender || gender === 'unspecified') return null;
  return GENDER_OPTIONS.find((g) => g.id === gender)?.label ?? null;
}
