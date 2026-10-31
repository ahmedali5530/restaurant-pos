import { Order } from '@/api/model/order.ts';
import { KraProviderConfig } from '@/integrations/providers/fiscal/kra/config.ts';
import { safeNumber } from '@/lib/utils.ts';

/** Map POS tax rate / dish override → KRA taxTyCd (A–E). */
export const resolveKraTaxTyCd = (input: {
  config: Pick<KraProviderConfig, 'taxTyCd' | 'zeroTaxTyCd'>;
  dishOverride?: string | null;
  taxRate: number;
}): string => {
  const override = String(input.dishOverride ?? '').trim().toUpperCase();
  if (override && /^[A-E]$/.test(override)) return override;

  const rate = safeNumber(input.taxRate);
  if (rate === 0) return input.config.zeroTaxTyCd || 'A';
  // Kenya standard VAT ~16%; reduced ~8% maps to E when used.
  if (Math.abs(rate - 16) < 0.6) return 'B';
  if (Math.abs(rate - 8) < 0.6) return 'E';
  return input.config.taxTyCd || 'B';
};

export const resolveOrderItemTaxRate = (
  order: Order,
  item: Order['items'][number],
  unitSale: number,
  unitTax: number
): number => {
  if (item.tax_mode === 'inclusive' && item.taxes?.length) {
    return item.taxes.reduce((sum, tax) => sum + safeNumber(tax.rate), 0);
  }
  if (order.tax?.rate != null) {
    return safeNumber(order.tax.rate);
  }
  if (item.taxes?.length) {
    return item.taxes.reduce((sum, tax) => sum + safeNumber(tax.rate), 0);
  }
  if (unitSale > 0) {
    return (unitTax / unitSale) * 100;
  }
  return 0;
};

export type KraTaxBuckets = {
  taxblAmtA: number;
  taxblAmtB: number;
  taxblAmtC: number;
  taxblAmtD: number;
  taxblAmtE: number;
  taxRtA: number;
  taxRtB: number;
  taxRtC: number;
  taxRtD: number;
  taxRtE: number;
  taxAmtA: number;
  taxAmtB: number;
  taxAmtC: number;
  taxAmtD: number;
  taxAmtE: number;
};

export const emptyKraTaxBuckets = (): KraTaxBuckets => ({
  taxblAmtA: 0,
  taxblAmtB: 0,
  taxblAmtC: 0,
  taxblAmtD: 0,
  taxblAmtE: 0,
  taxRtA: 0,
  taxRtB: 16,
  taxRtC: 0,
  taxRtD: 0,
  taxRtE: 8,
  taxAmtA: 0,
  taxAmtB: 0,
  taxAmtC: 0,
  taxAmtD: 0,
  taxAmtE: 0,
});

export const accumulateKraTaxBucket = (
  buckets: KraTaxBuckets,
  taxTyCd: string,
  taxable: number,
  taxAmt: number,
  taxRate: number
) => {
  const code = taxTyCd.toUpperCase();
  if (code === 'A') {
    buckets.taxblAmtA += taxable;
    buckets.taxAmtA += taxAmt;
  } else if (code === 'C') {
    buckets.taxblAmtC += taxable;
    buckets.taxAmtC += taxAmt;
  } else if (code === 'D') {
    buckets.taxblAmtD += taxable;
    buckets.taxAmtD += taxAmt;
  } else if (code === 'E') {
    buckets.taxblAmtE += taxable;
    buckets.taxAmtE += taxAmt;
    if (taxRate > 0) buckets.taxRtE = taxRate;
  } else {
    buckets.taxblAmtB += taxable;
    buckets.taxAmtB += taxAmt;
    if (taxRate > 0) buckets.taxRtB = taxRate;
  }
};
