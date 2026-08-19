// App — top-level router. Shows login or chat based on auth state.
// /auth/callback -> AuthCallbackPage (consumes OAuth fragment)
// everything else -> LoginPage or ChatPage based on auth state.

import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';

const CALLBACK_PATH = `${import.meta.env.BASE_URL || '/'}auth/callback`.replace(/\/+/g, '/');

export function App() {
  const { isAuthenticated, isLoading } = useAuth();
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (path === CALLBACK_PATH) {
    return <AuthCallbackPage />;
  }

  if (isLoading) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="brand-mark">RCRT</div>
          <p className="login-subtitle">Loading…</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <ChatPage /> : <LoginPage />;
}
