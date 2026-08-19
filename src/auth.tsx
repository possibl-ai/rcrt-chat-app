// Auth context — mirrors the platform's user-app auth flow.
//
// Two sign-in paths:
//   1. Email + password -> POST /v1/auth/login (proxied via /api gateway).
//   2. Google/Microsoft OAuth -> redirect to the gateway's
//      /v1/auth/oauth/{provider}/start, which returns to /auth/callback
//      with #access_token=... in the fragment.
//
// The token is self-contained (~8h). We store it in localStorage and send it
// as a Bearer header on every proxied API call.

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

const TOKEN_KEY = 'rcrt_chat_token';
const TENANT_KEY = 'rcrt_chat_tenant';

export interface UserInfo {
  id: string;
  email: string | null;
  name: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  role: string;
}

interface EnvConfig {
  auth?: { mode?: string; bypass?: boolean; registration?: boolean; providers?: string[] };
  capabilities?: { password_auth?: boolean; social_login?: boolean };
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  oauthProviders: string[];
  registrationEnabled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  startOAuth: (provider: string) => void;
  token: string | null;
  tenants: Tenant[];
  activeTenant: Tenant | null;
  selectTenant: (t: Tenant) => void;
  loadTenants: () => Promise<void>;
  signupIfEmpty: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwt(token: string): { sub?: string; email?: string; name?: string; exp?: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

function isExpired(token: string | null, bufferSeconds = 60): boolean {
  if (!token) return true;
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 - Date.now() < bufferSeconds * 1000;
}

function userFromToken(token: string): UserInfo | null {
  const payload = decodeJwt(token);
  if (!payload?.sub) return null;
  return { id: payload.sub, email: payload.email ?? null, name: payload.name ?? null };
}

function gatewayBase(): string {
  // On the platform, same-origin (the proxy resolves the gateway). In local dev,
  // set VITE_GATEWAY_URL to point at a running api-gateway.
  return import.meta.env.VITE_GATEWAY_URL ?? '';
}

// The base path the SPA is mounted under (e.g. '/rcrt-chat-app/' on the
// platform, '/' in local dev). Vite sets this from the `base` config.
export function appBase(): string {
  return import.meta.env.BASE_URL || '/';
}

function authHeader(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (isExpired(token)) return null;
  return token ? `Bearer ${token}` : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);

  // Boot: fetch env-config to discover OAuth providers, then restore token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${gatewayBase()}/v1/env-config`);
        if (res.ok) {
          const cfg: EnvConfig = await res.json();
          setOauthProviders(cfg.auth?.providers ?? []);
          setRegistrationEnabled(cfg.auth?.registration !== false);
        }
      } catch {
        // unreachable gateway — show login form
      }
      if (cancelled) return;

      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored && !isExpired(stored)) {
        setUser(userFromToken(stored));
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Restore active tenant from storage.
  useEffect(() => {
    const storedTenant = localStorage.getItem(TENANT_KEY);
    if (storedTenant) {
      try {
        setActiveTenant(JSON.parse(storedTenant));
      } catch { /* ignore */ }
    }
  }, []);

  const selectTenant = useCallback((t: Tenant) => {
    setActiveTenant(t);
    localStorage.setItem(TENANT_KEY, JSON.stringify(t));
  }, []);

  const loadTenants = useCallback(async () => {
    const header = authHeader();
    if (!header) return;
    try {
      const res = await fetch(`${gatewayBase()}/v1/auth/tenants`, {
        headers: { Authorization: header },
      });
      if (res.ok) {
        const data = await res.json();
        const list: Tenant[] = data.tenants ?? [];
        setTenants(list);
        // Validate the stored tenant against the fetched list. A stale
        // tenant from a previous provision will 403 — clear it and pick
        // the first valid one.
        const stored = localStorage.getItem(TENANT_KEY);
        const storedId = stored ? (JSON.parse(stored) as Tenant).id : null;
        const valid = storedId ? list.find((t) => t.id === storedId) : null;
        if (valid) {
          setActiveTenant(valid);
        } else if (list.length > 0) {
          selectTenant(list[0]);
        } else {
          // No valid tenant — clear stale storage.
          localStorage.removeItem(TENANT_KEY);
          setActiveTenant(null);
        }
      }
    } catch { /* ignore — tenant list is best-effort */ }
  }, [selectTenant]);

  const signupIfEmpty = useCallback(async (): Promise<string> => {
    const header = authHeader();
    if (!header) return 'Not authenticated.';
    try {
      const res = await fetch(`${gatewayBase()}/v1/auth/signup`, {
        method: 'POST',
        headers: { Authorization: header, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (res.ok) {
        await loadTenants();
        return 'Workspace created.';
      }
      return data.error?.message ?? 'Could not create workspace.';
    } catch {
      return 'Could not reach the gateway.';
    }
  }, [loadTenants]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${gatewayBase()}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error?.message ?? 'Sign-in failed.');
    }
    const body = await res.json();
    const token = body.access_token as string;
    localStorage.setItem(TOKEN_KEY, token);
    setUser(userFromToken(token));
    setIsAuthenticated(true);
  }, []);

  const startOAuth = useCallback((provider: string) => {
    // Redirect to the gateway's OAuth start endpoint. The gateway carries
    // return_to through the OAuth state and on success redirects the browser
    // back to /auth/callback with #access_token=... in the fragment.
    const origin = window.location.origin;
    const base = gatewayBase() || origin;
    const returnTo = `${origin}${appBase()}auth/callback`;
    const url = `${base}/v1/auth/oauth/${encodeURIComponent(provider)}/start?return_to=${encodeURIComponent(returnTo)}`;
    window.location.href = url;
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY);
    setUser(null);
    setIsAuthenticated(false);
    setTenants([]);
    setActiveTenant(null);
  }, []);

  const token = isAuthenticated ? localStorage.getItem(TOKEN_KEY) : null;

  const value: AuthContextValue = {
    isAuthenticated,
    isLoading,
    user,
    oauthProviders,
    registrationEnabled,
    signIn,
    signOut,
    startOAuth,
    token,
    tenants,
    activeTenant,
    selectTenant,
    loadTenants,
    signupIfEmpty,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function consumeOAuthFragment(): string | null {
  // On /auth/callback, the gateway redirects with #access_token=...
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  if (token && token.split('.').length === 3) {
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  }
  return null;
}
