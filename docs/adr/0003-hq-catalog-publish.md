# ADR 0003: HQ catalog publish (release nudges)

## Status

Accepted — 2026-09-27

## Context

Multi-branch stores pull FOH catalog from cloud via sync-service (Phase 2
download allowlist + `catalog_release` version check). HQ needs a way to
**signal** that a new catalog is ready without pushing rows from the Admin UI.

Operators also need a registry of branch `SYNC_CLIENT_ID` values so releases
can target **all branches** (`catalog_release:current`) or **one or more
branches** (`catalog_release:<sanitized_client_id>`).

## Decision

1. **Admin tab** `catalog_publish` (module `admin.catalog_publish`), shown only
   when `VITE_CATALOG_PUBLISH_ENABLED=true` (HQ / cloud POS). Branch installs
   leave the env unset so the tab is absent.
2. **`sync_branch`** cloud table: `client_id`, `name`, `active` — maintained on
   the Publish screen (no auto-discovery).
3. **Publish** upserts `catalog_release` with monotonic `version`, optional
   `note`, `tables[]` (tables Sync now will pull when non-empty; empty/omitted
   → full download allowlist), `audience`, `branch_ids`, `published_at`,
   `published_by`.
4. Migration `2026_09_27_hq_catalog_publish.surql` runs on the **cloud / HQ**
   Surreal master (not required on every branch terminal for Sync now).

## Consequences

- Branches keep using Settings → Sync now; they take `max(global, mine)`.
- Sync now intersects `tables[]` from tip releases newer than the branch’s
  applied version with the Phase 2 download allowlist (Phase 5).
- Manual Surreal upsert of `catalog_release` remains valid for ops without UI.
- Per-branch field overrides (base + sparse patch, merge on download) are
  described in [ADR 0004](0004-base-branch-overrides.md).
