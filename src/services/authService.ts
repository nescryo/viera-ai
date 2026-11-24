import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { UserProfile } from '../types';

const AUTH_USER_KEY = 'viera_auth_user';
const GUEST_KEY = 'viera_guest';
/** Fixed ID for the guest profile; chats are stored on this device under it. */
export const GUEST_USER_ID = 'guest';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const supabase = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

/** Context for mapping Supabase Auth errors into user-facing messages. */
export type AuthErrorContext = 'email-signin' | 'email-signup' | 'oauth';

/** Result of creating a new account with email and password. */
export interface EmailSignUpResult {
  needsEmailConfirmation: boolean;
}

/** Auth methods currently enabled on the configured Supabase server. */
export interface EnabledAuthProviders {
  email: boolean;
  github: boolean;
  google: boolean;
}

/** The shared Supabase client, or null when Supabase is not configured. */
export function getSupabaseClient(): SupabaseClient | null {
  return supabase;
}

/** Query Supabase Auth public settings to detect which sign-in methods are enabled. */
export async function getEnabledAuthProviders(signal?: AbortSignal): Promise<EnabledAuthProviders | null> {
  if (!supabaseUrl || !publishableKey) return null;
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      signal,
    });
    if (!response.ok) return null;
    const data = await response.json() as { external?: Record<string, unknown> };
    const external = data?.external;
    if (!external || typeof external !== 'object') return null;
    return {
      email: external.email !== false,
      github: external.github === true,
      google: external.google === true,
    };
  } catch {
    return null;
  }
}

/** Read locally customized profile fields; this is not proof of authentication. */
export function getCurrentUser(): UserProfile | null {
  try {
    const data = localStorage.getItem(AUTH_USER_KEY);
    return data ? JSON.parse(data) as UserProfile : null;
  } catch {
    return null;
  }
}

/** Save profile preferences on this device, not in Supabase. */
export function saveCurrentUser(user: UserProfile): void {
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch {
    console.warn('[Viera Auth] Could not save local profile preferences.');
  }
}

/** Build the app profile from an email-, GitHub-, or Google-authenticated Supabase user. */
export function profileFromAuthUser(user: User): UserProfile | null {
  const provider = user.app_metadata.provider;
  if (provider !== 'email' && provider !== 'github' && provider !== 'google') return null;
  const existing = getCurrentUser();
  if (existing?.id === user.id) return existing;
  const metadata = user.user_metadata;
  const username = typeof metadata.user_name === 'string' ? metadata.user_name : '';
  const emailPrefix = user.email?.split('@')[0]?.trim().slice(0, 20) || '';
  const defaultNickname = provider === 'email'
    ? (emailPrefix || 'User')
    : provider === 'google'
      ? 'Google user'
      : 'GitHub user';
  return {
    id: user.id,
    email: user.email || '',
    username,
    nickname: typeof metadata.full_name === 'string' ? metadata.full_name
      : typeof metadata.name === 'string' ? metadata.name
        : username || defaultNickname,
    picture: typeof metadata.avatar_url === 'string' ? metadata.avatar_url
      : typeof metadata.picture === 'string' ? metadata.picture : '',
    gender: 'unspecified',
    bio: '',
    isSetupComplete: false,
    createdAt: Date.now(),
  };
}

/** Build the guest profile. Guests skip Supabase entirely, so nothing is sent to the auth database. */
function guestProfile(): UserProfile {
  const saved = getCurrentUser();
  if (saved?.id === GUEST_USER_ID) return saved;
  return {
    id: GUEST_USER_ID, email: '', username: '', nickname: 'Guest', picture: '',
    gender: 'unspecified', bio: '', isSetupComplete: true, createdAt: Date.now(),
  };
}

/** Start a local-only guest session that survives reloads until sign-out. */
export function startGuestSession(): UserProfile {
  try {
    localStorage.setItem(GUEST_KEY, '1');
  } catch {
    console.warn('[Viera Auth] Could not remember the guest session.');
  }
  return guestProfile();
}

/** Return the guest profile if a guest session was started on this device. */
export function getGuestSession(): UserProfile | null {
  try {
    return localStorage.getItem(GUEST_KEY) ? guestProfile() : null;
  } catch {
    return null;
  }
}

/** Restore and observe Supabase sessions, including OAuth redirects and cross-tab logout. */
export function subscribeToAuth(onChange: (profile: UserProfile | null) => void): () => void {
  if (!supabase) {
    onChange(null);
    return () => {};
  }
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(session?.user ? profileFromAuthUser(session.user) : null);
  });
  return () => subscription.unsubscribe();
}

/** Sign in with an email address and password through Supabase Auth. */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('Supabase Auth is not configured.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Create an account with an email address and password through Supabase Auth. */
export async function signUpWithEmail(email: string, password: string): Promise<EmailSignUpResult> {
  if (!supabase) throw new Error('Supabase Auth is not configured.');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) throw error;
  return { needsEmailConfirmation: !data.session };
}

/** Map a Supabase Auth error into a clear, user-facing message. */
export function formatAuthError(
  error: unknown,
  context: AuthErrorContext,
  providerLabel?: string
): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';

  if (context === 'oauth' && /provider.*not enabled|unsupported provider/i.test(message)) {
    return `${providerLabel ?? 'This'} sign-in isn't enabled on this server. Use email or continue as guest.`;
  }
  if (/invalid login credentials/i.test(message)) {
    return 'Incorrect email or password.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'Please confirm your email address first, then try signing in.';
  }
  if (/user already registered|already been registered/i.test(message)) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (/password.*(at least|short|length|6)/i.test(message)) {
    return 'Password must be at least 6 characters.';
  }
  if (/rate limit|too many requests/i.test(message)) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the sign-in server. Check your connection or local Supabase instance.';
  }
  if (context === 'oauth') {
    return `Couldn't sign you in with ${providerLabel ?? 'this provider'}. Please try again.`;
  }
  return context === 'email-signup'
    ? "Couldn't create your account. Please try again."
    : "Couldn't sign you in. Please try again.";
}

/** Redirect to GitHub using Supabase's OAuth flow. */
export async function signInWithGitHub(): Promise<void> {
  return signInWithProvider('github');
}

/** Redirect to Google using Supabase's OAuth flow. */
export async function signInWithGoogle(): Promise<void> {
  return signInWithProvider('google');
}

async function signInWithProvider(provider: 'github' | 'google'): Promise<void> {
  if (!supabase) throw new Error('Supabase Auth is not configured.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) throw error;
}

/** Sign out of this browser's Supabase session before clearing the local profile. Also ends any guest session. */
export async function logoutUser(): Promise<void> {
  localStorage.removeItem(GUEST_KEY);
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }
  localStorage.removeItem(AUTH_USER_KEY);
}
