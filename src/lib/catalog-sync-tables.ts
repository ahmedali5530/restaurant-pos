/**
 * FOH catalog tables that Phase 2 download allowlists.
 * Kept in the Vite app so HQ Publish UI does not import sync-service Node code.
 * Keep in sync with sync-service DEFAULT_DOWNLOAD_TABLES when that lands on master.
 */
export const CATALOG_DOWNLOAD_TABLES = [
  'order_type',
  'category',
  'menu_item',
  'modifier_group',
  'modifier',
  'menu_item_modifier_group',
  'floor',
  'floor_table',
  'kitchen',
  'workflow',
  'workflow_stage',
  'payment_type',
  'tax',
  'menu',
  'menu_menu_item',
  'setting',
  'user',
  'extra',
  'discount',
  'discount_reason',
  'coupon',
  'printer',
] as const;

export type CatalogDownloadTable = (typeof CATALOG_DOWNLOAD_TABLES)[number];

/** Match sync-service catalog_release:<branch> keying. */
export function sanitizeBranchReleaseKey(clientId: string): string {
  return String(clientId || '').trim().replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * Phase 5: Sync now downloads release.tables ∩ allowlist.
 * Keep in sync with sync-service resolveCatalogSyncTables.
 */
export function resolveCatalogSyncTables(opts: {
  allowlist: readonly string[];
  localVersion?: number;
  globalRelease?: { version?: number; tables?: string[] | null } | null;
  branchRelease?: { version?: number; tables?: string[] | null } | null;
}): string[] {
  const allowed = (opts.allowlist || []).filter(Boolean).map(String);
  if (!allowed.length) return [];

  const local = Number(opts.localVersion) || 0;
  const tips = [opts.globalRelease, opts.branchRelease].filter(
    (row): row is { version?: number; tables?: string[] | null } =>
      !!row && typeof row === 'object'
  );

  const newer = tips.filter((row) => Number(row.version) > local);
  const consider = newer.length
    ? newer
    : tips.length
      ? [pickWinningCatalogRelease(opts.globalRelease, opts.branchRelease)].filter(
          (row): row is { version?: number; tables?: string[] | null } => !!row
        )
      : [];

  if (!consider.length) return [...allowed];

  const declared: string[] = [];
  let anyDeclared = false;
  for (const row of consider) {
    if (!Array.isArray(row.tables) || row.tables.length === 0) continue;
    anyDeclared = true;
    for (const name of row.tables) {
      const table = String(name || '').trim();
      if (table) declared.push(table);
    }
  }

  if (!anyDeclared) return [...allowed];

  const wanted = new Set(declared);
  const filtered = allowed.filter((name) => wanted.has(name));
  return filtered.length ? filtered : [...allowed];
}

export function pickWinningCatalogRelease<T extends { version?: number }>(
  globalRelease: T | null | undefined,
  branchRelease: T | null | undefined,
): T | null {
  const g = globalRelease ? Number(globalRelease.version) || 0 : -1;
  const b = branchRelease ? Number(branchRelease.version) || 0 : -1;
  if (b < 0 && g < 0) return null;
  if (b >= g) return branchRelease ?? null;
  return globalRelease ?? null;
}
