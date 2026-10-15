# ADR 0005: Branch-owned catalog + cross-branch employees

## Status

Accepted — 2026-09-29

## Context

Phases 1–5 deliver sales upload, catalog download, HQ publish, sparse
overrides, and filtered Sync now. Franchise still needs:

1. **Branch-owned catalog rows** — a store-specific dish/menu that is not a
   patch on the shared base.
2. **Cross-branch employees** — one user record usable at multiple stores.

## Decision

### Phase 6 — Branch-owned catalog

1. HQ toolbar with **exactly one** branch selected unlocks **Add** on shared
   catalog entities. Create stamps `branch_id = client_id`.
2. Editing a row owned by that branch uses full structural save (not
   `catalog_branch_override`).
3. Editing a **shared** row while a branch is selected still writes sparse
   overrides (Phase 4).
4. Multi-branch selection remains override-only (create locked).
5. Manage lists scope to shared ∪ selected branch-owned rows when catalog
   publish is enabled.
6. Download already applies `shared ∪ branch_id = me` and strips `branch_id`
   locally.

### Phase 7 — Cross-branch employees

1. Cloud `user.branch_ids: option<array<string>>` — empty/NONE = shared (all
   stores); otherwise Sync now only applies the user when
   `SYNC_CLIENT_ID ∈ branch_ids`.
2. HQ user form exposes a multi-select of registered `sync_branch` client ids
   when `VITE_CATALOG_PUBLISH_ENABLED`.
3. Local upsert strips `branch_ids` (and `branch_id`); wrong-branch users never
   land on the store DB, so login needs no extra filter.

## Consequences

- Shared identity + overrides and branch-owned full rows coexist.
- Migration `2026_09_29_branch_owned_catalog_and_user_branches.surql` on cloud.
- Promoting a branch-owned row to shared base remains a manual/ops task.
