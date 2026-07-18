export { allocatePurchaseCosts, PurchaseCostAllocationService } from "@/lib/inventory/purchase-cost/allocate.ts";
export {
  normalizePurchaseExtra,
  normalizePurchaseExtras,
  inferCategoryFromName,
  buildTypedExtra,
  defaultTreatmentForCategory,
} from "@/lib/inventory/purchase-cost/normalize.ts";
export { PurchaseCostAllocationError, validateAllocationInput } from "@/lib/inventory/purchase-cost/validate.ts";
export type {
  AllocatePurchaseCostsInput,
  PurchaseCostAllocationResult,
  LineAllocationResult,
  NormalizedPurchaseExtra,
  ComponentAllocationBreakdown,
} from "@/lib/inventory/purchase-cost/types.ts";
