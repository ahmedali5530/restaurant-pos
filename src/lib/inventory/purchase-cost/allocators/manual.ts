import { roundCurrency } from "@/lib/discount-engine/rounding.ts";
import type { CostAllocator } from "@/lib/inventory/purchase-cost/types.ts";
import { PurchaseCostAllocationError } from "@/lib/inventory/purchase-cost/validate.ts";

export const allocateManual: CostAllocator = (total, lines, extra) => {
  const allocs = extra.manual_allocations ?? [];
  const byId = new Map(allocs.map((a) => [a.purchase_item_id, Number(a.amount) || 0]));
  const result = lines.map((l) => ({
    id: l.id,
    amount: roundCurrency(byId.get(l.id) ?? 0),
  }));
  const sum = roundCurrency(result.reduce((s, r) => s + r.amount, 0));
  const expected = roundCurrency(total);
  if (Math.abs(sum - expected) > 0.01) {
    throw new PurchaseCostAllocationError(
      `Manual allocation for "${extra.name}" sums to ${sum}, expected ${expected}`
    );
  }
  return result;
};
