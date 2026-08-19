// Production server: serves the built SPA + proxies /api/chat and the SSE
// /api/chat/stream to the RCRT api-gateway. The SPA talks to same-origin
// /api/* paths so the browser never deals with CORS and the bearer token
// stays on the server side for the SSE connection (EventSource cannot set
// custom headers).
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The RCRT api-gateway base URL. On the platform, the ingress mounts the
// service at /<service_id>/, so the gateway is reachable at the same origin
// as the SPA minus the service path. For local dev, set RCRT_BASE_URL.
const RCRT_BASE_URL = process.env.RCRT_BASE_URL ?? '';
const PORT = parseInt(process.env.PORT ?? '8080', 10);

const app = express();
app.use(express.json());

// Resolve the gateway base URL. When running on the platform, the api-gateway
// is at the cluster ingress root (the same host the service is mounted on),
// so we derive it from the request's origin if RCRT_BASE_URL is unset.
function resolveGatewayBase(req) {
  if (RCRT_BASE_URL) return RCRT_BASE_URL.replace(/\/$/, '');
  // On the platform: api-gateway is at the root origin.
  const host = req.get('host');
  if (!host) return '';
  // The service is mounted under /<service_id>/ on the gateway, so the
  // gateway root is the same origin.
  return `${req.protocol}://${host}`;
}

// --- Proxy: POST /api/chat -> gateway POST /v1/chat ---
app.post('/api/chat', async (req, res) => {
  const base = resolveGatewayBase(req);
  const token = req.headers['authorization'];
  const tenantId = req.headers['x-tenant-id'];
  const traceId = req.headers['x-request-id'];

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = token;
    if (tenantId) headers['X-Tenant-ID'] = Array.isArray(tenantId) ? tenantId[0] : tenantId;
    if (traceId) headers['X-Request-Id'] = Array.isArray(traceId) ? traceId[0] : traceId;

    const resp = await fetch(`${base}/v1/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });

    const text = await resp.text();
    res.status(resp.status);
    const ct = resp.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    res.send(text);
  } catch (err) {
    console.error('chat proxy error', err);
    res.status(502).json({ error: { code: 'proxy.chat_failed', message: 'The chat request could not reach the RCRT gateway.' } });
  }
});

// --- Proxy: GET /api/chat/stream -> gateway SSE /v1/sessions/{id}/stream ---
// EventSource cannot set Authorization headers, so the SPA passes the token
// and tenant id as query params and this proxy injects them as headers.
app.get('/api/chat/stream', async (req, res) => {
  const base = resolveGatewayBase(req);
  const sessionId = req.query.session_id;
  const token = req.query.token;
  const tenantId = req.query.tenant_id;
  const lastEventId = req.headers['last-event-id'];

  if (!sessionId || !token) {
    return res.status(400).json({ error: { code: 'proxy.missing_params', message: 'session_id and token are required.' } });
  }

  try {
    const headers = {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    };
    if (tenantId) headers['X-Tenant-ID'] = String(tenantId);
    if (lastEventId) headers['Last-Event-ID'] = String(lastEventId);

    const upstream = await fetch(
      `${base}/v1/sessions/${encodeURIComponent(String(sessionId))}/stream`,
      { headers },
    );

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).send(text);
    }

    res.set('Content-Type', 'text/event-stream');
    res.set('Cache-Control', 'no-cache');
    res.set('Connection', 'keep-alive');
    res.set('X-Accel-Buffering', 'no');

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    const cleanup = () => {
      try { reader.cancel(); } catch { /* already closed */ }
    };
    req.on('close', cleanup);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    console.error('sse proxy error', err);
    if (!res.headersSent) {
      res.status(502).json({ error: { code: 'proxy.sse_failed', message: 'The SSE stream could not reach the RCRT gateway.' } });
    }
  }
});

// --- Proxy: GET /api/auth/tenants -> gateway GET /v1/auth/tenants ---
app.get('/api/auth/tenants', async (req, res) => {
  const base = resolveGatewayBase(req);
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ error: { code: 'proxy.no_token', message: 'Authorization header required.' } });
  }
  try {
    const resp = await fetch(`${base}/v1/auth/tenants`, {
      headers: { Authorization: token },
    });
    const text = await resp.text();
    res.status(resp.status);
    const ct = resp.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    res.send(text);
  } catch (err) {
    console.error('tenants proxy error', err);
    res.status(502).json({ error: { code: 'proxy.tenants_failed', message: 'Could not reach the RCRT gateway.' } });
  }
});

// --- Proxy: GET /api/env-config -> gateway GET /v1/env-config (public) ---
app.get('/api/env-config', async (req, res) => {
  const base = resolveGatewayBase(req);
  try {
    const resp = await fetch(`${base}/v1/env-config`);
    const text = await resp.text();
    res.status(resp.status);
    const ct = resp.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    res.send(text);
  } catch (err) {
    console.error('env-config proxy error', err);
    res.status(502).json({ error: { code: 'proxy.env_config_failed', message: 'Could not reach the RCRT gateway.' } });
  }
});

// --- Serve the SPA ---
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback: any non-/api route serves index.html (client-side routing)
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`rcrt-chat-app listening on :${PORT}`);
});
