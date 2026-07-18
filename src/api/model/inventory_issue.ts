import {User} from "@/api/model/user.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Document} from '@/api/model/document.ts';
import { LifecycleFields } from "@/api/model/inventory_document.ts";
import { DateTime } from "surrealdb";

export interface InventoryIssue extends LifecycleFields {
  id: string
  created_at: DateTime
  created_by: User
  kitchen?: Kitchen
  issued_to?: User
  items: InventoryIssueItem[]
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  invoice_number?: number
  documents?: Document[]
}

export interface InventoryIssueItem {
  id: string
  item: InventoryItem
  requested?: number
  quantity: number
  price: number
  comments?: string
  code?: string
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  issue?: InventoryIssue
}
