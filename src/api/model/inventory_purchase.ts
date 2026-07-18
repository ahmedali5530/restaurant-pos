import {User} from "@/api/model/user.ts";
import {InventoryPurchaseOrder} from "@/api/model/inventory_purchase_order.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventorySupplier} from "@/api/model/inventory_supplier.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Document} from '@/api/model/document.ts';
import { LifecycleFields } from "@/api/model/inventory_document.ts";
import { DateTime } from "surrealdb";

export type PurchaseCostCategory =
  | "Shipping"
  | "Freight"
  | "Insurance"
  | "Customs"
  | "ImportDuty"
  | "Handling"
  | "Tax"
  | "Discount"
  | "Miscellaneous"
  | string;

export type PurchaseAllocationMethod =
  | "by_value"
  | "by_quantity"
  | "by_weight"
  | "by_volume"
  | "equal"
  | "manual";

export type PurchaseInventoryTreatment = "capitalize" | "expense" | "ignore";

export type PurchaseTaxBehavior =
  | "recoverable"
  | "non_recoverable"
  | "inclusive"
  | "exclusive";

export interface PurchaseExtraManualAllocation {
  purchase_item_id: string
  amount: number
}

export interface InventoryPurchaseExtra {
  name: string
  amount: number
  category?: PurchaseCostCategory
  allocation_method?: PurchaseAllocationMethod
  inventory_treatment?: PurchaseInventoryTreatment
  tax_behavior?: PurchaseTaxBehavior | null
  notes?: string
  /** Reserved for future GL journal mapping */
  account_hint?: string
  manual_allocations?: PurchaseExtraManualAllocation[]
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
  /** Written at post — audit snapshot of landed-cost allocation */
  cost_allocation_snapshot?: any
}

export interface InventoryPurchaseItem {
  id: string
  item: InventoryItem
  quantity: number
  requested?: number
  /** Supplier unit price (editable on draft) */
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
  /** Snapshot of supplier price at post */
  purchase_price?: number
  /** Per-unit capitalized extras (excl. tax/discount buckets) */
  allocated_extra_cost?: number
  /** Per-unit non-recoverable tax */
  allocated_tax?: number
  /** Per-unit discount contribution (typically ≤ 0) */
  allocated_discount?: number
  /** Final inventory unit cost at post */
  final_unit_cost?: number
  /** final_unit_cost × quantity */
  total_inventory_cost?: number
}
