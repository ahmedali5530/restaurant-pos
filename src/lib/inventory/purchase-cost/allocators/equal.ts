import { allocateInventoryProportionally } from "@/lib/inventory/rounding.ts";
import type { CostAllocator } from "@/lib/inventory/purchase-cost/types.ts";

export const allocateEqual: CostAllocator = (total, lines) =>
  allocateInventoryProportionally(
    total,
    lines.map((l) => ({ id: l.id, weight: 1 }))
  );
