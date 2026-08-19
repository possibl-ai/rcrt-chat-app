// Login page — email/password + Google/Microsoft OAuth buttons.

import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

export function LoginPage() {
  const { signIn, startOAuth, oauthProviders, registrationEnabled, isLoading } = useAuth();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        const res = await fetch(`${import.meta.env.VITE_GATEWAY_URL ?? ''}/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error?.message ?? 'Registration failed.');
        setNotice(body.message ?? 'Account ready — sign in to continue.');
        setMode('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const providerLabel: Record<string, string> = { google: 'Google', microsoft: 'Microsoft' };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand-mark">RCRT</div>
        <h1 className="login-title">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="login-subtitle">
          {mode === 'signin' ? 'Welcome back to RCRT Chat.' : 'Set up your account to get started.'}
        </p>

        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-info">{notice}</div>}

        {mode === 'signin' && oauthProviders.length > 0 && (
          <div className="oauth-section">
            {oauthProviders.map((p) => (
              <button
                key={p}
                className="btn btn-oauth"
                disabled={busy || isLoading}
                onClick={() => startOAuth(p)}
              >
                <ProviderIcon provider={p} />
                Continue with {providerLabel[p] ?? p}
              </button>
            ))}
            <div className="divider">
              <span>or</span>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="login-form">
          {mode === 'register' && (
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 12 : undefined}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || isLoading}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {registrationEnabled && (
          <button
            className="toggle-mode"
            onClick={() => {
              setMode(mode === 'signin' ? 'register' : 'signin');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'signin' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </button>
        )}
      </div>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'google') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
    );
  }
  if (provider === 'microsoft') {
    return (
      <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
        <rect x="1" y="1" width="10" height="10" fill="#F25022" />
        <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
        <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
        <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
      </svg>
    );
  }
  return null;
}
