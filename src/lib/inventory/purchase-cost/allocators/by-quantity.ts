import { allocateInventoryProportionally } from "@/lib/inventory/rounding.ts";
import type { CostAllocator } from "@/lib/inventory/purchase-cost/types.ts";

export const allocateByQuantity: CostAllocator = (total, lines) =>
  allocateInventoryProportionally(
    total,
    lines.map((l) => ({ id: l.id, weight: Math.max(0, Math.abs(l.quantity)) }))
  );
