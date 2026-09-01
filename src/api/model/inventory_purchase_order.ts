import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventorySupplier} from "@/api/model/inventory_supplier.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Document} from '@/api/model/document.ts';
import {User} from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

export interface InventoryPurchaseOrder {
  id: string
  po_number: number
  created_at: DateTime
  status: string
  supplier?: InventorySupplier
  items: InventoryPurchaseOrderItem[]
  documents?: Document[]
  submitted_at?: DateTime
  submitted_by?: User
  approved_at?: DateTime
  approved_by?: User
  rejected_at?: DateTime
  rejected_by?: User
}

export interface InventoryPurchaseOrderItem {
  id: string
  item: InventoryItem
  quantity: number
  price?: number
  supplier?: InventorySupplier
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  purchase_order?: InventoryPurchaseOrder
}

export enum PurchaseOrderStatus {
  draft = 'Draft',
  pendingApproval = 'Pending Approval',
  approved = 'Approved',
  fulfilled = 'Fulfilled',
}
