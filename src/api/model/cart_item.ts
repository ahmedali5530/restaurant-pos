import { Dish } from "@/api/model/dish.ts";
import { ModifierGroup } from "@/api/model/modifier_group.ts";
import { DishModifierGroup } from "@/api/model/dish_modifier_group.ts";
import { DateTime } from "surrealdb";

export enum MenuItemType {
  new = 'new',
  old = 'old'
}
export interface MenuItem {
  quantity: number
  price?: number

  seat?: string
  comments?: string

  serviceCharges?: number

  dish: Dish
  category?: string

  id: string

  group?: ModifierGroup
  modifiers?: Dish[]
  selectedGroups?: CartModifierGroup[]
  isModifier?: boolean

  level: number
  isSelected?: boolean
  isHold?: boolean

  newOrOld: MenuItemType

  /** When set from a modifier line, limits which dish-attached groups open in POS. */
  allowedNextGroupIds?: string[]

  created_at?: DateTime
  updated_at?: DateTime
  deleted_at?: DateTime
}

export interface CartModifierGroup extends DishModifierGroup {
  selected_quantity?: number
  selectedModifiers?: MenuItem[]
  modifiers?: MenuItem[]
}
