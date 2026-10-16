'use strict';

/**
 * Server-side pricing for QR self-orders. Mirrors the POS rules so a
 * self-order settles to the same totals a cashier would ring up:
 *
 * - `src/lib/order-item-pricing.ts` (`buildOrderItemPayload`): inclusive
 *   display prices are stored net; modifiers inherit the parent tax context.
 * - `src/lib/tax-calculator.ts` (`collectOrderTaxRows`): inclusive lines are
 *   taxed with their menu taxes, exclusive lines with the order-level tax.
 *
 * Prices always come from the catalog — never from the customer's browser.
 */

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const totalRate = (taxes) => (taxes || []).reduce((sum, tax) => sum + Number(tax?.rate || 0), 0);

/** Inclusive display price → net (`calculateInclusiveBasePrice`). */
function normalizeUnitPrice(displayPrice, taxMode, taxes) {
  const gross = Number(displayPrice || 0);
  if (taxMode === 'inclusive' && taxes && taxes.length > 0) {
    return round2(gross / (1 + totalRate(taxes) / 100));
  }
  return gross;
}

/** Per-tax amounts on a unit base, each rounded (`calculateItemTax`). */
function unitTaxAmounts(unitBase, taxes) {
  return (taxes || []).map((tax) => ({
    tax,
    amount: round2((unitBase * Number(tax?.rate || 0)) / 100),
  }));
}

/**
 * Price one cart line.
 *
 * @param {object} dish      resolved menu dish: { price, tax_mode, taxes: Tax[] }
 * @param {number} quantity
 * @param {Array<{price:number}>} modifiers  selected modifier options (display prices)
 * @param {object|null} orderTax  exclusive order-level tax, if configured
 */
function priceLine(dish, quantity, modifiers, orderTax) {
  const taxMode = dish.tax_mode === 'inclusive' ? 'inclusive' : 'exclusive';
  const taxes = dish.taxes && dish.taxes.length > 0 ? dish.taxes : null;
  const qty = Number(quantity || 1);
  const displayPrice = Number(dish.price || 0);
  const netPrice = normalizeUnitPrice(displayPrice, taxMode, taxes);
  const netModifiers = (modifiers || []).map((modifier) =>
    normalizeUnitPrice(Number(modifier.price || 0), taxMode, taxes),
  );
  const netUnitBase = netPrice + netModifiers.reduce((sum, value) => sum + value, 0);

  // Stored `order_item.tax`: only inclusive lines carry embedded tax.
  const storedTax =
    taxMode === 'inclusive' && taxes
      ? round2(unitTaxAmounts(netUnitBase, taxes).reduce((sum, t) => sum + t.amount, 0) * qty)
      : 0;

  // Payment tax rows (`getOrderLineItemTaxCalculation`).
  const lineTaxes =
    taxMode === 'inclusive'
      ? taxes
        ? unitTaxAmounts(netUnitBase, taxes).map((t) => ({ tax: t.tax, amount: round2(t.amount * qty) }))
        : []
      : orderTax
        ? unitTaxAmounts(netUnitBase, [orderTax]).map((t) => ({ tax: t.tax, amount: round2(t.amount * qty) }))
        : [];

  return {
    taxMode,
    taxes: taxes || [],
    displayPrice,
    netPrice,
    netModifiers,
    netUnitBase,
    lineNet: round2(netUnitBase * qty),
    storedTax,
    lineTaxes,
  };
}

/** Aggregate line taxes per tax id (`collectOrderTaxRows`). */
function collectTaxRows(pricedLines) {
  const byTax = new Map();
  for (const line of pricedLines) {
    for (const { tax, amount } of line.lineTaxes) {
      const key = String(tax.id ?? `${tax.name}-${tax.rate}`);
      const entry = byTax.get(key) ?? { tax, amount: 0 };
      entry.amount += amount;
      byTax.set(key, entry);
    }
  }
  return [...byTax.values()].map((entry) => ({ ...entry, amount: round2(entry.amount) }));
}

function summarize(pricedLines) {
  const subtotal = round2(pricedLines.reduce((sum, line) => sum + line.lineNet, 0));
  const taxRows = collectTaxRows(pricedLines);
  const taxAmount = round2(taxRows.reduce((sum, row) => sum + row.amount, 0));
  return { subtotal, taxRows, taxAmount, total: round2(subtotal + taxAmount) };
}

module.exports = {
  round2,
  normalizeUnitPrice,
  priceLine,
  collectTaxRows,
  summarize,
};
