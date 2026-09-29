/**
 * Shared vs branch-owned catalog row helpers (Phase 6).
 * Align with sync-service shouldApplyCatalogRow for single branch_id.
 */

export function catalogRowBranchId(row: any): string | null {
  if (!row || typeof row !== 'object') return null;
  const raw = row.branch_id;
  if (raw == null || raw === '') return null;
  return String(raw);
}

/** Shared identity — eligible for sparse catalog_branch_override. */
export function isSharedCatalogRow(row: any): boolean {
  return catalogRowBranchId(row) == null;
}

/** Full row owned by one branch (not overridden; structural edit in that branch context). */
export function isBranchOwnedBy(row: any, branchId: string | null | undefined): boolean {
  if (!branchId) return false;
  const owned = catalogRowBranchId(row);
  return owned != null && owned === String(branchId);
}

/**
 * Surreal WHERE fragment + params for HQ Manage lists.
 * - Base (no branches): shared rows only
 * - One or more branches: shared ∪ those branch-owned rows
 */
export function hqCatalogVisibilityClause(branchIds: string[]): {
  filter: string;
  params: Record<string, unknown>;
} {
  const ids = Array.from(
    new Set((branchIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (!ids.length) {
    return {
      filter:
        '(branch_id = NONE OR branch_id = NULL OR branch_id = "" OR type::is::none(branch_id))',
      params: {},
    };
  }
  return {
    filter:
      '(branch_id = NONE OR branch_id = NULL OR branch_id = "" OR type::is::none(branch_id) OR branch_id IN $hqBranchIds)',
    params: { hqBranchIds: ids },
  };
}

/** True when HQ may create a new row (Base catalog or exactly one branch). */
export function canCreateCatalogEntity(branchIds: string[]): boolean {
  return !branchIds.length || branchIds.length === 1;
}
