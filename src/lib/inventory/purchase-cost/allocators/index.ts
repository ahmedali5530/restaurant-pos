import type { PurchaseAllocationMethod } from "@/api/model/inventory_purchase.ts";
import type { CostAllocator } from "@/lib/inventory/purchase-cost/types.ts";
import { allocateByValue } from "@/lib/inventory/purchase-cost/allocators/by-value.ts";
import { allocateByQuantity } from "@/lib/inventory/purchase-cost/allocators/by-quantity.ts";
import { allocateEqual } from "@/lib/inventory/purchase-cost/allocators/equal.ts";
import { allocateManual } from "@/lib/inventory/purchase-cost/allocators/manual.ts";
import { allocateByWeight } from "@/lib/inventory/purchase-cost/allocators/by-weight.ts";
import { allocateByVolume } from "@/lib/inventory/purchase-cost/allocators/by-volume.ts";
import { PurchaseCostAllocationError } from "@/lib/inventory/purchase-cost/validate.ts";

const REGISTRY: Record<PurchaseAllocationMethod, CostAllocator> = {
  by_value: allocateByValue,
  by_quantity: allocateByQuantity,
  equal: allocateEqual,
  manual: allocateManual,
  by_weight: allocateByWeight,
  by_volume: allocateByVolume,
};

export const getAllocator = (method: PurchaseAllocationMethod): CostAllocator => {
  const allocator = REGISTRY[method];
  if (!allocator) {
    throw new PurchaseCostAllocationError(`Unknown allocation method: ${method}`);
  }
  return allocator;
};

export const registerAllocator = (
  method: PurchaseAllocationMethod,
  allocator: CostAllocator
): void => {
  REGISTRY[method] = allocator;
};
