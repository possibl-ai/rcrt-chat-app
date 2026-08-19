// RCRT SDK client wrapper for the chat app.
//
// Uses @rcrt/sdk's createClient with a staticToken provider (the session JWT
// we obtained at login). The client talks to the api-gateway directly, but
// for SSE streaming we use the /api/chat/stream proxy because EventSource
// cannot set Authorization headers.

import { createClient, type RcrtClient } from '@rcrt/sdk';

let clientInstance: RcrtClient | null = null;

export function gatewayBase(): string {
  return import.meta.env.VITE_GATEWAY_URL ?? '';
}

export function getRcrtClient(token: string, tenantId?: string): RcrtClient {
  // Create a fresh client each time the token or tenant changes — the SDK
  // caches the token provider, so a stale one would keep sending an old token.
  clientInstance = createClient({
    baseURL: gatewayBase(),
    tokenProvider: async () => token,
    tenantId,
    authMethod: 'session_jwt',
  });
  return clientInstance;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sessionId?: string;
}

/**
 * Send a chat message via the proxied /api/chat endpoint.
 * Returns the user message id + session id (the reply comes via SSE).
 */
export async function sendChat(
  message: string,
  sessionId: string,
  token: string,
  tenantId: string,
): Promise<{ id: string; session_id: string }> {
  const res = await fetch(`${gatewayBase()}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
    },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `Chat failed (${res.status})`);
  }
  return res.json();
}

/**
 * Open an SSE stream for a chat session via the /api/chat/stream proxy.
 * The proxy injects the Authorization + X-Tenant-ID headers (EventSource can't).
 * Returns a function to close the connection.
 */
export function openChatStream(
  sessionId: string,
  token: string,
  tenantId: string,
  onEvent: (event: { type: string; data: string }) => void,
  onError?: (err: Event) => void,
): () => void {
  const url = new URL(`${gatewayBase()}/api/chat/stream`);
  url.searchParams.set('session_id', sessionId);
  url.searchParams.set('token', token);
  url.searchParams.set('tenant_id', tenantId);

  const es = new EventSource(url.toString());

  es.onmessage = (e) => {
    onEvent({ type: 'message', data: e.data });
  };
  es.addEventListener('agent.message', (e) => {
    onEvent({ type: 'agent.message', data: (e as MessageEvent).data });
  });
  es.addEventListener('agent.delta', (e) => {
    onEvent({ type: 'agent.delta', data: (e as MessageEvent).data });
  });
  es.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => es.close();
}
