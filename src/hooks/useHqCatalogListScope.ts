import { useEffect, useRef } from 'react';
import { useHqCatalogBranchContext } from '@/hooks/useHqCatalogBranchEdit.ts';
import { hqCatalogVisibilityClause } from '@/lib/catalog-row-scope.ts';

type LoadHookLike = {
  handleFilterChange: (filters: string[], condition?: 'and' | 'or') => void;
  handleParameterChange: (params: Record<string, any>) => void;
  fetchData?: () => void;
};

/**
 * Keeps Admin list queries scoped to shared ∪ selected branch-owned rows
 * when Catalog publish / HQ branch edit is enabled.
 */
export function useHqCatalogListScope(
  loadHook: LoadHookLike,
  baseFilters: string[] = ['deleted_at = none']
) {
  const { enabled, branchIds } = useHqCatalogBranchContext();
  const baseKey = baseFilters.join('\0');
  const prev = useRef('');

  useEffect(() => {
    if (!enabled) return;
    const key = `${baseKey}|${branchIds.join(',')}`;
    if (prev.current === key) return;
    prev.current = key;
    const { filter, params } = hqCatalogVisibilityClause(branchIds);
    loadHook.handleFilterChange([...baseFilters, filter]);
    loadHook.handleParameterChange(params);
    loadHook.fetchData?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- never put db/loadHook object in deps
  }, [enabled, branchIds.join(','), baseKey]);
}
