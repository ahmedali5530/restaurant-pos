import { LifecycleFields } from "@/api/model/inventory_document.ts";
import { InventoryItem } from "@/api/model/inventory_item.ts";
import { InventoryLocation } from "@/api/model/inventory_location.ts";
import { InventoryStore } from "@/api/model/inventory_store.ts";
import { User } from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

export type InventoryAdjustmentReason =
  | "audit"
  | "correction"
  | "lost"
  | "damaged"
  | "found"
  | "opening_balance";

export const INVENTORY_ADJUSTMENT_REASON_VALUES: InventoryAdjustmentReason[] = [
  "audit",
  "correction",
  "lost",
  "damaged",
  "found",
  "opening_balance",
];

/** @deprecated Prefer INVENTORY_ADJUSTMENT_REASON_VALUES + i18n labels */
export const INVENTORY_ADJUSTMENT_REASONS: Array<{
  label: string;
  value: InventoryAdjustmentReason;
}> = INVENTORY_ADJUSTMENT_REASON_VALUES.map((value) => ({
  label: value.replace(/_/g, " "),
  value,
}));

export interface InventoryAdjustment extends LifecycleFields {
  id: string;
  created_at: DateTime;
  created_by?: User;
  invoice_number: number;
  reason: InventoryAdjustmentReason | string;
  notes?: string;
  location?: InventoryLocation;
  /** @deprecated use location */
  store?: InventoryStore;
  items?: InventoryAdjustmentItem[];
}

export interface InventoryAdjustmentItem {
  id: string;
  adjustment?: InventoryAdjustment | string;
  item: InventoryItem;
  location?: InventoryLocation;
  /** @deprecated use location */
  store?: InventoryStore;
  /** Signed quantity: positive increases stock, negative decreases. */
  quantity_change: number;
  unit_cost?: number;
  comments?: string;
}
