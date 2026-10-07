import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '../types';

const AUTH_USER_KEY = 'viera_auth_user';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const supabase = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

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

/** Build the app profile from a GitHub- or Google-authenticated Supabase user. */
export function profileFromAuthUser(user: User): UserProfile | null {
  const provider = user.app_metadata.provider;
  if (provider !== 'github' && provider !== 'google') return null;
  const existing = getCurrentUser();
  if (existing?.id === user.id) return existing;
  const metadata = user.user_metadata;
  const username = typeof metadata.user_name === 'string' ? metadata.user_name : '';
  return {
    id: user.id,
    email: user.email || '',
    username,
    nickname: typeof metadata.full_name === 'string' ? metadata.full_name
      : typeof metadata.name === 'string' ? metadata.name
        : username || (provider === 'google' ? 'Google user' : 'GitHub user'),
    picture: typeof metadata.avatar_url === 'string' ? metadata.avatar_url
      : typeof metadata.picture === 'string' ? metadata.picture : '',
    gender: 'unspecified',
    bio: '',
    isSetupComplete: false,
    createdAt: Date.now(),
  };
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

/** Sign out of this browser's Supabase session before clearing the local profile. */
export async function logoutUser(): Promise<void> {
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }
  localStorage.removeItem(AUTH_USER_KEY);
}
