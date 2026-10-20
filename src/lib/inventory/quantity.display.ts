/**
 * Format a document line quantity for view modals.
 * Prefers entered qty+uom when present; shows stock qty+uom as a secondary hint.
 */
export function formatLineQuantityDisplay(
  line: {
    quantity?: number | null;
    entered_quantity?: number | null;
    entered_uom?: string | null;
    item?: {uom?: string | null} | null;
  },
  formatNumber: (n: number) => string
): {label: string; stockHint: string | null} {
  const stockQty = Number(line.quantity) || 0;
  const stockUom = line.item?.uom ? String(line.item.uom) : "";
  const enteredUom = line.entered_uom ? String(line.entered_uom) : "";
  const enteredQty = Number(line.entered_quantity);

  if (enteredUom && Number.isFinite(enteredQty)) {
    return {
      label: `${formatNumber(enteredQty)} ${enteredUom}`.trim(),
      stockHint: `${formatNumber(stockQty)}${stockUom ? ` ${stockUom}` : ""}`.trim(),
    };
  }

  return {
    label: `${formatNumber(stockQty)}${stockUom ? ` ${stockUom}` : ""}`.trim(),
    stockHint: null,
  };
}
