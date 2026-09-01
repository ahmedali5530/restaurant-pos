/**
 * Currency formatting integration layer.
 *
 * Bridges the legacy `withCurrency` helper (in utils.ts) with the new
 * multi-currency service (currency.service.ts). Keeps backward compatibility:
 *   - Existing callers using `withCurrency(amount)` keep working unchanged.
 *   - New callers can use `formatWithConfig(amount, currencyCode)` for
 *     explicit currency + dual display.
 *
 * Settings honored:
 *   - showCurrencySymbolInUi  → hide symbol for compact displays
 *   - currency_display_dual    → render secondary currency under base amount
 *   - currency_dual_target     → which currency to show as the secondary line
 */
import {
  Currency,
  convertAmount,
  formatBase,
  formatDual,
  formatMoney,
  getCurrencyConfig,
  getCurrencyMeta,
  type CurrencyConfig,
  type FormattedMoney,
} from '@/lib/currency.service.ts';

/** Module cache so `withCurrency` can respect the setting without React. */
let showCurrencySymbolInUi = true;

export const setShowCurrencySymbolInUi = (show: boolean) => {
  showCurrencySymbolInUi = show;
};

export const getShowCurrencySymbolInUi = () => showCurrencySymbolInUi;

/**
 * Format an amount with the configured base currency symbol + decimals.
 * Drop-in for the legacy `withCurrency` helper — accepts string|number|undefined.
 */
export const formatWithConfig = (
  amount: string | number | undefined,
  currencyCode?: string,
  cfg?: CurrencyConfig
): string => {
  if (amount === undefined || amount === null || amount === '') return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return '—';
  const config = cfg ?? getCurrencyConfig();
  const code = currencyCode ?? config.base;
  const formatted = formatMoney(num, code, { withSymbol: showCurrencySymbolInUi });
  return formatted.display;
};

/**
 * Dual-currency rendering for receipts, displays, and customer-facing kiosks.
 * Returns the primary display string plus an optional secondary line.
 *   `formatDualDisplay(12.50)` → { primary: '€12.50', secondary: '$13.50' | null }
 */
export const formatDualDisplay = (
  amount: number,
  cfg?: CurrencyConfig
): { primary: string; secondary: string | null } => {
  const config = cfg ?? getCurrencyConfig();
  const primary = formatMoney(amount, config.base, { withSymbol: showCurrencySymbolInUi });
  const dual = formatDual(amount, config);
  if (!dual) return { primary: primary.display, secondary: null };
  return { primary: primary.display, secondary: dual.secondary.display };
};

/**
 * Convert a base-currency amount to a target currency for payment.
 * Used by the payment flow when a guest pays in a foreign currency.
 */
export const convertForPayment = (
  baseAmount: number,
  targetCurrency: string,
  cfg?: CurrencyConfig
): { amount: number; display: string; rate: number } => {
  const config = cfg ?? getCurrencyConfig();
  const amount = convertAmount(baseAmount, config.base, targetCurrency, config);
  const rate = convertAmount(1, config.base, targetCurrency, config);
  const display = formatMoney(amount, targetCurrency).display;
  return { amount, display, rate };
};

/** Quick lookup for currency metadata without a React context. */
export const getCurrencyInfo = (code: string) => getCurrencyMeta(code);

export type { Currency, CurrencyConfig, FormattedMoney };
