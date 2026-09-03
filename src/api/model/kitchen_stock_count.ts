import {DateTime} from "surrealdb";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {KitchenReconciliation} from "@/api/model/kitchen_reconciliation.ts";
import {User} from "@/api/model/user.ts";

export interface KitchenStockCount {
  id: string;
  reconciliation: KitchenReconciliation;
  item: InventoryItem;
  quantity: number;
  counted_at: DateTime;
  counted_by: User;
}
