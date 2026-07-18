/**
 * Inventory feature settings (Phase 9 defaults + Phase 2 ledger cutover flag).
 * Stored in the generic `setting` table under INVENTORY_SETTINGS_KEY.
 */
export const INVENTORY_SETTINGS_KEY = "inventory_settings";

export type InventoryCostingMethod = "average" | "fifo" | "fefo";

export interface InventorySettings {
  /** When true, stock reads come from inventory_ledger instead of movement tables. */
  inventory_ledger_enabled: boolean;
  enableBatchTracking: boolean;
  enableExpiryTracking: boolean;
  enableManufacturingDate: boolean;
  costing: InventoryCostingMethod;
  requireBatchSelection: boolean;
}

export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = {
  inventory_ledger_enabled: true,
  enableBatchTracking: false,
  enableExpiryTracking: false,
  enableManufacturingDate: false,
  costing: "average",
  requireBatchSelection: false,
};
