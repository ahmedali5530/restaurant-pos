import type { AppCurrencyCode } from '@/lib/currency.ts';

export const CURRENCY_SYMBOL_KEY = 'currency_symbol';

export interface CurrencySymbolSettings {
  /** ISO currency used for amounts (HTG or USD). */
  code?: AppCurrencyCode;
  /** Show currency symbol next to amounts in the app UI. */
  ui: boolean;
  /** Show currency symbol on printed receipts / summaries. */
  receipts: boolean;
}

export const DEFAULT_CURRENCY_SYMBOL: CurrencySymbolSettings = {
  code: 'HTG',
  ui: true,
  receipts: true,
};
