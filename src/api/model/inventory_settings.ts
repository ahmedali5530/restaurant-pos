/**
 * Inventory feature settings (Phase 9 defaults + Phase 2 ledger cutover flag).
 * Stored in the generic `setting` table under INVENTORY_SETTINGS_KEY.
 */
export const INVENTORY_SETTINGS_KEY = "inventory_settings";

export type InventoryCostingMethod = "average" | "fifo" | "fefo";

export type InventoryAllocationMethod = "by_value" | "by_quantity" | "equal";

export type InventoryPurchaseTaxBehavior = "recoverable" | "non_recoverable";

export interface InventorySettings {
  /** When true, stock reads come from inventory_ledger instead of movement tables. */
  inventory_ledger_enabled: boolean;
  enableBatchTracking: boolean;
  enableExpiryTracking: boolean;
  enableManufacturingDate: boolean;
  costing: InventoryCostingMethod;
  requireBatchSelection: boolean;
  /** Capitalize shipping/freight/etc. into inventory on purchase post. */
  enable_landed_costs: boolean;
  /** Allocate purchase discounts into inventory cost. */
  enable_purchase_discounts: boolean;
  /** Allocate non-recoverable purchase taxes into inventory cost. */
  enable_purchase_taxes: boolean;
  default_allocation_method: InventoryAllocationMethod;
  default_purchase_tax_behavior: InventoryPurchaseTaxBehavior;
}

export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = {
  inventory_ledger_enabled: true,
  enableBatchTracking: false,
  enableExpiryTracking: false,
  enableManufacturingDate: false,
  costing: "average",
  requireBatchSelection: false,
  enable_landed_costs: true,
  enable_purchase_discounts: true,
  enable_purchase_taxes: true,
  default_allocation_method: "by_value",
  default_purchase_tax_behavior: "non_recoverable",
};
