import {DateTime} from "surrealdb";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryWasteItem} from "@/api/model/inventory_waste.ts";
import {KitchenReconciliation} from "@/api/model/kitchen_reconciliation.ts";
import {User} from "@/api/model/user.ts";

export interface KitchenWaste {
  id: string;
  reconciliation: KitchenReconciliation;
  item: InventoryItem;
  quantity: number;
  reason?: string;
  created_at: DateTime;
  created_by: User;
  ledger_waste_item?: InventoryWasteItem;
}
