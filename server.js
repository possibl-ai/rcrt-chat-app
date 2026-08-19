// Production server: serves the built SPA.
//
// On the RCRT platform, the service is mounted at /<service_id>/ on the
// api-gateway ingress. The ingress forwards the full path (with the
// /<service_id>/ prefix) to this server. Vite's `base` config makes the
// HTML reference assets at /<service_id>/assets/..., so this server strips
// the base prefix before serving from dist/.
//
// The SPA calls the gateway directly at /v1/* (same origin) and uses
// EventSource with ?token= for SSE streaming. No server-side proxy is needed.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '8080', 10);
// The base path the ingress mounts the service under. Must match Vite's `base`.
const BASE_PATH = process.env.RCRT_BASE_PATH ?? '/rcrt-chat-app';

const app = express();

// Strip the base path prefix so express.static can serve from dist/.
// e.g. GET /rcrt-chat-app/assets/index.js -> dist/assets/index.js
app.use(BASE_PATH, express.static(join(__dirname, 'dist')));

// SPA fallback under the base path: any non-asset route serves index.html
app.get(`${BASE_PATH}/*`, (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// Also handle the bare base path (no trailing slash)
app.get(BASE_PATH, (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`rcrt-chat-app listening on :${PORT} (base: ${BASE_PATH})`);
});
