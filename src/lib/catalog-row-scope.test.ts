import { describe, expect, it } from 'bun:test';
import {
  canCreateCatalogEntity,
  catalogRowBranchId,
  hqCatalogVisibilityClause,
  isBranchOwnedBy,
  isSharedCatalogRow,
} from './catalog-row-scope.ts';

describe('catalog-row-scope', () => {
  it('detects shared vs branch-owned', () => {
    expect(isSharedCatalogRow({ name: 'A' })).toBe(true);
    expect(isSharedCatalogRow({ branch_id: null })).toBe(true);
    expect(isSharedCatalogRow({ branch_id: 'store-a' })).toBe(false);
    expect(isBranchOwnedBy({ branch_id: 'store-a' }, 'store-a')).toBe(true);
    expect(isBranchOwnedBy({ branch_id: 'store-a' }, 'store-b')).toBe(false);
    expect(catalogRowBranchId({ branch_id: 'x' })).toBe('x');
  });

  it('visibility clause for base vs branches', () => {
    const base = hqCatalogVisibilityClause([]);
    expect(base.filter).toContain('branch_id = NONE');
    expect(base.params).toEqual({});

    const scoped = hqCatalogVisibilityClause(['a', 'b']);
    expect(scoped.filter).toContain('branch_id IN $hqBranchIds');
    expect(scoped.params.hqBranchIds).toEqual(['a', 'b']);
  });

  it('create allowed on base or single branch only', () => {
    expect(canCreateCatalogEntity([])).toBe(true);
    expect(canCreateCatalogEntity(['a'])).toBe(true);
    expect(canCreateCatalogEntity(['a', 'b'])).toBe(false);
  });
});
