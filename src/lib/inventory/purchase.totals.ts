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

/** Money for one line when price is per stock unit and qty may be in another UOM. */
export const quantityOnlyLineAmount = (
  line: Pick<PurchaseTotalLine, "quantity" | "price" | "entered_uom">,
  stockUom: string | null | undefined
): number => {
  const qty = safeNumber(line.quantity);
  const price = safeNumber(line.price);
  if (!qty || !price) return 0;
  try {
    const stock = convertQuantityOnlyLine({
      enteredQuantity: qty,
      enteredUom: line.entered_uom || stockUom,
      stockUom: stockUom || line.entered_uom,
      stockUnitPrice: price,
    });
    return lineAmount(stock.price, stock.quantity);
  } catch {
    return lineAmount(price, qty);
  }
};

/**
 * Subtotal when form qty/UOM are entered units but price is per stock unit.
 * Converts each line qty → stock qty before multiplying by price.
 */
export const itemsSubtotalQuantityOnly = (
  lines: QuantityOnlyTotalLine[] | null | undefined,
  resolveStockUom: (line: QuantityOnlyTotalLine, index: number) => string | null | undefined
): number =>
  (lines ?? []).reduce(
    (sum, line, index) => sum + quantityOnlyLineAmount(line, resolveStockUom(line, index)),
    0
  );

export const taxableSubtotal = (lines: PurchaseTotalLine[] | null | undefined): number =>
  (lines ?? []).reduce((sum, line) => {
    if (!line.taxable) return sum;
    return sum + lineAmount(safeNumber(line.price), safeNumber(line.quantity));
  }, 0);

export const taxableSubtotalQuantityOnly = (
  lines: QuantityOnlyTotalLine[] | null | undefined,
  resolveStockUom: (line: QuantityOnlyTotalLine, index: number) => string | null | undefined
): number =>
  (lines ?? []).reduce((sum, line, index) => {
    if (!line.taxable) return sum;
    return sum + quantityOnlyLineAmount(line, resolveStockUom(line, index));
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
  options?: {
    resolveStockUom?: (line: QuantityOnlyTotalLine, index: number) => string | null | undefined;
  }
) => {
  const resolveStockUom = options?.resolveStockUom;
  const subtotal = roundInventory(
    resolveStockUom
      ? itemsSubtotalQuantityOnly(lines as QuantityOnlyTotalLine[] | undefined, resolveStockUom)
      : itemsSubtotal(lines)
  );
  const taxable = roundInventory(
    resolveStockUom
      ? taxableSubtotalQuantityOnly(lines as QuantityOnlyTotalLine[] | undefined, resolveStockUom)
      : taxableSubtotal(lines)
  );
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
