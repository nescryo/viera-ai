import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
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

describe('Supabase authentication', () => {
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

  it('signs in with trimmed email and password', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    const { signInWithEmail } = await import('../src/services/authService');
    await signInWithEmail('  alice@example.com  ', 'secret123');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alice@example.com', password: 'secret123',
    });
  });

  it('creates an email account and reports when immediate session is returned', async () => {
    auth.signUp.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });
    const { signUpWithEmail } = await import('../src/services/authService');
    const result = await signUpWithEmail('  alice@example.com ', 'secret123');
    expect(result).toEqual({ needsEmailConfirmation: false });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'secret123',
      options: { emailRedirectTo: 'https://viera.example/' },
    });
  });

  it('reports when email confirmation is required after sign-up', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const { signUpWithEmail } = await import('../src/services/authService');
    await expect(signUpWithEmail('alice@example.com', 'secret123')).resolves.toEqual({
      needsEmailConfirmation: true,
    });
  });

  it('maps email identity into a profile using the email local part as fallback nickname', async () => {
    const { profileFromAuthUser } = await import('../src/services/authService');
    expect(profileFromAuthUser(githubUser({
      email: 'alice@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: {},
    }))).toMatchObject({
      id: 'supabase-user-id', email: 'alice@example.com', username: '',
      nickname: 'alice', picture: '', isSetupComplete: false,
    });
  });

  it('handles email users with missing or very long email addresses', async () => {
    const { profileFromAuthUser } = await import('../src/services/authService');
    expect(profileFromAuthUser(githubUser({
      email: undefined, app_metadata: { provider: 'email' }, user_metadata: {},
    }))?.nickname).toBe('User');
    expect(profileFromAuthUser(githubUser({
      email: 'averylongemailaddressprefix@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: {},
    }))?.nickname).toBe('averylongemailaddres');
  });

  it('fails clearly when configuration is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    const { signInWithGitHub, signInWithEmail, signUpWithEmail } = await import('../src/services/authService');
    await expect(signInWithGitHub()).rejects.toThrow('not configured');
    await expect(signInWithEmail('a@b.com', '123456')).rejects.toThrow('not configured');
    await expect(signUpWithEmail('a@b.com', '123456')).rejects.toThrow('not configured');
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('propagates sign-in and sign-up errors', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: new Error('OAuth unavailable') });
    auth.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') });
    auth.signUp.mockResolvedValue({ data: { session: null }, error: new Error('User already registered') });
    const { signInWithGitHub, signInWithEmail, signUpWithEmail } = await import('../src/services/authService');
    await expect(signInWithGitHub()).rejects.toThrow('OAuth unavailable');
    await expect(signInWithEmail('a@b.com', 'wrong')).rejects.toThrow('Invalid login credentials');
    await expect(signUpWithEmail('a@b.com', '123456')).rejects.toThrow('User already registered');
  });

  it('detects enabled auth providers from Supabase Auth settings', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321/');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ external: { email: true, github: false, google: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getEnabledAuthProviders } = await import('../src/services/authService');
    await expect(getEnabledAuthProviders()).resolves.toEqual({
      email: true, github: false, google: true,
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:54321/auth/v1/settings', {
      headers: { apikey: 'sb_publishable_example' },
      signal: undefined,
    });
  });

  it('returns null when auth settings cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const { getEnabledAuthProviders } = await import('../src/services/authService');
    await expect(getEnabledAuthProviders()).resolves.toBeNull();
  });

  it('formats common Supabase Auth errors into user-facing messages', async () => {
    const { formatAuthError } = await import('../src/services/authService');
    expect(formatAuthError(new Error('Unsupported provider: provider is not enabled'), 'oauth', 'GitHub'))
      .toContain("GitHub sign-in isn't enabled");
    expect(formatAuthError(new Error('Invalid login credentials'), 'email-signin'))
      .toBe('Incorrect email or password.');
    expect(formatAuthError(new Error('Email not confirmed'), 'email-signin'))
      .toContain('confirm your email');
    expect(formatAuthError(new Error('User already registered'), 'email-signup'))
      .toContain('already exists');
    expect(formatAuthError(new Error('Password should be at least 6 characters.'), 'email-signup'))
      .toBe('Password must be at least 6 characters.');
    expect(formatAuthError(new TypeError('Failed to fetch'), 'email-signin'))
      .toContain('Could not reach the sign-in server');
    expect(formatAuthError(new Error('Unknown'), 'email-signup'))
      .toBe("Couldn't create your account. Please try again.");
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
    expect(profileFromAuthUser(githubUser({ app_metadata: { provider: 'phone' } }))).toBeNull();
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

  it('starts a local guest session without calling Supabase', async () => {
    const { startGuestSession, getGuestSession, GUEST_USER_ID } = await import('../src/services/authService');
    expect(getGuestSession()).toBeNull();
    expect(startGuestSession()).toMatchObject({ id: GUEST_USER_ID, isSetupComplete: true });
    expect(getGuestSession()).toMatchObject({ id: GUEST_USER_ID });
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('keeps guest profile edits and ends the guest session on logout', async () => {
    const { startGuestSession, saveCurrentUser, getGuestSession, logoutUser } = await import('../src/services/authService');
    saveCurrentUser({ ...startGuestSession(), nickname: 'Nes' });
    expect(getGuestSession()?.nickname).toBe('Nes');
    auth.signOut.mockResolvedValueOnce({ error: null });
    await logoutUser();
    expect(getGuestSession()).toBeNull();
  });
});
