import { allocateInventoryProportionally } from "@/lib/inventory/rounding.ts";
import type { CostAllocator } from "@/lib/inventory/purchase-cost/types.ts";
import { PurchaseCostAllocationError } from "@/lib/inventory/purchase-cost/validate.ts";

export const allocateByWeight: CostAllocator = (total, lines) => {
  if (lines.some((l) => l.weight == null || !Number.isFinite(l.weight))) {
    throw new PurchaseCostAllocationError(
      "Allocation by weight is not available until line weights are supported"
    );
  }
  return allocateInventoryProportionally(
    total,
    lines.map((l) => ({ id: l.id, weight: Math.max(0, Number(l.weight) || 0) }))
  );
};
