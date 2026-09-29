# ADR 0003: Cloud-to-local FOH catalog download (distribution mode)

## Status

Accepted — 2026-09-26

## Context

[ADR 0002](0002-local-to-cloud-changefeed.md) uploads branch **sales** to a shared
cloud master. Multi-branch / franchise stores also need **catalog** data
(menu, floors, taxes, …) pushed from HQ without:

1. Overpowering standalone single-store installs.
2. Downloading order tables (which would re-enter the upload changefeed and loop).
3. Shipping franchise override engines or cross-branch employees yet.

## Decision

1. **`SYNC_DISTRIBUTION_MODE`**: `off` | `report_only` | `full`.
   - No master URL → effective `off`.
   - Master URL set, mode unset → `report_only` (keeps phase-1 uploads).
   - `full` enables catalog download.
2. **Disjoint allowlists** — upload = sales; download = FOH catalog only.
   Startup fails if they overlap.
3. **Same `sync-service` process** — `CatalogDownloadManager` applies master
   catalog on **demand** (`POST /catalog/sync-now` / Settings Sync now), not on
   the continuous upload poll. Cursor table: `sync_catalog_down_cursor`.
4. **Scope** — apply rows with no `branch_id` (shared) or
   `branch_id = SYNC_CLIENT_ID`.
5. **Secrets** — strip `password` / `pin` / `password_hash` on `user` applies;
   preserve existing local credentials.
6. **Nudge** — `catalog_release` versions in `/stats`; Settings “Catalog sync”
   + `POST /catalog/sync-now` when the frontend has `VITE_SYNC_SERVICE_URL`
   and the service reports `full`.

## Consequences

- Standalone: leave master unset or mode `off` — no catalog UI, no download.
- Linked reporting-only: `report_only` — sales upload only.
- Full distribution: HQ edits cloud catalog (shared and/or per-branch rows),
  bumps `catalog_release`, branches pull.
- Terminal Dexie still refreshes via existing PosStore snapshot/sync after
  local Surreal catalog changes (operators may use Cache reload).
- Base+override prices: [ADR 0004](0004-base-branch-overrides.md).
- Sync now may limit tables to `catalog_release.tables[]` ∩ download allowlist
  ([ADR 0003 publish](0003-hq-catalog-publish.md) Phase 5).
- Later: cross-branch employees; branch-owned catalog create/edit (Phase 6+).

## References

- `sync-service/src/config.js`, `catalog-download.js`, `sync-manager.js`
- `migrations/2026_09_26_catalog_down_cursor.surql`
- `src/components/user_settings/catalog_sync.tsx`
