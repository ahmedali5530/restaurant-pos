# POSR Local-to-Cloud Sync Service

Uploads front-of-house / sales data from a branch SurrealDB to a shared cloud master for reporting and multi-branch distribution.

## How it works

1. **Allowlist** — only FOH tables (orders, payments, fiscal submissions, closings, shifts, customers, …). Menu, inventory, accounts, and settings stay local.
2. **Backfill** — on first run (or when the changefeed cursor falls outside the 14-day retention window), pages `SELECT *` and upserts every row to master.
3. **Changefeed tail** — polls `SHOW CHANGES FOR TABLE … SINCE cursor`. Advances the cursor in `sync_cloud_cursor` only after the master acknowledges each record.
4. **Retries** — transport failures and timeouts keep the cursor in place and back off per table. Other tables keep moving.
5. **branch_id** — every master row is stamped with `SYNC_CLIENT_ID` so multiple branches can share one cloud database.

LIVE SELECT is **not** used. It cannot replay missed events after downtime.

## Environment variables

Copy `.env.example` to `.env` (or `.env.local`) and update values.

`server.js` loads `.env` first, then `.env.local` with override (same pattern as `api/`).
Prefer `.env.local` for real master credentials — it is gitignored via `*.local`.

- `SYNC_CLIENT_ID` (required): branch identifier written into master records as `branch_id`.
- Source DB:
  - `SYNC_SOURCE_URL`
  - `SYNC_SOURCE_NS`
  - `SYNC_SOURCE_DB`
  - `SYNC_SOURCE_USER`
  - `SYNC_SOURCE_PASS`
- Master DB:
  - `SYNC_MASTER_URL`
  - `SYNC_MASTER_NS`
  - `SYNC_MASTER_DB`
  - `SYNC_MASTER_USER`
  - `SYNC_MASTER_PASS`
- Runtime:
  - `SYNC_SERVICE_HOST` (default `0.0.0.0`)
  - `SYNC_SERVICE_PORT` (default `3136`)
  - `SYNC_RECONNECT_MS` (default `5000`)
  - `SYNC_POLL_MS` (default `1000`)
  - `SYNC_BACKFILL_PAGE_SIZE` (default `200`)
  - `SYNC_CHANGE_LIMIT` (default `100`)
  - `SYNC_LOG_LEVEL` (default `info`)
  - `SYNC_INCLUDE_TABLES` (optional, comma-separated override of the FOH allowlist)
  - `SYNC_EXCLUDE_TABLES` (optional, comma-separated names to drop from the include list)
  - `SYNC_STATS_SECRET` (optional; when set, `/stats` requires `X-Sync-Stats-Secret`)

## Schema prerequisite

Apply `migrations/2026_09_24_foh_changefeed.surql` (registered in `run-prod-migrations.cjs`). It creates `sync_cloud_cursor` and runs `ALTER TABLE … CHANGEFEED 14d` on each FOH table so existing schemas stay intact.

## Run locally

```bash
npm install
npm start
npm test
```

## Health

- `GET /health` — boolean readiness (for Docker / load balancers)
- `GET /stats` — per-table cursor, backfill flag, last error, `lastSynced` / `syncing` record info (protect with `SYNC_STATS_SECRET` in production)

## Docker Compose

The root `docker-compose.yml` already includes a `sync` service that runs this service and wires source credentials from the compose Surreal instance. Put `SYNC_MASTER_*` in `sync-service/.env.local`.

## Out of scope (phase 2)

Cloud-to-local download of back-of-house data (menu, inventory, …) is a separate direction and allowlist. Do not add those tables to `SYNC_INCLUDE_TABLES` in this phase.
