import { allocateProportionally } from "@/lib/discount-engine/rounding.ts";
import type { CostAllocator } from "@/lib/inventory/purchase-cost/types.ts";

export const allocateByValue: CostAllocator = (total, lines) =>
  allocateProportionally(
    total,
    lines.map((l) => ({ id: l.id, weight: Math.max(0, l.value) }))
  );
