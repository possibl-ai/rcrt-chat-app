// OAuth callback page — the gateway redirects here with #access_token=...
// Consume the fragment, persist the token, then redirect to the app root.

import { useEffect } from 'react';
import { consumeOAuthFragment } from '../auth';

export function AuthCallbackPage() {
  useEffect(() => {
    consumeOAuthFragment();
    const base = import.meta.env.BASE_URL || '/';
    window.location.replace(base);
  }, []);

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand-mark">RCRT</div>
        <p className="login-subtitle">Completing sign-in…</p>
      </div>
    </div>
  );
}
