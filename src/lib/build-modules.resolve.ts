/**
 * Pure allow/deny resolution for build-time app modules.
 * Shared by the browser helper and vite.config (for __BUILD_MODULE_* defines).
 */

export const TOP_LEVEL_BUILD_MODULES = [
  'menu',
  'quick',
  'orders',
  'summary',
  'kitchen',
  'order_display',
  'delivery',
  'closing',
  'inventory',
  'admin',
  'reports',
  'tips',
  'accounts',
  'hr',
  'integrations',
  'settings',
] as const;

export type TopLevelBuildModule = (typeof TOP_LEVEL_BUILD_MODULES)[number];

export function parseModuleList(raw: string | undefined | null): string[] {
  if (raw == null || !String(raw).trim()) return [];
  return String(raw)
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/** Allow: id matches token, or token is a parent, or id is a parent of an allowed child. */
export function matchesAllowToken(moduleId: string, token: string): boolean {
  const id = moduleId.toLowerCase();
  const t = token.toLowerCase();
  return id === t || id.startsWith(`${t}.`) || t.startsWith(`${id}.`);
}

/** Exclude: id matches token, or token is a parent of id (not the reverse). */
export function matchesExcludeToken(moduleId: string, token: string): boolean {
  const id = moduleId.toLowerCase();
  const t = token.toLowerCase();
  return id === t || id.startsWith(`${t}.`);
}

export function isModuleEnabledForLists(
  moduleId: string,
  allow: readonly string[],
  exclude: readonly string[],
): boolean {
  const id = String(moduleId || '').trim().toLowerCase();
  if (!id) return true;

  const allowOk =
    allow.length === 0 || allow.some((token) => matchesAllowToken(id, token));
  if (!allowOk) return false;

  if (exclude.some((token) => matchesExcludeToken(id, token))) return false;
  return true;
}

export function resolveTopLevelBuildFlags(
  allowRaw: string | undefined | null,
  excludeRaw: string | undefined | null,
): Record<TopLevelBuildModule, boolean> {
  const allow = parseModuleList(allowRaw);
  const exclude = parseModuleList(excludeRaw);
  const out = {} as Record<TopLevelBuildModule, boolean>;
  for (const id of TOP_LEVEL_BUILD_MODULES) {
    out[id] = isModuleEnabledForLists(id, allow, exclude);
  }
  return out;
}

/** Vite `define` map: __BUILD_MODULE_orders__ → true/false literal. */
export function buildModuleDefineMap(
  allowRaw: string | undefined | null,
  excludeRaw: string | undefined | null,
): Record<string, string> {
  const flags = resolveTopLevelBuildFlags(allowRaw, excludeRaw);
  const define: Record<string, string> = {};
  for (const id of TOP_LEVEL_BUILD_MODULES) {
    define[`__BUILD_MODULE_${id}__`] = JSON.stringify(flags[id]);
  }
  return define;
}
