import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  formatAuthError,
  getEnabledAuthProviders,
  getSupabaseClient,
  signInWithEmail,
  signInWithGitHub,
  signInWithGoogle,
  signUpWithEmail,
  type EnabledAuthProviders,
} from '../../services/authService';
import './forms/forms.css';
import './LoginModal.css';

// Temporary logo until Viera has its own mark
const LOGO_URL = '/viera-avatar.png';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INITIAL_PROVIDERS: EnabledAuthProviders = { email: true, github: false, google: false };
const FALLBACK_PROVIDERS: EnabledAuthProviders = { email: true, github: true, google: true };

interface LoginModalProps {
  isRestoringSession: boolean;
  onGuestLogin: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isRestoringSession, onGuestLogin }) => {
  const isConfigured = Boolean(getSupabaseClient());
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [signingInProvider, setSigningInProvider] = useState<'GitHub' | 'Google' | null>(null);
  const [enabledProviders, setEnabledProviders] = useState<EnabledAuthProviders>(INITIAL_PROVIDERS);

  useEffect(() => {
    if (!isConfigured) return;
    const controller = new AbortController();
    void getEnabledAuthProviders(controller.signal).then((detected) => {
      if (controller.signal.aborted) return;
      setEnabledProviders(detected ?? FALLBACK_PROVIDERS);
    });
    return () => controller.abort();
  }, [isConfigured]);

  const isBusy = isRestoringSession || isSubmittingEmail || signingInProvider !== null;
  const oauthProviders = (['GitHub', 'Google'] as const).filter((provider) =>
    provider === 'GitHub' ? enabledProviders.github : enabledProviders.google
  );
  const showEmail = isConfigured && enabledProviders.email;
  const showOAuth = isConfigured && oauthProviders.length > 0;
  const noMethodsEnabled = isConfigured && !showEmail && !showOAuth;

  const handleModeChange = (nextMode: 'signin' | 'signup') => {
    setMode(nextMode);
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setIsSubmittingEmail(true);
    try {
      if (mode === 'signup') {
        const { needsEmailConfirmation } = await signUpWithEmail(trimmedEmail, password);
        if (needsEmailConfirmation) {
          setInfoMsg('Check your email to confirm your account, then sign in.');
          setPassword('');
          setMode('signin');
        }
      } else {
        await signInWithEmail(trimmedEmail, password);
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err, mode === 'signup' ? 'email-signup' : 'email-signin'));
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleOAuthLogin = async (provider: 'GitHub' | 'Google') => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSigningInProvider(provider);
    try {
      await (provider === 'GitHub' ? signInWithGitHub() : signInWithGoogle());
    } catch (err) {
      setErrorMsg(formatAuthError(err, 'oauth', provider));
      setSigningInProvider(null);
    }
  };

  return (
    <div className="modal-backdrop auth-gate-backdrop">
      <div
        className="modal-container login-modal glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <img src={LOGO_URL} alt="" className="login-logo" />
        <h1 id="login-title" className="login-title">Viera</h1>
        <p className="login-tagline">Talk, ask, or just hang out — in 3D.</p>
        <p className="login-features">Chat · Voice · Remembers your conversations</p>

        <div className="login-action">
          {!isConfigured && (
            <div className="form-alert" role="alert">
              <AlertCircle size={16} />
              <span>Sign-in isn't configured yet. Continue as a guest, or configure Supabase to enable accounts.</span>
            </div>
          )}

          {noMethodsEnabled && (
            <div className="form-alert" role="alert">
              <AlertCircle size={16} />
              <span>No sign-in methods are enabled on this server. You can still continue as a guest.</span>
            </div>
          )}

          {errorMsg && (
            <div className="form-alert" role="alert">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="login-notice" role="status">
              <CheckCircle2 size={16} />
              <span>{infoMsg}</span>
            </div>
          )}

          {showEmail && (
            <>
              <div className="login-mode-tabs" role="tablist" aria-label="Account mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signin'}
                  className={`login-mode-tab${mode === 'signin' ? ' is-active' : ''}`}
                  disabled={isBusy}
                  onClick={() => handleModeChange('signin')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={`login-mode-tab${mode === 'signup' ? ' is-active' : ''}`}
                  disabled={isBusy}
                  onClick={() => handleModeChange('signup')}
                >
                  Create account
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="login-email-form" noValidate>
                <div className="form-group">
                  <label htmlFor="login-email" className="form-label">Email</label>
                  <input
                    id="login-email"
                    type="email"
                    className="form-input"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    disabled={isBusy}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="login-password" className="form-label">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    className="form-input"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                    value={password}
                    disabled={isBusy}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn--primary btn--block" disabled={isBusy}>
                  {isRestoringSession
                    ? 'Checking session…'
                    : isSubmittingEmail
                      ? (mode === 'signup' ? 'Creating account…' : 'Signing in…')
                      : (mode === 'signup' ? 'Create account' : 'Sign in')}
                </button>
              </form>
            </>
          )}

          {showEmail && showOAuth && (
            <div className="login-divider" aria-hidden="true">
              <span>or</span>
            </div>
          )}

          {showOAuth && (
            <div className={`login-oauth-row${oauthProviders.length === 1 ? ' login-oauth-row--single' : ''}`}>
              {oauthProviders.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  aria-label={`Continue with ${provider}`}
                  className={`login-provider-button login-provider-button--${provider.toLowerCase()}`}
                  disabled={isBusy}
                  onClick={() => handleOAuthLogin(provider)}
                >
                  <svg className="login-provider-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    {provider === 'GitHub' ? (
                      <path fill="currentColor" d="M12 .297C5.37.297 0 5.67 0 12.297c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.043-1.61-4.043-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.084 1.838 1.237 1.838 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.334-5.466-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.536-1.524.118-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 0 1 3.003-.404c1.02.005 2.047.138 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.656 1.652.244 2.873.12 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.805 5.625-5.475 5.922.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297 24 5.67 18.627.297 12 .297Z" />
                    ) : (
                      <>
                        <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
                        <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
                        <path fill="#FBBC05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z" />
                        <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z" />
                      </>
                    )}
                  </svg>
                  {signingInProvider === provider
                    ? 'Redirecting…'
                    : oauthProviders.length === 1
                      ? `Continue with ${provider}`
                      : provider}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="login-guest-button"
            disabled={isBusy}
            onClick={onGuestLogin}
          >
            Continue as guest
          </button>
        </div>
        <p className="login-note">Your chats are saved on this device by default. Guests are not added to the sign-in database.</p>
      </div>
    </div>
  );
};
