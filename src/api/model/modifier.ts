import { ID } from "@/api/model/common.ts";
import { Dish } from "@/api/model/dish.ts";
import { ModifierGroup } from "@/api/model/modifier_group.ts";

export interface ModifierNextGroupOverrideItem {
  nested_modifier_id: string
  price: number
  hidden?: boolean
}

export interface ModifierNextGroupOverride {
  group_id: string
  items: ModifierNextGroupOverrideItem[]
}

export interface Modifier extends ID {
  modifier: Dish
  price: number
  allowed_next_groups?: ModifierGroup[]
  next_group_overrides?: ModifierNextGroupOverride[]
}
