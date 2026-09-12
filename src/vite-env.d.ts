/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_LANGUAGE?: string;
  readonly VITE_TRACKING_ENABLED?: string;
  readonly VITE_PROTECT_MODULES_SOURCE?: string;
  readonly VITE_TRACKING_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
