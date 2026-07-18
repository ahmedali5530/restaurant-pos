import {InventoryPurchase, InventoryPurchaseItem} from "@/api/model/inventory_purchase.ts";
import {User} from "@/api/model/user.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {InventorySupplier} from "@/api/model/inventory_supplier.ts";
import {Document} from '@/api/model/document.ts';
import { LifecycleFields } from "@/api/model/inventory_document.ts";
import { DateTime } from "surrealdb";

export interface InventoryPurchaseReturn extends LifecycleFields {
  id: string
  purchase?: InventoryPurchase
  created_at: DateTime
  created_by: User
  invoice_number: number
  items: InventoryPurchaseReturnItem[]
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  documents?: Document[]
}

export interface InventoryPurchaseReturnItem {
  id: string
  item: InventoryItem
  purchase_item?: InventoryPurchaseItem
  quantity: number
  purchased?: number
  price?: number
  comments?: string
  purchase_return?: InventoryPurchaseReturn
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  supplier?: InventorySupplier
}
