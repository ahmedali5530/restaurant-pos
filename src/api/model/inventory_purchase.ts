import {User} from "@/api/model/user.ts";
import {InventoryPurchaseOrder} from "@/api/model/inventory_purchase_order.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventorySupplier} from "@/api/model/inventory_supplier.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Document} from '@/api/model/document.ts';
import { LifecycleFields } from "@/api/model/inventory_document.ts";
import { DateTime } from "surrealdb";

export interface InventoryPurchaseExtra {
  name: string
  amount: number
}

export interface InventoryPurchase extends LifecycleFields {
  id: string
  created_at: DateTime
  created_by: User
  invoice_number: number
  purchase_order?: InventoryPurchaseOrder
  items: InventoryPurchaseItem[]
  supplier?: InventorySupplier
  comments?: string
  documents?: Document[]
  method?: string
  payment_method?: string
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  tax_rate?: number
  tax_amount?: number
  extras?: InventoryPurchaseExtra[]
}

export interface InventoryPurchaseItem {
  id: string
  item: InventoryItem
  quantity: number
  requested?: number
  price: number
  base_quantity: number
  expiry_date?: string
  manufacturing_date?: string
  comments?: string
  supplier?: InventorySupplier
  code?: string
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  is_done?: boolean
  purchase?: InventoryPurchase
  taxable?: boolean
}
