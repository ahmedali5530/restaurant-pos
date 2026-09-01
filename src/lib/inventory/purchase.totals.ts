import {safeNumber} from "@/lib/utils.ts";
import {lineAmount} from "@/lib/inventory/line.cost.ts";

export type PurchaseTotalLine = {
  quantity?: number | string | null;
  price?: number | string | null;
  taxable?: boolean | null;
};

export type PurchaseExtraLine = {
  name?: string | null;
  amount?: number | string | null;
};

export const itemsSubtotal = (lines: PurchaseTotalLine[] | null | undefined): number =>
  (lines ?? []).reduce(
    (sum, line) => sum + lineAmount(safeNumber(line.price), safeNumber(line.quantity)),
    0,
  );

export const taxableSubtotal = (lines: PurchaseTotalLine[] | null | undefined): number =>
  (lines ?? []).reduce((sum, line) => {
    if (!line.taxable) return sum;
    return sum + lineAmount(safeNumber(line.price), safeNumber(line.quantity));
  }, 0);

export const taxAmount = (taxableSub: number, rate: number | string | null | undefined): number =>
  taxableSub * (safeNumber(rate) / 100);

export const extrasTotal = (extras: PurchaseExtraLine[] | null | undefined): number =>
  (extras ?? []).reduce((sum, extra) => sum + safeNumber(extra.amount), 0);

export const grandTotal = (
  subtotal: number,
  tax: number,
  extras: number,
): number => subtotal + tax + extras;

export const computePurchaseTotals = (
  lines: PurchaseTotalLine[] | null | undefined,
  taxRate: number | string | null | undefined,
  extras: PurchaseExtraLine[] | null | undefined,
) => {
  const subtotal = itemsSubtotal(lines);
  const taxable = taxableSubtotal(lines);
  const tax = taxAmount(taxable, taxRate);
  const extrasSum = extrasTotal(extras);
  return {
    subtotal,
    taxableSubtotal: taxable,
    taxAmount: tax,
    extrasTotal: extrasSum,
    grandTotal: grandTotal(subtotal, tax, extrasSum),
  };
};
