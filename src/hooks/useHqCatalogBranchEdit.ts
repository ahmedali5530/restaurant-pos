import { useAtom } from 'jotai';
import { useDB } from '@/api/db/db.ts';
import {
  loadMergedCatalogRecord,
  saveWithBranchContext,
  tableSupportsBranchOverrides,
} from '@/lib/catalog-overrides.ts';
import { hqCatalogEditBranchIdsAtom, appPage } from '@/store/jotai.ts';

const CATALOG_PUBLISH_ENABLED =
  String(import.meta.env.VITE_CATALOG_PUBLISH_ENABLED || '').toLowerCase() === 'true';

/** Banner / list-page context (create locks, multi-branch selection). */
export function useHqCatalogBranchContext() {
  const [branchIds] = useAtom(hqCatalogEditBranchIdsAtom);
  const enabled = CATALOG_PUBLISH_ENABLED;
  const isBranchEditMode = enabled && branchIds.length > 0;
  return {
    enabled,
    branchIds: isBranchEditMode ? branchIds : [],
    isBranchEditMode,
    /** New shared-identity rows must be created on the base catalog. */
    canCreateBaseEntities: !isBranchEditMode,
  };
}

export function useHqCatalogBranchEdit(table: string) {
  const db = useDB();
  const ctx = useHqCatalogBranchContext();
  const [{ user }] = useAtom(appPage);

  const supportsOverrides = tableSupportsBranchOverrides(table);
  const isBranchEditMode = ctx.isBranchEditMode && supportsOverrides;
  const branchIds = isBranchEditMode ? ctx.branchIds : [];

  const publishedBy = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      user.login ||
      String(user.id)
    : null;

  const loadMerged = async (id: any) => {
    if (!id) return null;
    // Single branch: show that branch's merged values.
    // Multi-branch: show base (values entered will be applied to every selected branch).
    const branchId = branchIds.length === 1 ? branchIds[0] : null;
    return loadMergedCatalogRecord(db, {
      table,
      id,
      branchId,
    });
  };

  const save = async (opts: {
    id: any;
    nextValues: Record<string, unknown>;
    previousMerged?: Record<string, unknown> | null;
    structuralWrite: () => Promise<void>;
    bumpRelease?: boolean;
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
    });
  };

  return {
    enabled: ctx.enabled,
    branchIds,
    branchId: branchIds[0] ?? null,
    isBranchEditMode,
    canCreateBaseEntities: ctx.canCreateBaseEntities,
    supportsOverrides,
    loadMerged,
    save,
  };
}
