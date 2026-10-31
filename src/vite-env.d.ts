/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_LANGUAGE?: string;
  /** Initial login tab: `pin` (default) or `form`. */
  readonly VITE_DEFAULT_LOGIN_METHOD?: string;
  readonly VITE_TRACKING_ENABLED?: string;
  readonly VITE_PROTECT_MODULES_SOURCE?: string;
  readonly VITE_TRACKING_SERVER_URL?: string;
  /** Comma-separated access-module allowlist. Empty = all modules. */
  readonly VITE_APP_MODULES?: string;
  /** Comma-separated access-module denylist (applied after allowlist). */
  readonly VITE_APP_MODULES_EXCLUDE?: string;
  /** Inventory qty/cost rounding precision (default 4). */
  readonly VITE_INVENTORY_DECIMAL_PLACES?: string;
  readonly VITE_DECIMAL_PLACES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config from VITE_APP_MODULES / VITE_APP_MODULES_EXCLUDE. */
declare const __BUILD_MODULE_menu__: boolean;
declare const __BUILD_MODULE_quick__: boolean;
declare const __BUILD_MODULE_orders__: boolean;
declare const __BUILD_MODULE_summary__: boolean;
declare const __BUILD_MODULE_kitchen__: boolean;
declare const __BUILD_MODULE_order_display__: boolean;
declare const __BUILD_MODULE_delivery__: boolean;
declare const __BUILD_MODULE_closing__: boolean;
declare const __BUILD_MODULE_inventory__: boolean;
declare const __BUILD_MODULE_admin__: boolean;
declare const __BUILD_MODULE_reports__: boolean;
declare const __BUILD_MODULE_tips__: boolean;
declare const __BUILD_MODULE_accounts__: boolean;
declare const __BUILD_MODULE_hr__: boolean;
declare const __BUILD_MODULE_integrations__: boolean;
declare const __BUILD_MODULE_settings__: boolean;
