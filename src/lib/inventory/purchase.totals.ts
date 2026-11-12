import {safeNumber} from "@/lib/utils.ts";
import {lineAmount} from "@/lib/inventory/line.cost.ts";
import {roundInventory} from "@/lib/inventory/rounding.ts";
import {convertQuantityOnlyLine} from "@/lib/inventory/unit.convert.ts";

export type PurchaseTotalLine = {
  quantity?: number | string | null;
  price?: number | string | null;
  taxable?: boolean | null;
  /** Entered UOM when price is stored per stock unit (issues, waste, …). */
  entered_uom?: string | null;
};

export type QuantityOnlyTotalLine = PurchaseTotalLine & {
  item?: {value?: string} | null;
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

/**
 * Subtotal when form qty/UOM are entered units but price is per stock unit.
 * Converts each line qty → stock qty before multiplying by price.
 */
export const itemsSubtotalQuantityOnly = (
  lines: QuantityOnlyTotalLine[] | null | undefined,
  resolveStockUom: (line: QuantityOnlyTotalLine, index: number) => string | null | undefined
): number =>
  (lines ?? []).reduce((sum, line, index) => {
    const qty = safeNumber(line.quantity);
    const price = safeNumber(line.price);
    if (!qty || !price) return sum;
    const stockUom = resolveStockUom(line, index);
    try {
      const stock = convertQuantityOnlyLine({
        enteredQuantity: qty,
        enteredUom: line.entered_uom || stockUom,
        stockUom: stockUom || line.entered_uom,
        stockUnitPrice: price,
      });
      return sum + lineAmount(stock.price, stock.quantity);
    } catch {
      return sum + lineAmount(price, qty);
    }
  }, 0);

export const taxableSubtotal = (lines: PurchaseTotalLine[] | null | undefined): number =>
  (lines ?? []).reduce((sum, line) => {
    if (!line.taxable) return sum;
    return sum + lineAmount(safeNumber(line.price), safeNumber(line.quantity));
  }, 0);

export const taxAmount = (taxableSub: number, rate: number | string | null | undefined): number =>
  roundInventory(taxableSub * (safeNumber(rate) / 100));

export const extrasTotal = (extras: PurchaseExtraLine[] | null | undefined): number =>
  roundInventory((extras ?? []).reduce((sum, extra) => sum + safeNumber(extra.amount), 0));

export const grandTotal = (
  subtotal: number,
  tax: number,
  extras: number,
): number => roundInventory(subtotal + tax + extras);

export const computePurchaseTotals = (
  lines: PurchaseTotalLine[] | null | undefined,
  taxRate: number | string | null | undefined,
  extras: PurchaseExtraLine[] | null | undefined,
) => {
  const subtotal = roundInventory(itemsSubtotal(lines));
  const taxable = roundInventory(taxableSubtotal(lines));
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
