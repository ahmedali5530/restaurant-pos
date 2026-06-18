import {DateTime} from "surrealdb";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {User} from "@/api/model/user.ts";

export interface StockTransfer {
  id: string;
  from_kitchen?: Kitchen;
  to_kitchen?: Kitchen;
  from_store?: InventoryStore;
  to_store?: InventoryStore;
  created_at: DateTime;
  created_by: User;
  notes?: string;
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string;
  transfer: StockTransfer;
  item: InventoryItem;
  quantity: number;
}
