import { Category } from "@/api/model/category.ts";
import { ID, Name, Priority } from "@/api/model/common.ts";
import { Tax } from "@/api/model/tax.ts";
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
  position?: number
  price: number
  photo?: ArrayBuffer
  dish_photo?: Document
  modifier_groups?: DishModifierGroup[]
  items?: MenuItemRecipe[]
  allow_service_charges?: boolean
  discount?: number
  tax?: Tax
  menu_name?: string

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