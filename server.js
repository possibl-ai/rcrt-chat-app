// Production server: serves the built SPA.
//
// On the RCRT platform, the service is mounted at /<service_id>/ on the
// api-gateway ingress. The ingress forwards the full path to this server,
// so this server serves assets at both /assets/* (ingress strips prefix)
// and /<service_id>/assets/* (ingress keeps prefix) to be robust to either
// ingress configuration.
//
// The SPA calls the gateway directly at /v1/* (same origin) and uses
// EventSource with ?token= for SSE streaming. No server-side proxy is needed.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '8080', 10);
const BASE_PATH = process.env.RCRT_BASE_PATH ?? '/rcrt-chat-app';

const app = express();

const distDir = join(__dirname, 'dist');

// Serve static assets — mounted at root so it matches both /assets/* and
// /<base>/assets/* (the express.static middleware tries the full path
// relative to distDir; for /<base>/assets/index.js it looks for that exact
// file, which won't exist, so we also mount under the base path).
app.use(express.static(distDir));
app.use(BASE_PATH, express.static(distDir));

// SPA fallback — serve index.html for any non-asset GET request, at both
// root and under the base path.
function serveIndex(_req, res) {
  res.sendFile(join(distDir, 'index.html'));
}
app.get('*', serveIndex);

app.listen(PORT, () => {
  console.log(`rcrt-chat-app listening on :${PORT} (base: ${BASE_PATH})`);
});
