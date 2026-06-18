import {InventorySupplier} from "@/api/model/inventory_supplier.ts";
import {InventoryCategory} from "@/api/model/inventory_category.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";

export type InventoryItemType = 'raw' | 'semi_finished' | 'finished';

export interface InventoryItem{
  id: string
  name: string
  code?: string
  uom?: string
  base_quantity?: number
  item_types?: InventoryItemType[]
  suppliers: InventorySupplier[]
  category: InventoryCategory
  stores: InventoryStore[]
  price: number
  average_price: number
}