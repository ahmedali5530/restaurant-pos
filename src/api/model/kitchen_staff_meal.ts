import {DateTime} from "surrealdb";
import {Dish} from "@/api/model/dish.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryWasteItem} from "@/api/model/inventory_waste.ts";
import {KitchenReconciliation} from "@/api/model/kitchen_reconciliation.ts";
import {User} from "@/api/model/user.ts";

export interface KitchenStaffMeal {
  id: string;
  reconciliation: KitchenReconciliation;
  item: InventoryItem;
  quantity: number;
  notes?: string;
  dish?: Dish;
  created_at: DateTime;
  created_by: User;
  ledger_waste_item?: InventoryWasteItem;
}
