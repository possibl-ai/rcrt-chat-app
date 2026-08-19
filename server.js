// Production server: serves the built SPA.
//
// On the RCRT platform, the service is mounted at /<service_id>/ on the
// api-gateway ingress. The SPA calls the gateway directly at /v1/* (same
// origin) and uses EventSource with ?token= for SSE streaming. No server-side
// proxy is needed.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '8080', 10);

const app = express();

// Serve static assets from dist/
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback: any non-/api route serves index.html (client-side routing)
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`rcrt-chat-app listening on :${PORT}`);
});
