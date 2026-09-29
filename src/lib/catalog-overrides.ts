import { toRecordId } from '@/lib/utils.ts';
import {
  buildOverridePatchFromValues,
  catalogOverrideRecordKey,
  mergeCatalogBaseWithPatch,
  sanitizeCatalogPatch,
  tableSupportsBranchOverrides,
} from '@/lib/catalog-override-fields.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';
import { publishCatalogRelease } from '@/lib/catalog-publish.ts';

export type CatalogBranchOverride = {
  id: string;
  table: string;
  base_id: string;
  branch_id: string;
  patch: Record<string, unknown>;
  updated_at?: string;
  updated_by?: string | null;
};

type DbLike = {
  query: (sql: string, vars?: any) => Promise<any>;
  select: (id: any) => Promise<any>;
  upsert: (id: any, data: any) => Promise<any>;
};

function asRows<T>(result: unknown): T[] {
  const first = Array.isArray(result) ? result[0] : result;
  if (Array.isArray(first)) return first as T[];
  return [];
}

function recordKey(id: unknown): string {
  if (id == null) return '';
  return String(id);
}

export function catalogOverrideThing(
  table: string,
  baseId: string,
  branchId: string,
): any {
  return toRecordId(
    `catalog_branch_override:${catalogOverrideRecordKey(table, baseId, branchId)}`
  );
}

