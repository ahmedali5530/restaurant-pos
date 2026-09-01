import {InventoryPurchase, InventoryPurchaseItem} from "@/api/model/inventory_purchase.ts";
import {InventoryIssue, InventoryIssueItem} from "@/api/model/inventory_issue.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {User} from "@/api/model/user.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {Document} from '@/api/model/document.ts';
import { LifecycleFields } from "@/api/model/inventory_document.ts";
import { DateTime } from "surrealdb";

export interface InventoryWaste extends LifecycleFields {
  id: string
  purchase?: InventoryPurchase
  issue?: InventoryIssue
  created_at: DateTime
  created_by: User
  invoice_number: number
  items: InventoryWasteItem[]
  documents?: Document[]
}

export interface InventoryWasteItem {
  id: string
  item: InventoryItem
  purchase_item?: InventoryPurchaseItem
  issue_item?: InventoryIssueItem
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  quantity: number
  price?: number
  comments?: string
  documents?: string[]
  source?: string
  waste?: InventoryWaste
}
