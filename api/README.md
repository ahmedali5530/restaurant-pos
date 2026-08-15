# POS API Server

Standalone, extensible Node.js backend for the POS app. It keeps third-party
secrets on the server and exposes a small module-based HTTP API to the browser.

The first module is an **AI proxy** that forwards OpenAI-compatible chat
completion requests upstream. Operators define named **profiles** and map app
**tasks** (reporting, analysis, forecast, ocr) to those profiles in
`.env.local`. Keys, URLs, and models stay server-side and never ship in the
frontend bundle.

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

- `api/.env` — committed defaults, blank placeholders. Safe to push.
- `api/.env.local` — your machine only. Put profile URLs/keys/models here.
  Never committed.

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
| `AI_PROFILES` | Comma-separated profile names you choose (e.g. `cheap,strong,vision`) |
| `AI_DEFAULT_PROFILE` | Fallback profile when a task is unmapped |
| `AI_TASK_<TASK>` | Map a task to a profile (`REPORTING`, `ANALYSIS`, `FORECAST`, `OCR`, …) |
| `AI_<PROFILE>_URL` | Full chat-completions URL for that profile |
| `AI_<PROFILE>_KEY` | API key (optional when `AUTH=none`) |
| `AI_<PROFILE>_MODEL` | Model id injected server-side |
| `AI_<PROFILE>_AUTH` | `bearer` (default), `api-key`, or `none` |
| `AI_<PROFILE>_COMPACT` | `true` = compact AI report prompts/tools for that profile |
| `AI_<PROFILE>_PROXY_URL` | Optional URL override |
| `OPENAI_*` | Legacy single-profile fallback when `AI_PROFILES` is unset |
| `AI_ENABLED` | `false` / `0` hard-blocks all AI (403). Default `true`. |
| `AI_DAILY_LIMIT` | Max chat completions per UTC day. Empty/unset = unlimited. |
| `AI_MONTHLY_LIMIT` | Max chat completions per UTC calendar month. Empty/unset = unlimited. |

### AI profiles and task routing

There is **no hardcoded vendor list**. Point each profile at any OpenAI-compatible
chat completions endpoint. Example `.env.local` (never commit this):

```bash
AI_PROFILES=cheap,strong,vision
AI_DEFAULT_PROFILE=cheap
AI_TASK_REPORTING=cheap
AI_TASK_ANALYSIS=strong
AI_TASK_FORECAST=strong
AI_TASK_OCR=vision

AI_CHEAP_URL=https://api.example.com/v1/chat/completions
AI_CHEAP_KEY=…
AI_CHEAP_MODEL=my-cheap-model
AI_CHEAP_AUTH=bearer
AI_CHEAP_COMPACT=true

AI_STRONG_URL=https://api.example.com/v1/chat/completions
AI_STRONG_KEY=…
AI_STRONG_MODEL=my-strong-model
AI_STRONG_AUTH=bearer

AI_VISION_URL=https://api.example.com/v1/chat/completions
AI_VISION_KEY=…
AI_VISION_MODEL=my-vision-model
AI_VISION_AUTH=bearer
```

When `AI_PROFILES` is unset, the server synthesizes a single `default` profile
from `OPENAI_API_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_PROXY_URL`
(Azure URLs that contain `openai.azure.com` use the `api-key` header).

You can reuse shared secrets with `${VAR}` expansion (applied after both env
files load), for example:

```bash
DEEPSEEK_API_KEY=sk-…
AI_CHEAP_KEY=${DEEPSEEK_API_KEY}
AI_CHEAP_URL=https://api.deepseek.com/chat/completions
```

Restart the API process after editing `.env.local`.

### AI usage limits (VPS / shared key)

Each successful `POST /ai/chat/completions` counts toward the daily and monthly
caps. Counters live in `api/data/ai-usage.json` on the API host (not in the
browser). Change limits or set `AI_ENABLED=false` in `.env.local` and restart
the API process.

Leave `AI_DAILY_LIMIT` / `AI_MONTHLY_LIMIT` blank on local installs where the
customer supplies their own key — quotas do not apply unless set.

## API

### `GET /health`

Returns `{ ok, service, modules }`.

### `GET /ai/usage`

Returns quota status plus **non-secret** profile routing (no keys, no URLs):

```json
{
  "enabled": true,
  "daily": { "used": 12, "limit": 100 },
  "monthly": { "used": 87, "limit": 2000 },
  "defaultProfile": "cheap",
  "tasks": {
    "reporting": "cheap",
    "analysis": "strong",
    "forecast": "strong",
    "ocr": "vision"
  },
  "profiles": {
    "cheap": { "model": "my-cheap-model", "compact": true, "auth": "bearer", "configured": true }
  }
}
```

`limit` is `null` when that cap is unset (unlimited).

### `POST /ai/chat/completions`

Proxies an OpenAI-compatible chat completion. The browser sends messages,
optional tools, and an optional `task`. The server resolves the profile for that
task and injects model, key, and URL. Checks `AI_ENABLED` and daily/monthly
limits before forwarding; increments counters only after a successful upstream
response.

Request:

```json
{
  "task": "reporting",
  "messages": [{ "role": "user", "content": "Summarize today's sales" }],
  "tools": []
}
```

`task` is optional; missing/unknown tasks use `AI_DEFAULT_PROFILE`. Message
`content` may be a string or OpenAI vision parts (`image_url`) for OCR-style
calls.

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

Auth headers follow the profile `AUTH` setting (`bearer`, `api-key`, or `none`).

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
