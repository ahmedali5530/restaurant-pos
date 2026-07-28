import {DateTime} from "surrealdb";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {User} from "@/api/model/user.ts";
import { LifecycleFields } from "@/api/model/inventory_document.ts";

export interface StockTransfer extends LifecycleFields {
  id: string;
  /** @deprecated use from_location */
  from_kitchen?: Kitchen;
  /** @deprecated use to_location */
  to_kitchen?: Kitchen;
  from_location?: InventoryLocation;
  to_location?: InventoryLocation;
  /** @deprecated use from_location */
  from_store?: InventoryStore;
  /** @deprecated use to_location */
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
