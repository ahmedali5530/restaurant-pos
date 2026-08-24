import { describe, expect, it } from 'vitest';
import {
  CURRENCY_DENOMINATIONS,
  CURRENCY_SYMBOLS,
  getCurrencySymbol,
  getQuickDenominations,
  setAppCurrencyCode,
  getAppCurrency,
} from '@/lib/currency.ts';

describe('currency', () => {
  it('maps HTG and USD symbols', () => {
    expect(CURRENCY_SYMBOLS.HTG).toBe('G');
    expect(CURRENCY_SYMBOLS.USD).toBe('$');
    expect(getCurrencySymbol('HTG')).toBe('G');
    expect(getCurrencySymbol('USD')).toBe('$');
  });

  it('exposes quick denominations for HTG and USD', () => {
    expect(CURRENCY_DENOMINATIONS.HTG).toContain(100);
    expect(getQuickDenominations('USD')).toEqual([1, 5, 10, 20, 50, 100]);
  });

  it('respects runtime currency override', () => {
    setAppCurrencyCode('USD');
    expect(getAppCurrency()).toBe('USD');
    setAppCurrencyCode('HTG');
    expect(getAppCurrency()).toBe('HTG');
    setAppCurrencyCode(null);
  });
});
