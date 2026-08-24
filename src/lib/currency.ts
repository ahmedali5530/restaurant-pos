/** ISO currency codes supported by the POS (display + quick tender chips). */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  HTG: 'G',
  PKR: 'Rs',
  EUR: '€',
  GBP: '£',
};

export const APP_CURRENCIES = ['HTG', 'USD'] as const;
export type AppCurrencyCode = (typeof APP_CURRENCIES)[number];

/** Quick tender chip amounts per currency (whole units; see VITE_DECIMAL_PLACES). */
export const CURRENCY_DENOMINATIONS: Record<string, number[]> = {
  USD: [1, 5, 10, 20, 50, 100],
  HTG: [10, 25, 50, 100, 250, 500, 1000],
  PKR: [1, 2, 5, 10, 20, 50, 100, 500, 1000, 5000],
};

/** Locales that format cleanly with Intl for each currency. */
export const CURRENCY_LOCALES: Record<string, string> = {
  HTG: 'fr-HT',
  USD: 'en-US',
  PKR: 'en-PK',
  EUR: 'fr-FR',
  GBP: 'en-GB',
};

let appCurrencyCode: string | null = null;

export function setAppCurrencyCode(code: string | null | undefined): void {
  const next = (code || '').trim().toUpperCase();
  appCurrencyCode = next || null;
}

export function getAppCurrency(): string {
  if (appCurrencyCode) return appCurrencyCode;
  const fromEnv = (import.meta.env.VITE_CURRENCY as string | undefined)?.trim();
  return (fromEnv || 'HTG').toUpperCase();
}

export function getAppLocale(): string {
  const currency = getAppCurrency();
  const mapped = CURRENCY_LOCALES[currency];
  if (mapped) return mapped;
  const fromEnv = (import.meta.env.VITE_LOCALE as string | undefined)?.trim();
  return fromEnv || 'en-US';
}

export function getCurrencySymbol(code?: string): string {
  const currency = (code || getAppCurrency()).toUpperCase();
  return CURRENCY_SYMBOLS[currency] || currency;
}

export function getQuickDenominations(code?: string): number[] {
  const currency = (code || getAppCurrency()).toUpperCase();
  return CURRENCY_DENOMINATIONS[currency] || CURRENCY_DENOMINATIONS.USD;
}

export function getSecondaryCurrency(): string | undefined {
  const raw = (import.meta.env.VITE_SECONDARY_CURRENCY as string | undefined)?.trim();
  if (!raw) return undefined;
  const secondary = raw.toUpperCase();
  if (secondary === getAppCurrency()) return undefined;
  return secondary;
}
