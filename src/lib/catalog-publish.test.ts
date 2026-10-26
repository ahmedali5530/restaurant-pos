import { describe, expect, it } from 'bun:test';
import { RecordId } from 'surrealdb';
import {
  sanitizeBranchReleaseKey,
  resolveCatalogSyncTables,
} from './catalog-sync-tables.ts';
import {
  catalogReleaseThing,
  publishCatalogRelease,
  syncBranchThing,
} from './catalog-publish.ts';

/** Normalize RecordId string forms so `table:⟨key⟩` and `table:key` share a slot. */
function memoryKey(id: unknown): string {
  const raw = String(id ?? '');
  const idx = raw.indexOf(':');
  if (idx < 0) return raw;
  const tb = raw.slice(0, idx);
  let key = raw.slice(idx + 1);
  if (key.startsWith('⟨') && key.endsWith('⟩')) {
    key = key.slice(1, -1);
  }
  return `${tb}:${key}`;
}

function createMemoryDb(seed: Record<string, any> = {}) {
  const store = new Map<string, any>(
    Object.entries(seed).map(([k, v]) => [memoryKey(k), v])
  );
  return {
    store,
    async select(id: any) {
      const key = memoryKey(id);
      return store.get(key);
    },
    async upsert(id: any, data: any) {
      const key = memoryKey(id);
      store.set(key, { ...(store.get(key) || {}), ...data, id: key });
      return store.get(key);
    },
    async query() {
      return [[]];
    },
  };
}

describe('publishCatalogRelease', () => {
  it('bumps catalog_release:current for audience all', async () => {
    const db = createMemoryDb({
      'catalog_release:current': { version: 10 },
    });
    const result = await publishCatalogRelease(db, {
      audience: 'all',
      branchIds: [],
      tables: ['menu_item', 'category'],
      note: 'spring',
    });
    expect(result.targets).toEqual(['current']);
    expect(result.version).toBeGreaterThan(10);
    const row = db.store.get('catalog_release:current');
    expect(row.version).toBe(result.version);
    expect(row.tables).toEqual(['menu_item', 'category']);
    expect(row.audience).toBe('all');
    expect(row.note).toBe('spring');
  });

  it('writes only selected branch keys and leaves current alone', async () => {
    const db = createMemoryDb({
      'catalog_release:current': { version: 5 },
      'catalog_release:store-a': { version: 3 },
    });
    const result = await publishCatalogRelease(db, {
      audience: 'branches',
      branchIds: ['store-a'],
      tables: ['tax'],
    });
    expect(result.targets).toEqual([sanitizeBranchReleaseKey('store-a')]);
    expect(db.store.get('catalog_release:current').version).toBe(5);
    const branch = db.store.get('catalog_release:store-a');
    expect(branch.version).toBe(result.version);
    expect(branch.audience).toBe('branches');
    expect(branch.branch_ids).toEqual(['store-a']);
  });

  it('requires tables and selected branches', async () => {
    const db = createMemoryDb();
    await expect(
      publishCatalogRelease(db, { audience: 'all', branchIds: [], tables: [] })
    ).rejects.toThrow(/table/i);
    await expect(
      publishCatalogRelease(db, {
        audience: 'branches',
        branchIds: [],
        tables: ['menu_item'],
      })
    ).rejects.toThrow(/branch/i);
  });
});

describe('sanitizeBranchReleaseKey', () => {
  it('matches sync-service style sanitization', () => {
    expect(sanitizeBranchReleaseKey('store-north')).toBe('store-north');
    expect(sanitizeBranchReleaseKey('store north!')).toBe('store_north_');
  });
});

describe('syncBranchThing / catalogReleaseThing', () => {
  it('uses RecordId so hyphenated keys are not parsed as subtraction', () => {
    const branch = syncBranchThing('branch-02');
    expect(branch).toBeInstanceOf(RecordId);
    expect(String(branch)).toBe('sync_branch:⟨branch-02⟩');
    expect(branch.id).toBe('branch-02');

    const release = catalogReleaseThing('CLIENT-001');
    expect(release).toBeInstanceOf(RecordId);
    expect(String(release)).toBe('catalog_release:⟨CLIENT-001⟩');
    expect(release.id).toBe('CLIENT-001');
  });
});

describe('resolveCatalogSyncTables', () => {
  const allowlist = ['menu_item', 'category', 'tax'];

  it('filters Sync now to release tables', () => {
    expect(
      resolveCatalogSyncTables({
        allowlist,
        localVersion: 1,
        globalRelease: { version: 2, tables: ['menu_item', 'bogus'] },
      })
    ).toEqual(['menu_item']);
  });

  it('falls back to full allowlist when tables omitted', () => {
    expect(
      resolveCatalogSyncTables({
        allowlist,
        localVersion: 0,
        globalRelease: { version: 1 },
      })
    ).toEqual(allowlist);
  });
});
