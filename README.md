# RCRT Chat App

A single-page application that provides login (Google/Microsoft OAuth + email/password) and a chatbot interface powered by the [`@rcrt/sdk`](https://github.com/possibl-ai/rcrt-platform/tree/development/packages/sdk).

## Architecture

- **Frontend**: Vite + React + TypeScript SPA
- **Backend**: Express static server with proxy endpoints for the RCRT api-gateway
- **SDK**: `@rcrt/sdk` (vendored local copy in `vendor/rcrt-sdk/`)

## Auth flow

1. `GET /api/env-config` — discover the deployment's auth mode + OAuth providers
2. **Email/password**: `POST /v1/auth/login` → session JWT (stored in `localStorage`)
3. **Google/Microsoft OAuth**: redirect to `/v1/auth/oauth/{provider}/start` → returns to `/auth/callback` with `#access_token=...` in the fragment
4. `GET /api/auth/tenants` — list workspaces; `POST /api/auth/signup` if empty
5. Select a workspace (`X-Tenant-ID`)

## Chat flow

- `POST /api/chat` — send a message (proxied to gateway `POST /v1/chat`)
- `GET /api/chat/stream` — SSE stream of assistant replies (proxied to `GET /v1/sessions/{id}/stream`)

## Local development

```bash
# Point at a running api-gateway
export VITE_GATEWAY_URL=https://aks-dev.rcrt-platform.com

# Install + run dev server
npm install
npm run dev
```

## Production

```bash
npm run build
npm start
```

Or build with Docker:

```bash
docker build -t rcrt-chat-app .
docker run -p 8080:8080 rcrt-chat-app
```

## License

Apache-2.0
