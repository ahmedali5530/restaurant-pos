# POSR Branch Sync Service (local ↔ cloud)

Two directions, controlled by `SYNC_DISTRIBUTION_MODE`:

| Mode | Upload sales (local → cloud) | Download catalog (cloud → local) |
| --- | --- | --- |
| `off` | no | no |
| `report_only` | yes | no |
| `full` | yes | yes |

Standalone stores leave `SYNC_MASTER_URL` empty or set mode `off`. Existing phase-1 deployments with a master URL and no mode set default to **`report_only`**.

## Upload (phase 1)

1. **Allowlist** — FOH sales only (orders, payments, fiscal, closings, shifts, customers, …).
2. **Backfill** then **changefeed tail** on the branch DB; cursor in `sync_cloud_cursor`.
3. **`branch_id`** stamped from `SYNC_CLIENT_ID` on master rows.

## Download (phase 2, `full` only)

1. **Allowlist** — FOH catalog only (`menu_item`, `category`, floors, taxes, `user`, …). **Never** overlaps the upload list (startup asserts disjoint sets).
2. Scope: rows with no `branch_id` (shared) or `branch_id = SYNC_CLIENT_ID`.
3. User secrets (`password`, `pin`, …) are stripped before writing locally; existing local credentials are preserved.
4. Cursor in `sync_catalog_down_cursor`; master catalog tables get `CHANGEFEED 14d` via auto-ALTER when download starts.
5. **`catalog_release:current`** (and optional `catalog_release:<branch>`) versions appear in `/stats` as `catalog.remoteVersion` / `catalog.localVersion`.
6. **On-demand only** — catalog is **not** polled continuously. `POST /catalog/sync-now` (Settings → Sync now) runs one backfill/catch-up pass. Sales upload still polls as usual.

LIVE SELECT is **not** used.

## Environment variables

See `.env.example`. Important:

- `SYNC_DISTRIBUTION_MODE` — `off` | `report_only` | `full`
- `SYNC_CLIENT_ID` — branch id
- `SYNC_DOWNLOAD_TABLES` / `SYNC_DOWNLOAD_EXCLUDE_TABLES` — optional catalog overrides
- `SYNC_STATS_SECRET` — protects `/stats` and `/catalog/sync-now`

Frontend Settings card (Catalog sync) needs:

- `VITE_SYNC_SERVICE_URL=http://127.0.0.1:3136` (or your sync host)
- Optional `VITE_SYNC_STATS_SECRET` matching the service secret

## Schema

Branch migrations:

- `2026_09_24_foh_changefeed.surql` (+ fiscal) — upload feeds + `sync_cloud_cursor`
- `2026_09_26_catalog_down_cursor.surql` — `sync_catalog_down_cursor`

Cloud: service enables catalog changefeeds and `catalog_release` when download is on. HQ publishes by upserting `catalog_release:current` with `{ version: N, published_at: time::now() }`.

## Run

```bash
npm install
npm start
npm test
```

Smoke (throwaway master NS on local Surreal):

```bash
SYNC_FORCE_HOST_URL=1 node scripts/smoke-changefeed.cjs
SYNC_FORCE_HOST_URL=1 node scripts/smoke-catalog-download.cjs
```

## Health

- `GET /health`
- `GET /stats` — upload tables + `catalog` download block
- `POST /catalog/sync-now` — queue catalog catch-up (`full` mode)

## No infinite loops

Upload and download allowlists are disjoint. Order tables are never written by download; catalog tables are never uploaded by phase 1.
