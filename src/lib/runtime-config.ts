/** Runtime config from Tauri installer-settings (overrides bake-time VITE_* on desktop). */

import { invoke } from '@tauri-apps/api/core';
import { isTauriDesktop } from '@/lib/desktop';

export type DesktopRuntimeConfig = {
  storeName: string;
  storeAddress: string;
  defaultLanguage: string;
  locale: string;
  currency: string;
  currencySymbol: string;
  decimalPlaces: number;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  hasInstallerSettings: boolean;
  applied: boolean;
  centralHost: string;
  gatewayUrl: string;
  dbWebsocketUrl: string;
  printServerUrl: string;
  paymentServerUrl: string;
  trackingServerUrl: string;
  apiServerUrl: string;
  syncServiceUrl: string;
};

let cache: DesktopRuntimeConfig | null = null;
let hydratePromise: Promise<void> | null = null;

export function getCachedRuntimeConfig(): DesktopRuntimeConfig | null {
  return cache;
}

export async function hydrateRuntimeConfig(): Promise<DesktopRuntimeConfig | null> {
  if (!isTauriDesktop()) {
    return null;
  }
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        cache = await invoke<DesktopRuntimeConfig>('get_runtime_config');
      } catch (err) {
        console.warn('[desktop] get_runtime_config failed', err);
        cache = null;
      }
    })();
  }
  await hydratePromise;
  return cache;
}

export function runtimeLocale(): string {
  return cache?.locale || (import.meta.env.VITE_LOCALE as string) || 'en-US';
}

export function runtimeCurrency(): string {
  return cache?.currency || (import.meta.env.VITE_CURRENCY as string) || 'USD';
}

export function runtimeDecimalPlaces(): number {
  if (cache && typeof cache.decimalPlaces === 'number') {
    return cache.decimalPlaces;
  }
  const raw = Number(import.meta.env.VITE_DECIMAL_PLACES);
  return Number.isFinite(raw) ? raw : 2;
}

export function runtimeTimezone(): string {
  return cache?.timezone || (import.meta.env.VITE_APP_TIMEZONE as string) || 'UTC';
}

export function runtimeDefaultLanguage(): string {
  return cache?.defaultLanguage || (import.meta.env.VITE_DEFAULT_LANGUAGE as string) || 'en';
}

export function runtimeStoreName(): string {
  return cache?.storeName || (import.meta.env.VITE_RESTAURANT_NAME as string) || '';
}

export function runtimeDateFormat(): string {
  return cache?.dateFormat || (import.meta.env.VITE_DATE_FORMAT as string) || 'yyyy-MM-dd';
}

export function runtimeTimeFormat(): string {
  return cache?.timeFormat || (import.meta.env.VITE_TIME_FORMAT as string) || 'HH:mm';
}

/** Date + time pattern. Luxon throws if this is missing, which blanks the page. */
export function runtimeDateTimeFormat(): string {
  if (cache?.dateFormat?.trim() || cache?.timeFormat?.trim()) {
    return `${runtimeDateFormat()} ${runtimeTimeFormat()}`;
  }
  const fromEnv = (import.meta.env.VITE_DATE_TIME_FORMAT as string | undefined)?.trim();
  return fromEnv || `${runtimeDateFormat()} ${runtimeTimeFormat()}`;
}

/** Luxon preset such as `ff`. Missing values throw inside toFormat. */
export function runtimeDateHumanFormat(): string {
  return (import.meta.env.VITE_DATE_HUMAN_FORMAT as string | undefined)?.trim() || 'ff';
}

function runtimeServiceUrl(value: string | undefined): string {
  return value?.trim().replace(/\/$/, '') || '';
}

/** Satellite desktop installs set these. Empty means use the baked localhost URLs. */
export function runtimeGatewayUrl(): string {
  return runtimeServiceUrl(cache?.gatewayUrl);
}

export function runtimeDbWebsocketUrl(): string {
  return runtimeServiceUrl(cache?.dbWebsocketUrl);
}

export function runtimePrintServerUrl(): string {
  return runtimeServiceUrl(cache?.printServerUrl);
}

export function runtimePaymentServerUrl(): string {
  return runtimeServiceUrl(cache?.paymentServerUrl);
}

export function runtimeTrackingServerUrl(): string {
  return runtimeServiceUrl(cache?.trackingServerUrl);
}

export function runtimeApiServerUrl(): string {
  return runtimeServiceUrl(cache?.apiServerUrl);
}

export function runtimeSyncServiceUrl(): string {
  return runtimeServiceUrl(cache?.syncServiceUrl);
}
