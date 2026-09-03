import { allocateProportionally } from "@/lib/discount-engine/rounding.ts";
import type { CostAllocator } from "@/lib/inventory/purchase-cost/types.ts";

export const allocateByQuantity: CostAllocator = (total, lines) =>
  allocateProportionally(
    total,
    lines.map((l) => ({ id: l.id, weight: Math.max(0, Math.abs(l.quantity)) }))
  );
