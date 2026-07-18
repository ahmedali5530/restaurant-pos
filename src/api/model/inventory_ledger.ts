import { DateTime } from "surrealdb";
import { User } from "@/api/model/user.ts";
import { InventoryItem } from "@/api/model/inventory_item.ts";
import { InventoryLocation } from "@/api/model/inventory_location.ts";

/**
 * Reference types written into inventory_ledger.reference_type.
 * Signs follow computeStoreNet: purchases +, returns -, issues -, etc.
 */
export type InventoryLedgerReferenceType =
  | "purchase"
  | "purchase_return"
  | "issue"
  | "issue_return"
  | "waste"
  | "transfer_out"
  | "transfer_in"
  | "production_input"
  | "production_output"
  | "buffet_consumption"
  | "adjustment";

export interface InventoryLedger {
  id: string;
  created_at: DateTime;
  created_by?: User;
  business_date: string;
  inventory_item: InventoryItem;
  /** Stock location id (inventory_location). */
  inventory_location: InventoryLocation;
  quantity_change: number;
  unit_cost?: number;
  total_cost?: number;
  reference_type: InventoryLedgerReferenceType | string;
  reference_id: string;
  reference_item?: string;
  reversal_of?: InventoryLedger | string;
  notes?: string;
  /** Deterministic idempotency key: `${reference_type}:${reference_item_id}` */
  ledger_key: string;
  /** Phase 9 — only written when inventory settings enable batch/expiry. */
  batch_code?: string;
  expiry_date?: string;
  manufacturing_date?: string;
}

export type InventoryLedgerInput = {
  created_by?: string;
  business_date: string;
  inventory_item: string;
  inventory_location: string;
  quantity_change: number;
  unit_cost?: number;
  total_cost?: number;
  reference_type: InventoryLedgerReferenceType | string;
  reference_id: string;
  reference_item?: string;
  reversal_of?: string;
  notes?: string;
  ledger_key: string;
  batch_code?: string;
  expiry_date?: string;
  manufacturing_date?: string;
};
