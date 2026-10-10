import { describe, expect, it } from 'bun:test';
import {
  mergeCatalogBaseWithPatch,
  sanitizeCatalogPatch,
  catalogOverrideRecordKey,
  buildOverridePatchFromValues,
} from './catalog-override-fields.ts';
import { saveWithBranchContext, catalogOverrideThing } from './catalog-overrides.ts';

describe('catalog override merge (Phase 4)', () => {
  it('branch A and B can diverge on price while sharing base relations', () => {
    const base = {
      id: 'menu_item:wings',
      name: 'Wings',
      price: 10,
      categories: ['category:food'],
      items: ['menu_item_recipe:1'],
    };
    const branchA = mergeCatalogBaseWithPatch('menu_item', base, { price: 12 });
    const branchB = mergeCatalogBaseWithPatch('menu_item', base, { price: 9, cost: 3 });

    expect(branchA.price).toBe(12);
    expect(branchB.price).toBe(9);
    expect(branchA.name).toBe('Wings');
    expect(branchB.name).toBe('Wings');
    expect(branchA.categories).toEqual(base.categories);
    expect(branchB.items).toEqual(base.items);
    expect(sanitizeCatalogPatch('menu_item', { name: 'Nope', price: 1 })).toEqual({
      price: 1,
    });
  });

  it('no patch leaves base unchanged', () => {
    const base = { id: 'menu_item:1', price: 5, name: 'Soup' };
    expect(mergeCatalogBaseWithPatch('menu_item', base, null)).toEqual(base);
  });

  it('builds stable override ids', () => {
    expect(catalogOverrideRecordKey('menu_item', 'menu_item:wings', 'CLIENT')).toBe(
      'menu_item_wings_CLIENT'
    );
  });

  it('buildOverridePatchFromValues keeps only allowlisted scalars', () => {
    expect(
      buildOverridePatchFromValues(
        'menu_item',
        { price: 14, name: 'Ignore', cost: 2 },
        { price: 10, name: 'Wings' }
      )
    ).toEqual({ price: 14, cost: 2 });
  });
});

describe('saveWithBranchContext (HQ Admin forms)', () => {
  function memoryDb() {
    const store = new Map<string, any>();
    return {
      store,
      async select(id: any) {
        return store.get(String(id));
      },
      async upsert(id: any, data: any) {
        const key = String(id);
        store.set(key, { ...(store.get(key) || {}), ...data, id: key });
        return store.get(key);
      },
      async query() {
        return [[]];
      },
    };
  }

  it('base context runs structuralWrite and does not upsert override', async () => {
    const db = memoryDb();
    let structural = 0;
    const result = await saveWithBranchContext(db, {
      table: 'menu_item',
      id: 'menu_item:wings',
      branchId: null,
      nextValues: { price: 11 },
      structuralWrite: async () => {
        structural += 1;
        db.store.set('menu_item:wings', { price: 11, name: 'Wings' });
      },
    });
    expect(result.mode).toBe('base');
    expect(structural).toBe(1);
    expect(db.store.get('menu_item:wings').price).toBe(11);
    expect([...db.store.keys()].some((k) => k.includes('catalog_branch_override'))).toBe(false);
  });

  it('branch A/B write separate patches without touching base structural write', async () => {
    const db = memoryDb();
    db.store.set('menu_item:wings', { price: 10, name: 'Wings' });
    let structural = 0;
    const structuralWrite = async () => {
      structural += 1;
    };

    await saveWithBranchContext(db, {
      table: 'menu_item',
      id: 'menu_item:wings',
      branchIds: ['store-a'],
      nextValues: { price: 12 },
      structuralWrite,
      bumpRelease: false,
    });
    await saveWithBranchContext(db, {
      table: 'menu_item',
      id: 'menu_item:wings',
      branchIds: ['store-b'],
      nextValues: { price: 9 },
      structuralWrite,
      bumpRelease: false,
    });

    expect(structural).toBe(0);
    expect(db.store.get('menu_item:wings').price).toBe(10);
    const keyA = String(catalogOverrideThing('menu_item', 'menu_item:wings', 'store-a'));
    const keyB = String(catalogOverrideThing('menu_item', 'menu_item:wings', 'store-b'));
    expect(db.store.get(keyA).patch).toEqual({ price: 12 });
    expect(db.store.get(keyB).patch).toEqual({ price: 9 });

    const mergedA = mergeCatalogBaseWithPatch(
      'menu_item',
      db.store.get('menu_item:wings'),
      db.store.get(keyA).patch
    );
    const mergedB = mergeCatalogBaseWithPatch(
      'menu_item',
      db.store.get('menu_item:wings'),
      db.store.get(keyB).patch
    );
    expect(mergedA.price).toBe(12);
    expect(mergedB.price).toBe(9);
    expect(mergedA.name).toBe('Wings');
  });

  it('applies the same patch to multiple branches in one save', async () => {
    const db = memoryDb();
    db.store.set('menu_item:wings', { price: 10, name: 'Wings' });
    const result = await saveWithBranchContext(db, {
      table: 'menu_item',
      id: 'menu_item:wings',
      branchIds: ['store-a', 'store-b'],
      nextValues: { price: 15 },
      structuralWrite: async () => {
        throw new Error('should not run');
      },
      bumpRelease: false,
    });
    expect(result.mode).toBe('branch');
    expect(result.branchIds).toEqual(['store-a', 'store-b']);
    const keyA = String(catalogOverrideThing('menu_item', 'menu_item:wings', 'store-a'));
    const keyB = String(catalogOverrideThing('menu_item', 'menu_item:wings', 'store-b'));
    expect(db.store.get(keyA).patch).toEqual({ price: 15 });
    expect(db.store.get(keyB).patch).toEqual({ price: 15 });
    expect(db.store.get('menu_item:wings').price).toBe(10);
  });

  it('single-branch create runs structuralWrite as branch-owned', async () => {
    const db = memoryDb();
    let wrote = false;
    const result = await saveWithBranchContext(db, {
      table: 'menu_item',
      id: null,
      branchIds: ['store-a'],
      nextValues: { price: 8 },
      structuralWrite: async () => {
        wrote = true;
        db.store.set('menu_item:local', { price: 8, branch_id: 'store-a' });
      },
      bumpRelease: false,
    });
    expect(result.mode).toBe('branch-owned');
    expect(wrote).toBe(true);
    expect(db.store.get('menu_item:local').branch_id).toBe('store-a');
  });

  it('edits branch-owned rows structurally instead of override', async () => {
    const db = memoryDb();
    db.store.set('menu_item:local', { price: 8, name: 'Local', branch_id: 'store-a' });
    let structural = 0;
    const result = await saveWithBranchContext(db, {
      table: 'menu_item',
      id: 'menu_item:local',
      branchIds: ['store-a'],
      nextValues: { price: 9 },
      existing: db.store.get('menu_item:local'),
      structuralWrite: async () => {
        structural += 1;
        db.store.set('menu_item:local', { price: 9, name: 'Local', branch_id: 'store-a' });
      },
      bumpRelease: false,
    });
    expect(result.mode).toBe('branch-owned');
    expect(structural).toBe(1);
    expect([...db.store.keys()].some((k) => k.includes('catalog_branch_override'))).toBe(false);
  });
});
