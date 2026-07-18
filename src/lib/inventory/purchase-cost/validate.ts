import type { NormalizedPurchaseExtra } from "@/lib/inventory/purchase-cost/types.ts";
import type { AllocationLineInput } from "@/lib/inventory/purchase-cost/types.ts";

export class PurchaseCostAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseCostAllocationError";
  }
}

export const validateAllocationInput = (
  lines: AllocationLineInput[],
  extras: NormalizedPurchaseExtra[]
): void => {
  if (!lines.length) {
    throw new PurchaseCostAllocationError("No purchase lines to allocate");
  }

  for (const line of lines) {
    if (!line.id) {
      throw new PurchaseCostAllocationError("Purchase line missing id");
    }
    if (!Number.isFinite(line.quantity)) {
      throw new PurchaseCostAllocationError(`Invalid quantity for line ${line.id}`);
    }
    if (!Number.isFinite(line.price)) {
      throw new PurchaseCostAllocationError(`Invalid price for line ${line.id}`);
    }
  }

  for (const extra of extras) {
    if (!Number.isFinite(extra.amount)) {
      throw new PurchaseCostAllocationError(`Invalid amount for cost "${extra.name}"`);
    }
    if (extra.allocation_method === "manual") {
      const allocs = extra.manual_allocations ?? [];
      if (!allocs.length) {
        throw new PurchaseCostAllocationError(
          `Manual allocation for "${extra.name}" has no line amounts`
        );
      }
      const lineIds = new Set(lines.map((l) => l.id));
      for (const a of allocs) {
        if (!lineIds.has(a.purchase_item_id)) {
          throw new PurchaseCostAllocationError(
            `Manual allocation for "${extra.name}" references unknown line ${a.purchase_item_id}`
          );
        }
      }
    }
    if (extra.allocation_method === "by_weight") {
      const missing = lines.some((l) => l.weight == null || !Number.isFinite(Number(l.weight)));
      if (missing) {
        throw new PurchaseCostAllocationError(
          `Allocation by weight for "${extra.name}" requires weight on every line (not yet supported)`
        );
      }
    }
    if (extra.allocation_method === "by_volume") {
      const missing = lines.some((l) => l.volume == null || !Number.isFinite(Number(l.volume)));
      if (missing) {
        throw new PurchaseCostAllocationError(
          `Allocation by volume for "${extra.name}" requires volume on every line (not yet supported)`
        );
      }
    }
  }
};
