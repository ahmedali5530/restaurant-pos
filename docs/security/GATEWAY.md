# Auth gateway

The POS SPA authenticates through the **gateway** (port **3142**) by default. Surreal root credentials stay on the server. Payment, print, tracking, and API sidecars verify the same session JWT.

See also: https://github.com/ahmedali5530/restaurant-pos/issues/1

## Local / default

1. Copy env templates (same local-dev secrets in each file):

   ```bash
   cp .env.example .env
   cp api/.env.example api/.env
   cp gateway/.env.example gateway/.env
   cp payments/.env.example payments/.env
   ```

2. `docker compose up -d` then `bun install` / Vite as usual.

`root`/`root` is rejected. Wipe an existing `./database` volume that was created with that pair (or change the Surreal user) so it matches `.env`.

Frontend:

- `VITE_GATEWAY_AUTH=true` (also the default if the flag is unset)
- `VITE_GATEWAY_URL=http://localhost:3142`
- `VITE_DB_WEBDOCKET=ws://localhost:3142`
- Do **not** set `VITE_DB_PASS` / root credentials in the browser bundle

Sidecars share `GATEWAY_JWT_SECRET`. `GATEWAY_AUTH_REQUIRED=true` in `api/.env.example`. When the flag is unset, auth is still required whenever a JWT secret is configured.

Compose publishes Surreal as **`127.0.0.1:8000:8000`**. Other services stay on `0.0.0.0` so LAN POS devices can reach them. Add those origins to `GATEWAY_ALLOWED_ORIGINS`.

Gateway listens on **3142** so it does not collide with `api` on **3140**.

Nginx (`nginx.conf`) proxies `/auth/` and `/rpc` to the gateway — use that for production so the SPA talks to the same origin.

## Production

1. Replace local-dev `SURREAL_USER` / `SURREAL_PASS` / `GATEWAY_JWT_SECRET` with unique values (JWT secret ≥ 32 characters). Share the JWT secret across gateway, payment, printer, tracking, and api.
2. Bind Surreal and sidecars to `127.0.0.1` on the host; expose only nginx (80/443).
3. Set CORS allow-lists to the real frontend origin — never `*` unless you intend a public API.

## Smoke test

1. Login (PIN / form) with gateway mode on
2. Floor → table → menu → cart → kitchen
3. Print / payment / tracking calls succeed with session JWT
4. Elevated PIN (void / settings)
5. Logout → must re-login; `/rpc` without token → 401
6. `curl -X POST http://SERVER/payments/create-intent -d '{}'` without `Authorization` → **401**
7. `curl -X POST http://SERVER/ai/chat/completions -d '{}'` without `Authorization` → **401**
8. Direct `:8000` from another machine → closed (loopback bind)

## Rollback

### SPA only

```bash
# In .env for build:
VITE_GATEWAY_AUTH=false
VITE_DB_USER=your-surreal-user
VITE_DB_PASS=your-surreal-pass
# Point VITE_DB_WEBDOCKET back to Surreal if nginx /rpc goes to Surreal again
```

### Sidecars (allow unauthenticated temporarily)

```bash
GATEWAY_AUTH_REQUIRED=false docker compose up -d payment printer tracking api
```

(`api` also reads `GATEWAY_AUTH_REQUIRED` from `api/.env` via `env_file`.)

### Nginx `/rpc` back to Surreal (emergency)

Point `location /rpc` at `127.0.0.1:8000` instead of gateway `3142`, reload nginx.

## Env secrets (server)

Never commit real production secrets. Shared across services:

```
GATEWAY_JWT_SECRET=<long-random-at-least-32-chars>
GATEWAY_AUTH_REQUIRED=true
```
