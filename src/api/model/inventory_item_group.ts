import {InventoryItem} from "@/api/model/inventory_item.ts";

export interface InventoryItemGroup {
  id: string
  main_item: InventoryItem
  sub_items: InventoryItemGroupItem[]
  base_quantity: number
}

export interface InventoryItemGroupItem {
  id: string
  item: InventoryItem
  quantity: number
}