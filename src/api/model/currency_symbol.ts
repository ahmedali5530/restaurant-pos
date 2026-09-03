export const CURRENCY_SYMBOL_KEY = 'currency_symbol';

export interface CurrencySymbolSettings {
  /** Show currency symbol next to amounts in the app UI. */
  ui: boolean;
  /** Show currency symbol on printed receipts / summaries. */
  receipts: boolean;
}

export const DEFAULT_CURRENCY_SYMBOL: CurrencySymbolSettings = {
  ui: true,
  receipts: true,
};
