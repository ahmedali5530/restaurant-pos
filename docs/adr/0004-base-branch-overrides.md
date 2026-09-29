# ADR 0004: Base catalog + branch overrides (merge on download)

## Status

Accepted — 2026-09-28 (UX: Admin branch context — 2026-09-28)

## Context

Phase 2 downloads a shared cloud catalog to each branch. Phase 3 nudges
branches via `catalog_release`. Franchise stores still need **same dish id**
with different price/cost/workflow per branch, without cloning modifiers or
recipes.

## Decision

1. **Base rows** stay the shared identity on cloud (`menu_item:…`, relations,
   recipes on the base only).
2. **Sparse overrides** live in cloud `catalog_branch_override`
   (`table`, `base_id`, `branch_id`, `patch`) with an allowlisted field set
   (`OVERRIDEABLE_FIELDS`). Unknown keys are stripped.
3. **Download merge** in sync-service `CatalogDownloadManager`: load patches
   for `SYNC_CLIENT_ID`, merge `base ∪ sanitize(patch)` before local upsert.
   Local Surreal keeps the flat existing schema (no override table locally).
4. **Control poll** of `catalog_branch_override` refreshes the patch cache and
   re-applies affected bases so override-only publishes land on Sync now.
5. **HQ UX** uses Manage **Editing for** in the bottom app toolbar
   (Base catalog | one or more branches; instructions via info popover) when
   `VITE_CATALOG_PUBLISH_ENABLED` (`hqCatalogEditBranchIdsAtom`). Existing
   Manage forms load `merge(base, patch)` for a single selected branch
   (or base values when multiple branches are selected) and, in branch context,
   save only allowlisted fields to `catalog_branch_override` for **each**
   selected branch. Structural fields stay read-only in branch mode. Create and
   list **Add** buttons are base-only. Catalog publish keeps Branches + Publish
   release + history (no dish-only overrides panel).

## Consequences

- Modifiers / recipes / categories are not duplicated per branch.
- Branch-owned layouts (floors, printers) continue to use full `branch_id` rows.
- Cross-branch employees and branch-owned catalog create/edit remain later work.
- Filtered Sync-by-`tables[]` is Phase 5 (see publish ADR).
- Cloud must apply `migrations/2026_09_28_catalog_branch_override.surql`.
