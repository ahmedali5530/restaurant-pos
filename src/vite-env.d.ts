/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_LANGUAGE?: string;
  /** Initial login tab: `pin` (default) or `form`. */
  readonly VITE_DEFAULT_LOGIN_METHOD?: string;
  readonly VITE_TRACKING_ENABLED?: string;
  readonly VITE_PROTECT_MODULES_SOURCE?: string;
  readonly VITE_TRACKING_SERVER_URL?: string;
  /** Inventory qty/cost rounding precision (default 4). */
  readonly VITE_INVENTORY_DECIMAL_PLACES?: string;
  readonly VITE_DECIMAL_PLACES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
