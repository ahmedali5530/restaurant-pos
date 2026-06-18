import {InventoryItem} from "@/api/model/inventory_item.ts";
import {KitchenReconciliation} from "@/api/model/kitchen_reconciliation.ts";

export interface KitchenReconciliationItem {
  id: string;
  reconciliation: KitchenReconciliation;
  item: InventoryItem;
  opening_stock: number;
  issued_qty: number;
  transfers_in: number;
  transfers_out: number;
  theoretical_consumption: number;
  expected_stock: number;
  physical_count?: number | null;
  waste_qty: number;
  staff_meal_qty: number;
  complimentary_qty: number;
  actual_consumption: number;
  variance: number;
  posted_to_ledger: boolean;
}
