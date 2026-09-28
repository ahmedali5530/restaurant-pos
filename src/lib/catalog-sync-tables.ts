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
