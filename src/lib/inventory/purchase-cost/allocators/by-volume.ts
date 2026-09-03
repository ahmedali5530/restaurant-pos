import { allocateProportionally } from "@/lib/discount-engine/rounding.ts";
import type { CostAllocator } from "@/lib/inventory/purchase-cost/types.ts";
import { PurchaseCostAllocationError } from "@/lib/inventory/purchase-cost/validate.ts";

export const allocateByVolume: CostAllocator = (total, lines) => {
  if (lines.some((l) => l.volume == null || !Number.isFinite(l.volume))) {
    throw new PurchaseCostAllocationError(
      "Allocation by volume is not available until line volumes are supported"
    );
  }
  return allocateProportionally(
    total,
    lines.map((l) => ({ id: l.id, weight: Math.max(0, Number(l.volume) || 0) }))
  );
};
