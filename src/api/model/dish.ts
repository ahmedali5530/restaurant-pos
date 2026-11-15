import { Category } from "@/api/model/category.ts";
import { ID, Name, Priority } from "@/api/model/common.ts";
import { Tax } from "@/api/model/tax.ts";
import { MenuModifierOverrides, TaxMode } from "@/api/model/menu.ts";
import { DishModifierGroup } from "@/api/model/dish_modifier_group.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import { DateTime } from "surrealdb";
import {Document} from '@/api/model/document.ts'
import {Workflow} from "@/api/model/workflow.ts";

export interface Dish extends ID, Name, Priority {
  allow_half?: boolean
  categories?: Category[]
  cost?: number
  number: string
  /** Primary barcode / UPC / EAN for Quick Order scanning; optional */
  barcode?: string | null
  /** Extra barcodes (case, sleeve, alt UPCs); scanned codes match any of these */
  barcodes?: string[] | null
  /** When false, dish is sold out (86). Missing/true = sellable. */
  available?: boolean | null
  /** Optional sale limit; null/undefined = unlimited. Counted since available_qty_set_at. */
  available_qty?: number | null
  /** When available_qty was last set/changed (sale window start). */
  available_qty_set_at?: DateTime | string | null
  /**
   * When true, Menu / Quick Order prompt for quantity after scan or tap.
   * False/null = add qty 1 immediately (default).
   */
  ask_quantity?: boolean | null
  position?: number
  price: number
  photo?: ArrayBuffer
  dish_photo?: Document
  modifier_groups?: DishModifierGroup[]
  items?: MenuItemRecipe[]
  allow_service_charges?: boolean
  discount?: number
  tax?: Tax
  taxes?: Tax[]
  tax_mode?: TaxMode
  menu_name?: string
  /** Per-menu modifier price overrides from the active menu_menu_item */
  menu_modifier_overrides?: MenuModifierOverrides | null

  workflow?: Workflow
  stage_overrides?: Record<string, string>

  deleted_at?: DateTime
  created_at?: DateTime
}

export interface MenuItemRecipe extends ID {
  dish?: Dish // Reference to the dish
  is_price_locked?: boolean
  cost: number
  item: InventoryItem
  quantity: number
}

export const DISH_FETCHES = [
  'categories', 'tax', 'items', 'workflow', 'workflow.stages', 'workflow.stages.kitchen'
]