/**
 * Format a document line quantity for view modals.
 * Prefers entered qty+uom when present; shows stock qty+uom as a secondary hint.
 */
export function formatLineQuantityDisplay(
  line: {
    quantity?: number | null;
    entered_quantity?: number | string | null;
    entered_uom?: string | null;
    item?: {uom?: string | null} | null;
  },
  formatNumber: (n: number) => string
): {label: string; stockHint: string | null; usedEntered: boolean} {
  const stockQty = Number(line.quantity) || 0;
  const stockUom = line.item?.uom ? String(line.item.uom) : "";
  const enteredUom = line.entered_uom ? String(line.entered_uom) : "";
  const enteredQtyRaw = line.entered_quantity;
  const enteredQty =
    enteredQtyRaw === null || enteredQtyRaw === undefined || enteredQtyRaw === ""
      ? NaN
      : Number(enteredQtyRaw);

  if (enteredUom && Number.isFinite(enteredQty)) {
    return {
      label: `${formatNumber(enteredQty)} ${enteredUom}`.trim(),
      stockHint: `${formatNumber(stockQty)}${stockUom ? ` ${stockUom}` : ""}`.trim(),
      usedEntered: true,
    };
  }

  return {
    label: `${formatNumber(stockQty)}${stockUom ? ` ${stockUom}` : ""}`.trim(),
    stockHint: null,
    usedEntered: false,
  };
}

/**
 * Unit price display: prefer entered_price when the line was entered in another UOM.
 * Amount must still use stock unit price × stock qty.
 */
export function formatLineUnitPriceDisplay(
  line: {
    price?: number | null;
    entered_price?: number | string | null;
    entered_uom?: string | null;
    entered_quantity?: number | string | null;
    item?: {uom?: string | null} | null;
  },
  formatMoney: (n: number) => string
): {label: string; stockHint: string | null} {
  const stockPrice = Number(line.price);
  const stockUom = line.item?.uom ? String(line.item.uom) : "";
  const enteredUom = line.entered_uom ? String(line.entered_uom) : "";
  const enteredPriceRaw = line.entered_price;
  const enteredPrice =
    enteredPriceRaw === null || enteredPriceRaw === undefined || enteredPriceRaw === ""
      ? NaN
      : Number(enteredPriceRaw);
  const enteredQtyRaw = line.entered_quantity;
  const enteredQty =
    enteredQtyRaw === null || enteredQtyRaw === undefined || enteredQtyRaw === ""
      ? NaN
      : Number(enteredQtyRaw);

  const hasEntered =
    Boolean(enteredUom) && Number.isFinite(enteredQty) && Number.isFinite(enteredPrice);

  if (hasEntered) {
    return {
      label: `${formatMoney(enteredPrice)}${enteredUom ? ` / ${enteredUom}` : ""}`,
      stockHint:
        Number.isFinite(stockPrice)
          ? `${formatMoney(stockPrice)}${stockUom ? ` / ${stockUom}` : ""}`
          : null,
    };
  }

  return {
    label: Number.isFinite(stockPrice)
      ? `${formatMoney(stockPrice)}${stockUom ? ` / ${stockUom}` : ""}`
      : "—",
    stockHint: null,
  };
}

/** True when business calendar date differs from created_at's app business date. */
export function shouldShowBusinessDate(
  createdAt: unknown,
  businessDate: string | null | undefined,
  toBusinessDate: (value?: unknown) => string
): businessDate is string {
  if (!businessDate) return false;
  try {
    const createdBiz = toBusinessDate(createdAt as any);
    return Boolean(createdBiz && businessDate !== createdBiz);
  } catch {
    return false;
  }
}
