import { roundCurrency } from "@/lib/discount-engine/rounding.ts";
import { safeNumber } from "@/lib/utils.ts";
import { taxAmount as computeTaxAmount, taxableSubtotal } from "@/lib/inventory/purchase.totals.ts";
import { getAllocator } from "@/lib/inventory/purchase-cost/allocators/index.ts";
import { normalizePurchaseExtras } from "@/lib/inventory/purchase-cost/normalize.ts";
import { validateAllocationInput } from "@/lib/inventory/purchase-cost/validate.ts";
import type {
  AllocatePurchaseCostsInput,
  AllocatorLine,
  ComponentAllocationBreakdown,
  LineAllocationResult,
  NormalizedPurchaseExtra,
  PurchaseCostAllocationResult,
} from "@/lib/inventory/purchase-cost/types.ts";

const isDiscountCategory = (category: string) => category === "Discount";
const isTaxCategory = (category: string) => category === "Tax";

const shouldCapitalize = (
  extra: NormalizedPurchaseExtra,
  settings: AllocatePurchaseCostsInput["settings"]
): boolean => {
  if (extra.inventory_treatment !== "capitalize") return false;

  if (isDiscountCategory(extra.category)) {
    return settings.enable_purchase_discounts !== false;
  }
  if (isTaxCategory(extra.category)) {
    if (settings.enable_purchase_taxes === false) return false;
    if (extra.tax_behavior === "recoverable" || extra.tax_behavior === "inclusive") {
      return false;
    }
    return true;
  }
  // Landed costs (shipping, freight, etc.)
  return settings.enable_landed_costs !== false;
};

const buildSyntheticTaxExtra = (
  input: AllocatePurchaseCostsInput
): NormalizedPurchaseExtra | null => {
  if (input.settings.enable_purchase_taxes === false) return null;

  const rate = safeNumber(input.tax_rate);
  let amount = safeNumber(input.tax_amount);
  if (!amount && rate) {
    amount = computeTaxAmount(
      taxableSubtotal(
        input.lines.map((l) => ({
          quantity: l.quantity,
          price: l.price,
          taxable: l.taxable,
        }))
      ),
      rate
    );
  }
  if (!amount) return null;

  const taxBehavior = input.settings.default_purchase_tax_behavior ?? "non_recoverable";
  const capitalize = taxBehavior === "non_recoverable";

  return {
    name: "Purchase Tax",
    amount: roundCurrency(amount),
    category: "Tax",
    allocation_method: "by_value",
    inventory_treatment: capitalize ? "capitalize" : "ignore",
    tax_behavior: taxBehavior,
    synthetic: true,
  };
};

/**
 * PurchaseCostAllocationService — pure, deterministic landed-cost allocation.
 * Called during purchase posting; never mutates documents itself.
 */
