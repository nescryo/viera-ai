import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth })) }));

const storage = new Map<string, string>();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('window', { location: { origin: 'https://viera.example', pathname: '/' } });
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_example');
});

function githubUser(overrides: Partial<User> = {}): User {
  return {
    id: 'supabase-user-id', email: 'user@example.com',
    app_metadata: { provider: 'github' },
    user_metadata: { user_name: 'octocat', full_name: 'Octo Cat', avatar_url: 'https://github.com/avatar.png' },
    aud: 'authenticated', created_at: '2026-01-01T00:00:00Z', ...overrides,
  };
}

describe('Supabase OAuth authentication', () => {
  it('starts Google OAuth with the app URL as the redirect target', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: null });
    const { signInWithGoogle } = await import('../src/services/authService');
    await signInWithGoogle();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google', options: { redirectTo: 'https://viera.example/' },
    });
  });

  it('maps Google metadata into a profile with a stable Supabase ID', async () => {
    const { profileFromAuthUser } = await import('../src/services/authService');
    expect(profileFromAuthUser(githubUser({
      app_metadata: { provider: 'google' },
      user_metadata: { name: 'Google User', picture: 'https://example.com/avatar.png' },
    }))).toMatchObject({
      id: 'supabase-user-id', nickname: 'Google User', username: '',
      picture: 'https://example.com/avatar.png', isSetupComplete: false,
    });
  });

  it('handles Google users without optional metadata', async () => {
    const { profileFromAuthUser } = await import('../src/services/authService');
    expect(profileFromAuthUser(githubUser({
      app_metadata: { provider: 'google' }, user_metadata: {},
    }))?.nickname).toBe('Google user');
  });

  it('starts GitHub OAuth with the app URL as the redirect target', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: null });
    const { signInWithGitHub } = await import('../src/services/authService');
    await signInWithGitHub();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github', options: { redirectTo: 'https://viera.example/' },
    });
  });

  it('fails clearly when configuration is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    const { signInWithGitHub } = await import('../src/services/authService');
    await expect(signInWithGitHub()).rejects.toThrow('not configured');
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('propagates sign-in errors', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: new Error('OAuth unavailable') });
    const { signInWithGitHub } = await import('../src/services/authService');
    await expect(signInWithGitHub()).rejects.toThrow('OAuth unavailable');
  });

  it('maps a GitHub identity to a stable Supabase profile ID', async () => {
    const { profileFromAuthUser } = await import('../src/services/authService');
    expect(profileFromAuthUser(githubUser())).toMatchObject({
      id: 'supabase-user-id', email: 'user@example.com', username: 'octocat',
      nickname: 'Octo Cat', picture: 'https://github.com/avatar.png', isSetupComplete: false,
    });
  });

  it('preserves customized profile fields only for the authenticated account', async () => {
    const { profileFromAuthUser, saveCurrentUser } = await import('../src/services/authService');
    const profile = profileFromAuthUser(githubUser())!;
    saveCurrentUser({ ...profile, nickname: 'Custom name', isSetupComplete: true });
    expect(profileFromAuthUser(githubUser())?.nickname).toBe('Custom name');
    expect(profileFromAuthUser(githubUser({ id: 'different-user' }))?.isSetupComplete).toBe(false);
  });

  it('does not treat an unsupported identity as authenticated', async () => {
    const { profileFromAuthUser } = await import('../src/services/authService');
    expect(profileFromAuthUser(githubUser({ app_metadata: { provider: 'email' } }))).toBeNull();
  });

  it('handles private email and missing optional GitHub metadata', async () => {
    const { profileFromAuthUser } = await import('../src/services/authService');
    expect(profileFromAuthUser(githubUser({ email: undefined, user_metadata: {} }))).toMatchObject({
      id: 'supabase-user-id', email: '', username: '', nickname: 'GitHub user', picture: '',
    });
  });

  it('clears the local profile only after successful Supabase logout', async () => {
    const { logoutUser, saveCurrentUser, profileFromAuthUser, getCurrentUser } = await import('../src/services/authService');
    saveCurrentUser(profileFromAuthUser(githubUser())!);
    auth.signOut.mockResolvedValueOnce({ error: new Error('Network error') });
    await expect(logoutUser()).rejects.toThrow('Network error');
    expect(getCurrentUser()).not.toBeNull();
    auth.signOut.mockResolvedValueOnce({ error: null });
    await logoutUser();
    expect(getCurrentUser()).toBeNull();
  });

  it('listens for session restoration and logout, and unsubscribes on cleanup', async () => {
    const unsubscribe = vi.fn();
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
    const { subscribeToAuth } = await import('../src/services/authService');
    const listener = vi.fn();
    const cleanup = subscribeToAuth(listener);
    const callback = auth.onAuthStateChange.mock.calls[0][0];
    callback('INITIAL_SESSION', { user: githubUser() });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'supabase-user-id' }));
    callback('SIGNED_OUT', null);
    expect(listener).toHaveBeenLastCalledWith(null);
    cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not authenticate cached local profiles without a Supabase session', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const { subscribeToAuth, saveCurrentUser, profileFromAuthUser } = await import('../src/services/authService');
    saveCurrentUser(profileFromAuthUser(githubUser())!);
    const listener = vi.fn();
    subscribeToAuth(listener);
    expect(listener).toHaveBeenCalledWith(null);
  });
});
