import {roundCurrency} from "@/lib/discount-engine/rounding.ts";
import {
  convertQuantity,
  normalizeUom,
  type InventoryUom,
} from "@/utils/inventoryUom.ts";

const QTY_DECIMALS = 6;
const qtyFactor = 10 ** QTY_DECIMALS;

export const roundStockQuantity = (value: number): number =>
  Math.round((value + Number.EPSILON) * qtyFactor) / qtyFactor;

export type StockLineMode = "commercial" | "quantity_only";

export type ToStockLineInput = {
  enteredQuantity: number;
  enteredUom: string | null | undefined;
  stockUom: string | null | undefined;
  /** Per entered unit for commercial; ignored for quantity_only when converting price. */
  enteredPrice?: number | null;
  /**
   * Already-stock-unit unit cost (catalog / final_unit_cost / recipe cost).
   * Passed through unchanged in quantity_only mode.
   */
  stockUnitPrice?: number | null;
  mode: StockLineMode;
  /** Reserved for future pack-size tables. */
  packSize?: number;
};

export type StockLine = {
  quantity: number;
  price: number;
  entered_quantity: number;
  entered_uom: InventoryUom;
  entered_price?: number;
};

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitConversionError";
  }
}

/**
 * Convert a typed line into stock-unit quantity and price.
 *
 * commercial: price is per entered unit → stock price = money / stock qty
 * quantity_only: cost is already per stock unit → convert quantity only
 */
export function toStockLine(input: ToStockLineInput): StockLine {
  const enteredUom = normalizeUom(input.enteredUom);
  const stockUom = normalizeUom(input.stockUom);
  if (!enteredUom || !stockUom) {
    throw new UnitConversionError("Unknown unit of measure");
  }

  const enteredQuantity = Number(input.enteredQuantity);
  if (!Number.isFinite(enteredQuantity) || enteredQuantity === 0) {
    throw new UnitConversionError("Quantity must be a non-zero number");
  }

  let quantity: number;
  try {
    quantity = roundStockQuantity(
      convertQuantity(enteredQuantity, enteredUom, stockUom, input.packSize)
    );
  } catch (err) {
    throw new UnitConversionError(
      err instanceof Error ? err.message : "Cannot convert units"
    );
  }

  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new UnitConversionError("Converted quantity is zero");
  }

  if (input.mode === "commercial") {
    const enteredPrice = Number(input.enteredPrice);
    if (!Number.isFinite(enteredPrice)) {
      throw new UnitConversionError("Price must be a number");
    }
    const money = enteredQuantity * enteredPrice;
    // Do not roundCurrency the unit price — only the monetary total must match.
    const price = money / quantity;
    return {
      quantity,
      price,
      entered_quantity: enteredQuantity,
      entered_uom: enteredUom,
      entered_price: enteredPrice,
    };
  }

  const stockUnitPrice = Number(input.stockUnitPrice ?? 0);
  return {
    quantity,
    price: Number.isFinite(stockUnitPrice) ? stockUnitPrice : 0,
    entered_quantity: enteredQuantity,
    entered_uom: enteredUom,
  };
}

/** Report / display quantity: legacy lines multiply by base_quantity; converted lines do not. */
export function purchaseReportQuantity(opts: {
  quantity: number;
  base_quantity?: number | null;
  entered_uom?: string | null;
}): number {
  const qty = Number(opts.quantity) || 0;
  if (opts.entered_uom) return qty;
  const base = Number(opts.base_quantity);
  return qty * (Number.isFinite(base) && base !== 0 ? base : 1);
}

export function stockLineMoneyMatchesEntered(line: StockLine): boolean {
  if (line.entered_price == null) return true;
  return (
    roundCurrency(line.quantity * line.price) ===
    roundCurrency(line.entered_quantity * line.entered_price)
  );
}

/** Resolve stock UOM from a catalog item map or fallback string. */
export function resolveStockUom(
  catalogUom: string | null | undefined,
  enteredUom: string | null | undefined
): string {
  return normalizeUom(catalogUom) ?? catalogUom ?? normalizeUom(enteredUom) ?? enteredUom ?? "";
}

/**
 * Convert a quantity-only document line (issues, returns, waste, recipes, …).
 * Pass stockUnitPrice when a price/cost column is also saved.
 */
export function convertQuantityOnlyLine(opts: {
  enteredQuantity: number;
  enteredUom?: string | null;
  stockUom?: string | null;
  stockUnitPrice?: number | null;
}): StockLine {
  const stockUom = resolveStockUom(opts.stockUom, opts.enteredUom);
  return toStockLine({
    enteredQuantity: opts.enteredQuantity,
    enteredUom: opts.enteredUom || stockUom,
    stockUom,
    stockUnitPrice: opts.stockUnitPrice ?? 0,
    mode: "quantity_only",
  });
}
