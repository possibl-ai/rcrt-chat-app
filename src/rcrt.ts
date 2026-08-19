// RCRT SDK client wrapper for the chat app.
//
// On the platform, the SPA is served at /<service_id>/ on the same origin as
// the api-gateway, so /v1/* paths resolve to the gateway directly. For local
// dev, set VITE_GATEWAY_URL to point at a running api-gateway.
//
// The SDK is used for the chat.send() call. SSE streaming uses a direct
// EventSource connection with the token in the query string (the gateway
// accepts ?token= for SSE endpoints — same pattern as the user-app).

import { createClient, type RcrtClient } from '@rcrt/sdk';

let clientInstance: RcrtClient | null = null;

export function gatewayBase(): string {
  // Empty string = same-origin (the platform ingress serves both the SPA
  // at /<service_id>/ and the gateway at /v1/* on the same host).
  return import.meta.env.VITE_GATEWAY_URL ?? '';
}

export function getRcrtClient(token: string, tenantId?: string): RcrtClient {
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
 * Send a chat message via POST /v1/chat (directly to the gateway, same origin).
 * Returns the user message id + session id (the reply comes via SSE).
 */
export async function sendChat(
  message: string,
  sessionId: string,
  token: string,
  tenantId: string,
): Promise<{ id: string; session_id: string }> {
  const res = await fetch(`${gatewayBase()}/v1/chat`, {
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
 * Open an SSE stream for a chat session directly to the gateway.
 * EventSource cannot set Authorization headers, so the token is passed
 * as a query parameter (same pattern as the platform's user-app).
 */
export function openChatStream(
  sessionId: string,
  token: string,
  tenantId: string,
  onEvent: (event: { type: string; data: string }) => void,
  onError?: (err: Event) => void,
): () => void {
  const path = `${gatewayBase()}/v1/sessions/${encodeURIComponent(sessionId)}/stream`;
  const url = new URL(path, window.location.origin);
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
