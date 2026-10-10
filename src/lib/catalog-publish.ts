import { RecordId } from 'surrealdb';
import { sanitizeBranchReleaseKey } from '@/lib/catalog-sync-tables.ts';
import { nowSurrealDateTime, toSurrealDateTime } from '@/lib/datetime.ts';

export type SyncBranch = {
  id: string;
  client_id: string;
  name: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CatalogRelease = {
  id: string;
  version?: number;
  note?: string | null;
  published_at?: string | null;
  published_by?: string | null;
  tables?: string[] | null;
  audience?: 'all' | 'branches' | string | null;
  branch_ids?: string[] | null;
};

export type PublishAudience = 'all' | 'branches';

export type PublishCatalogInput = {
  audience: PublishAudience;
  branchIds: string[];
  tables: string[];
  note?: string;
  publishedBy?: string | null;
};

type DbLike = {
  query: (sql: string, vars?: any) => Promise<any>;
  select: (id: any) => Promise<any>;
  upsert: (id: any, data: any) => Promise<any>;
};

function recordKey(id: unknown): string {
  if (id == null) return '';
  return String(id);
}

function asRows<T>(result: unknown): T[] {
  const first = Array.isArray(result) ? result[0] : result;
  if (Array.isArray(first)) return first as T[];
  return [];
}

/**
 * Prefer RecordId(table, key) over StringRecordId("table:key").
 * Hyphenated keys like `branch-02` / `CLIENT-001` are parsed as subtraction
 * when passed as `table:branch-02`, collapsing every id to `sync_branch:branch`
 * and overwriting prior rows. RecordId emits `table:⟨branch-02⟩`.
 */
export function catalogReleaseThing(key: string): RecordId {
  return new RecordId('catalog_release', String(key || '').trim());
}

export function syncBranchThing(clientId: string): RecordId {
  return new RecordId('sync_branch', sanitizeBranchReleaseKey(clientId));
}

function recordIdKey(id: unknown): string {
  if (id == null) return '';
  if (typeof id === 'object' && id !== null && 'id' in (id as any)) {
    return String((id as {id: unknown}).id ?? '');
  }
  const raw = String(id);
  const idx = raw.indexOf(':');
  if (idx < 0) return raw;
  let key = raw.slice(idx + 1);
  if (key.startsWith('⟨') && key.endsWith('⟩')) {
    key = key.slice(1, -1);
  }
  return key;
}

/**
 * Rewrite truncated sync_branch ids created via StringRecordId("table:id-with-hyphen").
 * Safe to call repeatedly — no-ops when the record id already matches client_id.
 */
export async function repairTruncatedSyncBranchIds(db: DbLike): Promise<number> {
  const rows = asRows<any>(await db.query(`SELECT * FROM sync_branch`));
  let repaired = 0;
  for (const row of rows) {
    const clientId = String(row.client_id || '').trim();
    if (!clientId) continue;
    const expectedKey = sanitizeBranchReleaseKey(clientId);
    const actualKey = recordIdKey(row.id);
    if (!expectedKey || actualKey === expectedKey) continue;

    const thing = syncBranchThing(clientId);
    await db.upsert(thing, {
      client_id: clientId,
      name: String(row.name || clientId),
      active: row.active !== false,
      created_at: row.created_at
        ? toSurrealDateTime(row.created_at)
        : nowSurrealDateTime(),
      updated_at: nowSurrealDateTime(),
    });
    try {
      // Delete the truncated leftover (e.g. sync_branch:branch).
      await db.query(`DELETE $old`, {old: row.id});
    } catch {
      // Best-effort; duplicate client_id unique index may already block the old row.
    }
    repaired += 1;
  }
  return repaired;
}

export async function listSyncBranches(db: DbLike): Promise<SyncBranch[]> {
  try {
    await repairTruncatedSyncBranchIds(db);
  } catch {
    // Listing must still work if repair cannot run (permissions / older schema).
  }
  const rows = asRows<any>(
    await db.query(`SELECT * FROM sync_branch ORDER BY name ASC`)
  );
  return rows.map((row) => ({
    ...row,
    id: recordKey(row.id),
    client_id: String(row.client_id || ''),
    name: String(row.name || row.client_id || ''),
    active: row.active !== false,
  }));
}

export async function listRecentCatalogReleases(
  db: DbLike,
  limit = 12,
): Promise<CatalogRelease[]> {
  const rows = asRows<any>(
    await db.query(
      `SELECT * FROM catalog_release ORDER BY published_at DESC, version DESC LIMIT $limit`,
      { limit }
    )
  );
  return rows.map((row) => ({
    ...row,
    id: recordKey(row.id),
    version: Number(row.version) || 0,
  }));
}

export async function upsertSyncBranch(
  db: DbLike,
  input: { client_id: string; name: string; active?: boolean },
): Promise<void> {
  const clientId = String(input.client_id || '').trim();
  if (!clientId) throw new Error('client_id is required');
  const name = String(input.name || '').trim() || clientId;
  const thing = syncBranchThing(clientId);
  let created_at = nowSurrealDateTime();
  try {
    const existing = await db.select(thing);
    if (existing?.created_at) {
      created_at = toSurrealDateTime(existing.created_at);
    }
  } catch {
    // new record
  }

  await db.upsert(thing, {
    client_id: clientId,
    name,
    active: input.active !== false,
    created_at,
    updated_at: nowSurrealDateTime(),
  });
}

/**
 * Bump catalog_release:current and/or per-branch records so Sync now shows an update.
 */
export async function publishCatalogRelease(
  db: DbLike,
  input: PublishCatalogInput,
): Promise<{ version: number; targets: string[] }> {
  if (!input.tables.length) {
    throw new Error('Select at least one catalog table');
  }
  if (input.audience === 'branches' && !input.branchIds.length) {
    throw new Error('Select at least one branch');
  }

  const targetKeys: string[] = [];
  if (input.audience === 'all') {
    targetKeys.push('current');
  } else {
    for (const branchId of input.branchIds) {
      const key = sanitizeBranchReleaseKey(branchId);
      if (key && !targetKeys.includes(key)) targetKeys.push(key);
    }
  }
  if (!targetKeys.length) {
    throw new Error('No publish targets');
  }

  let maxVersion = 0;
  const keysToCheck = new Set(targetKeys);
  keysToCheck.add('current');
  for (const key of keysToCheck) {
    try {
      const existing = await db.select(catalogReleaseThing(key));
      const v = Number(existing?.version);
      if (Number.isFinite(v) && v > maxVersion) maxVersion = v;
    } catch {
      // missing is fine
    }
  }

  const version = Math.max(maxVersion + 1, Math.floor(Date.now() / 1000));
  // Surreal option<T> accepts NONE, not JS null (NULL). Omit optional empties.
  const payload: Record<string, unknown> = {
    version,
    published_at: nowSurrealDateTime(),
    tables: [...input.tables],
    audience: input.audience,
  };
  const note = input.note?.trim();
  if (note) payload.note = note;
  if (input.publishedBy) payload.published_by = input.publishedBy;
  if (input.audience === 'branches') {
    payload.branch_ids = [...input.branchIds];
  }

  for (const key of targetKeys) {
    await db.upsert(catalogReleaseThing(key), payload);
  }

  return { version, targets: targetKeys };
}
