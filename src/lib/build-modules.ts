import {
  isModuleEnabledForLists,
  parseModuleList,
  TOP_LEVEL_BUILD_MODULES,
  type TopLevelBuildModule,
} from '@/lib/build-modules.resolve.ts';
import {
  ACCOUNTS,
  ADMIN,
  CLOCK,
  CLOSING,
  DELIVERY,
  HR,
  INVENTORY,
  INTEGRATIONS,
  KITCHEN,
  MENU,
  ORDER_DISPLAY,
  ORDERS,
  REPORTS,
  SETTINGS,
  SUMMARY,
  TIP_DISTRIBUTION,
} from '@/routes/posr.ts';

const ALLOW = parseModuleList(import.meta.env.VITE_APP_MODULES);
const EXCLUDE = parseModuleList(import.meta.env.VITE_APP_MODULES_EXCLUDE);

/** True when this access-module id is included in the current Vite build. */
export function isBuildModuleEnabled(moduleId: string): boolean {
  return isModuleEnabledForLists(moduleId, ALLOW, EXCLUDE);
}

export function filterByBuildModule<T>(
  items: readonly T[],
  getModuleId: (item: T) => string | undefined | null,
): T[] {
  return items.filter((item) => {
    const id = getModuleId(item);
    if (!id) return true;
    return isBuildModuleEnabled(id);
  });
}

/** Drop tab keys whose module id is disabled in this build. */
export function filterPagesByBuildModule<T extends Record<string, unknown>>(
  pages: T,
  modules: Record<string, string>,
): T {
  const out = {} as T;
  for (const key of Object.keys(pages) as (keyof T)[]) {
    const mod = modules[String(key)];
    if (!mod || isBuildModuleEnabled(mod)) {
      out[key] = pages[key];
    }
  }
  return out;
}

export function firstPageKey(pages: Record<string, unknown>, preferred?: string): string {
  if (preferred && preferred in pages) return preferred;
  return Object.keys(pages)[0] ?? preferred ?? '';
}

function topLevelFlag(defined: unknown, moduleId: TopLevelBuildModule): boolean {
  if (typeof defined === 'boolean') return defined;
  return isBuildModuleEnabled(moduleId);
}

/** Top-level flags from Vite `define` (tree-shake friendly). */
export function isTopLevelBuildModuleEnabled(id: TopLevelBuildModule): boolean {
  switch (id) {
    case 'menu':
      return topLevelFlag(
        typeof __BUILD_MODULE_menu__ !== 'undefined' ? __BUILD_MODULE_menu__ : undefined,
        'menu',
      );
    case 'orders':
      return topLevelFlag(
        typeof __BUILD_MODULE_orders__ !== 'undefined' ? __BUILD_MODULE_orders__ : undefined,
        'orders',
      );
    case 'summary':
      return topLevelFlag(
        typeof __BUILD_MODULE_summary__ !== 'undefined' ? __BUILD_MODULE_summary__ : undefined,
        'summary',
      );
    case 'kitchen':
      return topLevelFlag(
        typeof __BUILD_MODULE_kitchen__ !== 'undefined' ? __BUILD_MODULE_kitchen__ : undefined,
        'kitchen',
      );
    case 'order_display':
      return topLevelFlag(
        typeof __BUILD_MODULE_order_display__ !== 'undefined'
          ? __BUILD_MODULE_order_display__
          : undefined,
        'order_display',
      );
    case 'delivery':
      return topLevelFlag(
        typeof __BUILD_MODULE_delivery__ !== 'undefined' ? __BUILD_MODULE_delivery__ : undefined,
        'delivery',
      );
    case 'closing':
      return topLevelFlag(
        typeof __BUILD_MODULE_closing__ !== 'undefined' ? __BUILD_MODULE_closing__ : undefined,
        'closing',
      );
    case 'inventory':
      return topLevelFlag(
        typeof __BUILD_MODULE_inventory__ !== 'undefined' ? __BUILD_MODULE_inventory__ : undefined,
        'inventory',
      );
    case 'admin':
      return topLevelFlag(
        typeof __BUILD_MODULE_admin__ !== 'undefined' ? __BUILD_MODULE_admin__ : undefined,
        'admin',
      );
    case 'reports':
      return topLevelFlag(
        typeof __BUILD_MODULE_reports__ !== 'undefined' ? __BUILD_MODULE_reports__ : undefined,
        'reports',
      );
    case 'tips':
      return topLevelFlag(
        typeof __BUILD_MODULE_tips__ !== 'undefined' ? __BUILD_MODULE_tips__ : undefined,
        'tips',
      );
    case 'accounts':
      return topLevelFlag(
        typeof __BUILD_MODULE_accounts__ !== 'undefined' ? __BUILD_MODULE_accounts__ : undefined,
        'accounts',
      );
    case 'hr':
      return topLevelFlag(
        typeof __BUILD_MODULE_hr__ !== 'undefined' ? __BUILD_MODULE_hr__ : undefined,
        'hr',
      );
    case 'integrations':
      return topLevelFlag(
        typeof __BUILD_MODULE_integrations__ !== 'undefined'
          ? __BUILD_MODULE_integrations__
          : undefined,
        'integrations',
      );
    case 'settings':
      return topLevelFlag(
        typeof __BUILD_MODULE_settings__ !== 'undefined' ? __BUILD_MODULE_settings__ : undefined,
        'settings',
      );
    default:
      return isBuildModuleEnabled(id);
  }
}

const HOME_CANDIDATES: { path: string; module: TopLevelBuildModule }[] = [
  { path: MENU, module: 'menu' },
  { path: ORDERS, module: 'orders' },
  { path: SUMMARY, module: 'summary' },
  { path: KITCHEN, module: 'kitchen' },
  { path: ORDER_DISPLAY, module: 'order_display' },
  { path: DELIVERY, module: 'delivery' },
  { path: CLOSING, module: 'closing' },
  { path: INVENTORY, module: 'inventory' },
  { path: ADMIN, module: 'admin' },
  { path: REPORTS, module: 'reports' },
  { path: TIP_DISTRIBUTION, module: 'tips' },
  { path: ACCOUNTS, module: 'accounts' },
  { path: HR, module: 'hr' },
  { path: INTEGRATIONS, module: 'integrations' },
  { path: SETTINGS, module: 'settings' },
];

/** First enabled app path after login. Clock is always available as last resort. */
export function getDefaultAppPath(): string {
  for (const item of HOME_CANDIDATES) {
    if (isTopLevelBuildModuleEnabled(item.module)) return item.path;
  }
  return CLOCK;
}

export { TOP_LEVEL_BUILD_MODULES };
export type { TopLevelBuildModule };
