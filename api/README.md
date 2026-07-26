# POS API Server

Standalone, extensible Node.js backend for the POS app. It keeps third-party
secrets on the server and exposes a small module-based HTTP API to the browser.

The first module is an **AI proxy** that forwards OpenAI-compatible chat
completion requests upstream, injecting the API key and URL server-side so they
never ship in the frontend bundle.

## Run

```bash
cd api
npm install
npm start
```

Server listens on `http://localhost:3140` by default.

## Authentication

When `GATEWAY_AUTH_REQUIRED=true` (and `GATEWAY_JWT_SECRET` matches the auth
gateway), all module routes (e.g. `/ai/*`) require:

```
Authorization: Bearer <pos_session JWT>
```

`/health` remains public. See [docs/security/GATEWAY.md](../docs/security/GATEWAY.md).

From the project root:

```bash
npm run api-server
```

## Environment

Env files are layered (like Vite): the committed `.env` holds non-secret
defaults, and `.env.local` (gitignored via `*.local`) holds your real
credentials and **overrides** `.env`. This keeps your keys off git.

- `api/.env` — committed defaults, blank `OPENAI_*` placeholders. Safe to push.
- `api/.env.local` — your machine only. Put `OPENAI_API_KEY` / `OPENAI_API_URL`
  here. Never committed.

```bash
# fill in your credentials locally
cd api
# edit api/.env.local
```

`server.js` loads `.env` first, then `.env.local` with override, so local values
win. All secrets remain server-side; do not add them to the frontend `.env`.

| Variable | Purpose |
|----------|---------|
| `API_HOST` / `API_PORT` | Bind address (default `0.0.0.0:3140`) |
| `API_LOG_LEVEL` | `debug`, `info`, `warn`, `error` |
| `API_ALLOWED_ORIGINS` | Comma-separated CORS allow-list (e.g. `http://localhost:5173`) |
| `OPENAI_API_KEY` | OpenAI / Azure OpenAI key (AI module) |
| `OPENAI_API_URL` | Chat completions endpoint |
| `OPENAI_PROXY_URL` | Optional URL that overrides `OPENAI_API_URL` |
| `OPENAI_MODEL` | Model name (default `gpt-4o-mini`) |
| `AI_ENABLED` | `false` / `0` hard-blocks all AI (403). Default `true`. |
| `AI_DAILY_LIMIT` | Max chat completions per UTC day. Empty/unset = unlimited. |
| `AI_MONTHLY_LIMIT` | Max chat completions per UTC calendar month. Empty/unset = unlimited. |

### AI usage limits (VPS / shared key)

Each successful `POST /ai/chat/completions` counts toward the daily and monthly
caps. Counters live in `api/data/ai-usage.json` on the API host (not in the
browser). Change limits or set `AI_ENABLED=false` in `.env.local` and restart
the API process.

Leave `AI_DAILY_LIMIT` / `AI_MONTHLY_LIMIT` blank on local installs where the
customer supplies their own OpenAI key — quotas do not apply unless set.

## API

### `GET /health`

Returns `{ ok, service, modules }`.

### `GET /ai/usage`

Returns current quota status (no secrets):

```json
{
  "enabled": true,
  "daily": { "used": 12, "limit": 100 },
  "monthly": { "used": 87, "limit": 2000 }
}
```

`limit` is `null` when that cap is unset (unlimited).

### `POST /ai/chat/completions`

Proxies an OpenAI-compatible chat completion. The browser sends only messages
and (optional) tool definitions; the server injects the model, key, and URL.
Checks `AI_ENABLED` and daily/monthly limits before forwarding; increments
counters only after a successful upstream response.

Request:

```json
{
  "messages": [{ "role": "user", "content": "Summarize today's sales" }],
  "tools": []
}
```

Response: the raw OpenAI-compatible chat completion JSON (`{ choices: [...] }`).
On failure, a JSON error `{ success: false, error, details? }` with the upstream
status code. Quota failures return `403` (`AI_DISABLED`) or `429`
(`AI_DAILY_LIMIT` / `AI_MONTHLY_LIMIT`) with:

```json
{
  "success": false,
  "error": "Daily AI limit reached. ...",
  "code": "AI_DAILY_LIMIT",
  "daily": { "used": 100, "limit": 100 },
  "monthly": { "used": 450, "limit": 2000 }
}
```

Azure endpoints (URL contains `openai.azure.com`) automatically use the
`api-key` header instead of `Authorization: Bearer`.

### `POST /fiscal/invoice`

Proxies a Pakistan FBR/PRA fiscal invoice POST so the browser never calls the
authority URL directly (avoids CORS). Credentials and upstream URL come from
Integrations settings on the client; the API only forwards the hop.

Request:

```json
{
  "url": "https://authority.example/invoice",
  "bearerToken": "…",
  "payload": { }
}
```

Response: the upstream status code and JSON body (e.g. `{ "Code": 100, "InvoiceNumber": "…" }`).
On network failure to the authority, `{ success: false, error }` with status `502`.
Validation failures return `400`.

## Adding a new module

The service is designed so future backends are not limited to AI:

1. Create `src/modules/<name>/` with a `<name>.routes.js` that exports an
   Express `Router` (add controller/provider files as needed).
2. Register it in `src/modules/index.js`:

```js
const modules = [
  { name: 'ai', basePath: '/ai', router: require('./ai/ai.routes') },
  { name: 'reports', basePath: '/reports', router: require('./reports/reports.routes') },
];
```

`server.js` mounts every registered module automatically — no other changes
needed. Reuse `src/lib/response.js` (`sendSuccess`/`handleError`) and
`src/lib/logger.js` for consistent responses and secret-safe logging.
