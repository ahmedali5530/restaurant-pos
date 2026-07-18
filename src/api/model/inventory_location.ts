import { DateTime } from "surrealdb";
import { InventoryStore } from "@/api/model/inventory_store.ts";
import { Kitchen } from "@/api/model/kitchen.ts";

/**
 * Unified inventory location.
 * Ledger inventory_location fields store inventory_location ids (stock source of truth).
 * linked_store / linked_kitchen are optional POS/admin shims, not stock keys.
 */
export type InventoryLocationType =
  | "Warehouse"
  | "Store"
  | "Kitchen"
  | "Bakery"
  | "Bar"
  | "Freezer"
  | "Cold Room"
  | "Production";

export const INVENTORY_LOCATION_TYPES: InventoryLocationType[] = [
  "Warehouse",
  "Store",
  "Kitchen",
  "Bakery",
  "Bar",
  "Freezer",
  "Cold Room",
  "Production",
];

export interface InventoryLocation {
  id: string;
  created_at?: DateTime;
  name: string;
  type: InventoryLocationType | string;
  linked_store?: InventoryStore | string;
  linked_kitchen?: Kitchen | string;
  is_active?: boolean;
}
