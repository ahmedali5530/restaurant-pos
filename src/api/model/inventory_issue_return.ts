import {User} from "@/api/model/user.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryIssue, InventoryIssueItem} from "@/api/model/inventory_issue.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Document} from '@/api/model/document.ts';
import { LifecycleFields } from "@/api/model/inventory_document.ts";
import { DateTime } from "surrealdb";

export interface InventoryIssueReturn extends LifecycleFields {
  id: string
  created_at: DateTime
  created_by: User
  kitchen?: Kitchen
  issued_to?: User
  items: InventoryIssueReturnItem[]
  issuance?: InventoryIssue
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  invoice_number: number
  documents?: Document[]
}

export interface InventoryIssueReturnItem {
  id: string
  item: InventoryItem
  issued_item?: InventoryIssueItem
  issued?: number
  quantity: number
  price?: number
  comments?: string
  location?: InventoryLocation
  /** @deprecated use location */
  store?: InventoryStore
  issue_return?: InventoryIssueReturn
}