export const allocatePurchaseCosts = (
  input: AllocatePurchaseCostsInput
): PurchaseCostAllocationResult => {
  const settings = input.settings;
  const lines = input.lines.filter((l) => Number(l.quantity) !== 0);
  if (!lines.length) {
    return {
      lines: [],
      components: [],
      summary: {
        purchase_value: 0,
        capitalized_extras: 0,
        capitalized_tax: 0,
        capitalized_discount: 0,
        final_inventory_value: 0,
        expense_total: 0,
        ignored_total: 0,
      },
    };
  }

  const normalized = normalizePurchaseExtras(input.extras, settings);
  const syntheticTax = buildSyntheticTaxExtra(input);
  // Prefer explicit Tax extras; only add header tax if no Tax extra present
  const hasTaxExtra = normalized.some((e) => isTaxCategory(e.category));
  const components: NormalizedPurchaseExtra[] = [
    ...normalized,
    ...(syntheticTax && !hasTaxExtra ? [syntheticTax] : []),
  ];

  validateAllocationInput(lines, components);

  const allocatorLines: AllocatorLine[] = lines.map((l) => ({
    id: l.id,
    quantity: safeNumber(l.quantity),
    value: roundCurrency(safeNumber(l.price) * safeNumber(l.quantity)),
    weight: l.weight != null ? Number(l.weight) : undefined,
    volume: l.volume != null ? Number(l.volume) : undefined,
  }));

  const extraTotals = new Map<string, number>();
  const taxTotals = new Map<string, number>();
  const discountTotals = new Map<string, number>();
  for (const l of lines) {
    extraTotals.set(l.id, 0);
    taxTotals.set(l.id, 0);
    discountTotals.set(l.id, 0);
  }

  const breakdowns: ComponentAllocationBreakdown[] = [];
  let expenseTotal = 0;
  let ignoredTotal = 0;

  for (const extra of components) {
    const capitalize = shouldCapitalize(extra, settings);
    let lineAmounts: { purchase_item_id: string; amount: number }[] = [];

    if (extra.inventory_treatment === "expense") {
      expenseTotal = roundCurrency(expenseTotal + extra.amount);
    } else if (extra.inventory_treatment === "ignore" || !capitalize) {
      ignoredTotal = roundCurrency(ignoredTotal + extra.amount);
    } else {
      const allocator = getAllocator(extra.allocation_method);
      const allocated = allocator(extra.amount, allocatorLines, extra);
      lineAmounts = allocated.map((a) => ({
        purchase_item_id: a.id,
        amount: a.amount,
      }));

      for (const a of allocated) {
        if (isDiscountCategory(extra.category)) {
          discountTotals.set(a.id, roundCurrency((discountTotals.get(a.id) ?? 0) + a.amount));
        } else if (isTaxCategory(extra.category)) {
          taxTotals.set(a.id, roundCurrency((taxTotals.get(a.id) ?? 0) + a.amount));
        } else {
          extraTotals.set(a.id, roundCurrency((extraTotals.get(a.id) ?? 0) + a.amount));
        }
      }
    }

    breakdowns.push({
      name: extra.name,
      category: extra.category,
      amount: extra.amount,
      inventory_treatment: extra.inventory_treatment,
      allocation_method: extra.allocation_method,
      capitalized: capitalize && extra.inventory_treatment === "capitalize",
      line_amounts: lineAmounts,
    });
  }

  const results: LineAllocationResult[] = [];
  let purchaseValue = 0;
  let capitalizedExtras = 0;
  let capitalizedTax = 0;
  let capitalizedDiscount = 0;
  let finalInventoryValue = 0;

  for (const line of lines) {
    const qty = safeNumber(line.quantity);
    const purchasePrice = safeNumber(line.price);
    const lineValue = roundCurrency(purchasePrice * qty);
    const allocatedExtraTotal = extraTotals.get(line.id) ?? 0;
    const allocatedTaxTotal = taxTotals.get(line.id) ?? 0;
    const allocatedDiscountTotal = discountTotals.get(line.id) ?? 0;

    const totalInventoryCost = roundCurrency(
      lineValue + allocatedExtraTotal + allocatedTaxTotal + allocatedDiscountTotal
    );
    const finalUnitCost =
      qty !== 0 ? roundCurrency(totalInventoryCost / qty) : 0;

    // Per-unit bucket fields (as specified)
    const allocated_extra_cost = qty !== 0 ? roundCurrency(allocatedExtraTotal / qty) : 0;
    const allocated_tax = qty !== 0 ? roundCurrency(allocatedTaxTotal / qty) : 0;
    const allocated_discount = qty !== 0 ? roundCurrency(allocatedDiscountTotal / qty) : 0;

    results.push({
      purchase_item_id: line.id,
      quantity: qty,
      purchase_price: purchasePrice,
      allocated_extra_total: allocatedExtraTotal,
      allocated_tax_total: allocatedTaxTotal,
      allocated_discount_total: allocatedDiscountTotal,
      allocated_extra_cost,
      allocated_tax,
      allocated_discount,
      final_unit_cost: finalUnitCost,
      total_inventory_cost: totalInventoryCost,
    });

    purchaseValue = roundCurrency(purchaseValue + lineValue);
    capitalizedExtras = roundCurrency(capitalizedExtras + allocatedExtraTotal);
    capitalizedTax = roundCurrency(capitalizedTax + allocatedTaxTotal);
    capitalizedDiscount = roundCurrency(capitalizedDiscount + allocatedDiscountTotal);
    finalInventoryValue = roundCurrency(finalInventoryValue + totalInventoryCost);
  }

  // Absorb rounding drift on the last non-zero line so totals match capitalized pool
  const expectedFinal = roundCurrency(
    purchaseValue + capitalizedExtras + capitalizedTax + capitalizedDiscount
  );
  const drift = roundCurrency(expectedFinal - finalInventoryValue);
  if (drift !== 0 && results.length > 0) {
    const last = results[results.length - 1];
    last.total_inventory_cost = roundCurrency(last.total_inventory_cost + drift);
    if (last.quantity !== 0) {
      last.final_unit_cost = roundCurrency(last.total_inventory_cost / last.quantity);
    }
    finalInventoryValue = expectedFinal;
  }

  return {
    lines: results,
    components: breakdowns,
    summary: {
      purchase_value: purchaseValue,
      capitalized_extras: capitalizedExtras,
      capitalized_tax: capitalizedTax,
      capitalized_discount: capitalizedDiscount,
      final_inventory_value: finalInventoryValue,
      expense_total: expenseTotal,
      ignored_total: ignoredTotal,
    },
  };
};

/** Alias matching the plan service name */
export const PurchaseCostAllocationService = {
  allocate: allocatePurchaseCosts,
};
