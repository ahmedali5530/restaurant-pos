import { useAtom } from 'jotai';
import { useDB } from '@/api/db/db.ts';
import {
  loadMergedCatalogRecord,
  saveWithBranchContext,
  tableSupportsBranchOverrides,
} from '@/lib/catalog-overrides.ts';
import {
  canCreateCatalogEntity,
  isBranchOwnedBy,
  isSharedCatalogRow,
} from '@/lib/catalog-row-scope.ts';
import { hqCatalogEditBranchIdsAtom, appPage } from '@/store/jotai.ts';

const CATALOG_PUBLISH_ENABLED =
  String(import.meta.env.VITE_CATALOG_PUBLISH_ENABLED || '').toLowerCase() === 'true';

export type HqCatalogEditMode = 'base' | 'override' | 'branch-owned';

/** Banner / list-page context (create locks, multi-branch selection). */
export function useHqCatalogBranchContext() {
  const [branchIds] = useAtom(hqCatalogEditBranchIdsAtom);
  const enabled = CATALOG_PUBLISH_ENABLED;
  const isBranchEditMode = enabled && branchIds.length > 0;
  const soleBranchId = branchIds.length === 1 ? branchIds[0] : null;
  return {
    enabled,
    branchIds: isBranchEditMode ? branchIds : [],
    soleBranchId: isBranchEditMode ? soleBranchId : null,
    isBranchEditMode,
    /** Shared base create (no branch_id). */
    canCreateBaseEntities: !isBranchEditMode,
    /** Base catalog or exactly one branch (Phase 6 branch-owned create). */
    canCreateEntities: !enabled || canCreateCatalogEntity(branchIds),
  };
}

export function useHqCatalogBranchEdit(table: string) {
  const db = useDB();
  const ctx = useHqCatalogBranchContext();
  const [{ user }] = useAtom(appPage);

  const supportsOverrides = tableSupportsBranchOverrides(table);
  const isBranchEditMode = ctx.isBranchEditMode && supportsOverrides;
  const branchIds = isBranchEditMode ? ctx.branchIds : [];
  const soleBranchId = branchIds.length === 1 ? branchIds[0] : null;

  const publishedBy = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      user.login ||
      String(user.id)
    : null;

  const resolveEditMode = (record?: any): HqCatalogEditMode => {
    if (!isBranchEditMode) return 'base';
    if (soleBranchId && record && isBranchOwnedBy(record, soleBranchId)) {
      return 'branch-owned';
    }
    if (!record && soleBranchId) return 'branch-owned';
    return 'override';
  };

  const loadMerged = async (id: any) => {
    if (!id) return null;
    const branchId = soleBranchId;
    // Branch-owned rows have no override merge; still fine to call (no patch).
    return loadMergedCatalogRecord(db, {
      table,
      id,
      branchId: branchId && supportsOverrides ? branchId : null,
    });
  };

  const save = async (opts: {
    id: any;
    nextValues: Record<string, unknown>;
    previousMerged?: Record<string, unknown> | null;
    structuralWrite: () => Promise<void>;
    bumpRelease?: boolean;
    /** Existing record when editing (used to detect branch-owned). */
    existing?: any;
  }) => {
    return saveWithBranchContext(db, {
      table,
      id: opts.id,
      branchIds,
      nextValues: opts.nextValues,
      previousMerged: opts.previousMerged,
      updatedBy: publishedBy,
      bumpRelease: opts.bumpRelease,
      structuralWrite: opts.structuralWrite,
      existing: opts.existing,
    });
  };

  return {
    enabled: ctx.enabled,
    branchIds,
    branchId: soleBranchId,
    soleBranchId,
    isBranchEditMode,
    canCreateBaseEntities: ctx.canCreateBaseEntities,
    canCreateEntities: ctx.canCreateEntities || (isBranchEditMode && !!soleBranchId),
    supportsOverrides,
    resolveEditMode,
    isSharedCatalogRow,
    isBranchOwnedBy: (row: any) => isBranchOwnedBy(row, soleBranchId),
    /** Lock name/relations when editing a shared row under branch context. */
    lockStructuralFields: (record?: any) => resolveEditMode(record) === 'override',
    loadMerged,
    save,
  };
}
