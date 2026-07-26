# POSR Live Sync Service

This service listens to live changes from a source SurrealDB instance and mirrors those changes to a master SurrealDB instance for reporting.

## What it does

- Connects to source and master SurrealDB instances using environment variables.
- Discovers all source tables via `INFO FOR DB`.
- Subscribes to live events for every discovered table.
- Mirrors `CREATE` and `UPDATE` to master with the same record id and injected `client_id`.
- When a parent row has `array<record<...>>` fields (e.g. `order.items`), also upserts those linked child rows so burst creates that drop LIVE sibling events do not leave broken links on master.
- Mirrors `DELETE` to master by deleting the same record id.
- Exposes health endpoints:
  - `GET /health`
  - `GET /stats`

## Environment variables

Copy `.env.example` to `.env` (or `.env.local`) and update values.

`server.js` loads `.env` first, then `.env.local` with override (same pattern as `api/`).
Prefer `.env.local` for real master credentials — it is gitignored via `*.local`.

- `SYNC_CLIENT_ID` (required): tenant identifier written into master records.
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
  - `SYNC_LOG_LEVEL` (default `info`)
  - `SYNC_EXCLUDE_TABLES` (optional, comma-separated)

## Run locally

```bash
npm install
npm start
```

## Docker Compose

The root `docker-compose.yml` already includes a `sync` service that runs this service and wires all sync env variables.
