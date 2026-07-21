# Auth gateway — smoke test & rollback

See also issue discussion: https://github.com/ahmedali5530/restaurant-pos/issues/1

## Enable (production)

1. Set a long random `GATEWAY_JWT_SECRET` shared by `gateway`, `payment`, `printer`, `tracking`, and `api`.
2. Set `GATEWAY_AUTH_REQUIRED=true` on those sidecars.
3. Frontend:
   - `VITE_GATEWAY_AUTH=true`
   - `VITE_GATEWAY_URL` / `VITE_DB_WEBDOCKET` pointing at the gateway (or nginx `/auth` + `/rpc`)
   - Do **not** ship `VITE_DB_PASS` / root credentials in the browser bundle.
4. Bind Surreal and sidecars to `127.0.0.1`; expose only nginx (80/443).

Gateway listens on **3142** by default so it does not collide with the existing `api` service on **3140**.

## Smoke test

1. Login (PIN / form) with `VITE_GATEWAY_AUTH=true`
2. Floor → table → menu → cart → kitchen
3. Print / payment / tracking calls succeed with session JWT
4. Elevated PIN (void / settings)
5. Logout → must re-login; `/rpc` without token → 401
6. `curl -X POST http://SERVER/payments/create-intent -d '{}'` without `Authorization` → **401**
7. `curl -X POST http://SERVER/ai/chat/completions -d '{}'` without `Authorization` → **401**
8. Direct `:8000` / `:313x` / `:3140` / `:3142` from the internet → closed

## Rollback

### SPA only

```bash
# In .env for build:
VITE_GATEWAY_AUTH=false
VITE_DB_USER=root
VITE_DB_PASS=your-surreal-pass
# Point VITE_DB_WEBDOCKET back to Surreal if nginx /rpc goes to Surreal again
```

### Sidecars (allow unauthenticated temporarily)

```bash
GATEWAY_AUTH_REQUIRED=false docker compose up -d payment printer tracking api
```

### Nginx `/rpc` back to Surreal (emergency)

Point `location /rpc` at `127.0.0.1:8000` instead of gateway `3142`, reload nginx.

## Env secrets (server)

Never commit real secrets. Shared across services:

```
GATEWAY_JWT_SECRET=<long-random>
GATEWAY_AUTH_REQUIRED=true
```