export async function listCatalogOverrides(
  db: DbLike,
  opts?: { branchId?: string; table?: string },
): Promise<CatalogBranchOverride[]> {
  const conditions: string[] = [];
  const vars: Record<string, unknown> = {};
  if (opts?.branchId) {
    conditions.push('branch_id = $branchId');
    vars.branchId = opts.branchId;
  }
  if (opts?.table) {
    conditions.push('table = $table');
    vars.table = opts.table;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = asRows<any>(
    await db.query(
      `SELECT * FROM catalog_branch_override ${where} ORDER BY updated_at DESC LIMIT 200`,
      vars
    )
  );
  return rows.map((row) => ({
    id: recordKey(row.id),
    table: String(row.table || ''),
    base_id: String(row.base_id || ''),
    branch_id: String(row.branch_id || ''),
    patch: row.patch && typeof row.patch === 'object' ? { ...row.patch } : {},
    updated_at: row.updated_at,
    updated_by: row.updated_by ?? null,
  }));
}

export async function getCatalogOverride(
  db: DbLike,
  input: { table: string; baseId: string; branchId: string },
): Promise<CatalogBranchOverride | null> {
  try {
    const row = await db.select(
      catalogOverrideThing(input.table, input.baseId, input.branchId)
    );
    if (!row) return null;
    return {
      id: recordKey(row.id),
      table: String(row.table || input.table),
      base_id: String(row.base_id || input.baseId),
      branch_id: String(row.branch_id || input.branchId),
      patch: row.patch && typeof row.patch === 'object' ? { ...row.patch } : {},
      updated_at: row.updated_at,
      updated_by: row.updated_by ?? null,
    };
  } catch {
    return null;
  }
}

export async function loadMergedCatalogRecord(
  db: DbLike,
  input: { table: string; id: any; branchId: string | null },
): Promise<Record<string, unknown> | null> {
  const thing = typeof input.id === 'string' ? toRecordId(input.id) : input.id;
  let base: any;
  try {
    base = await db.select(thing);
  } catch {
    return null;
  }
  if (!base) return null;
  if (!input.branchId || !tableSupportsBranchOverrides(input.table)) {
    return { ...base };
  }
  const override = await getCatalogOverride(db, {
    table: input.table,
    baseId: recordKey(base.id ?? input.id),
    branchId: input.branchId,
  });
  return mergeCatalogBaseWithPatch(input.table, base, override?.patch);
}

export async function upsertCatalogOverride(
  db: DbLike,
  input: {
    table: string;
    baseId: string;
    branchId: string;
    patch: Record<string, unknown>;
    updatedBy?: string | null;
    bumpRelease?: boolean;
  },
): Promise<{ id: string; patch: Record<string, unknown> }> {
  const table = String(input.table || '').trim();
  const baseId = String(input.baseId || '').trim();
  const branchId = String(input.branchId || '').trim();
  if (!table || !baseId || !branchId) {
    throw new Error('table, baseId, and branchId are required');
  }

  const patch = sanitizeCatalogPatch(table, input.patch);
  const thing = catalogOverrideThing(table, baseId, branchId);

  if (Object.keys(patch).length === 0) {
    try {
      await db.query('DELETE $id', { id: thing });
    } catch {
      // missing is fine
    }
    if (input.bumpRelease) {
      await publishCatalogRelease(db, {
        audience: 'branches',
        branchIds: [branchId],
        tables: [table],
        note: `Cleared ${table} override`,
        publishedBy: input.updatedBy,
      });
    }
    return { id: recordKey(thing), patch: {} };
  }

  await db.upsert(thing, {
    table,
    base_id: baseId,
    branch_id: branchId,
    patch,
    updated_at: nowSurrealDateTime(),
    ...(input.updatedBy ? { updated_by: input.updatedBy } : {}),
  });

  if (input.bumpRelease) {
    await publishCatalogRelease(db, {
      audience: 'branches',
      branchIds: [branchId],
      tables: [table],
      note: `Override ${table}`,
      publishedBy: input.updatedBy,
    });
  }

  return { id: recordKey(thing), patch };
}

/**
 * Branch mode: write sparse override(s) and skip structuralWrite.
 * Base mode: run structuralWrite (normal create/merge).
 * Supports one or many branchIds so HQ can apply the same patch to several stores.
 */
export async function saveWithBranchContext(
  db: DbLike,
  input: {
    table: string;
    id: any;
    /** Prefer branchIds; branchId kept for callers that still pass a single id. */
    branchIds?: string[] | null;
    branchId?: string | null;
    nextValues: Record<string, unknown>;
    previousMerged?: Record<string, unknown> | null;
    updatedBy?: string | null;
    bumpRelease?: boolean;
    structuralWrite: () => Promise<void>;
  },
): Promise<{ mode: 'base' | 'branch'; patch?: Record<string, unknown>; branchIds?: string[] }> {
  const branchIds = Array.from(
    new Set(
      (input.branchIds?.length
        ? input.branchIds
        : input.branchId
          ? [input.branchId]
          : []
      )
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );

  if (!branchIds.length || !tableSupportsBranchOverrides(input.table)) {
    await input.structuralWrite();
    return { mode: 'base' };
  }
  if (!input.id) {
    throw new Error('Create is not supported in branch edit mode — switch to Base catalog');
  }
  const baseId = recordKey(input.id);
  const patch = buildOverridePatchFromValues(
    input.table,
    input.nextValues,
    input.previousMerged
  );

  const bumpRelease = input.bumpRelease !== false;
  let lastPatch: Record<string, unknown> = patch;

  for (const branchId of branchIds) {
    const result = await upsertCatalogOverride(db, {
      table: input.table,
      baseId,
      branchId,
      patch,
      updatedBy: input.updatedBy,
      // One release bump for all branches below
      bumpRelease: false,
    });
    lastPatch = result.patch;
  }

  if (bumpRelease) {
    const clearing = Object.keys(patch).length === 0;
    await publishCatalogRelease(db, {
      audience: 'branches',
      branchIds,
      tables: [input.table],
      note: clearing
        ? `Cleared ${input.table} override`
        : `Override ${input.table}`,
      publishedBy: input.updatedBy,
    });
  }

  return { mode: 'branch', patch: lastPatch, branchIds };
}

export {
  mergeCatalogBaseWithPatch,
  sanitizeCatalogPatch,
  tableSupportsBranchOverrides,
};
