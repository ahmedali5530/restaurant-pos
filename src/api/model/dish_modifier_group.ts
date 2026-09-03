import { Dish } from "@/api/model/dish.ts";
import { ModifierGroup } from "@/api/model/modifier_group.ts";
import { ID } from "@/api/model/common.ts";

export interface DishModifierGroup extends ID{
  in: Dish
  out: ModifierGroup
  required_modifiers?: number
  should_auto_open?: boolean
  has_required_modifiers?: boolean
  should_auto_select?: boolean
  priority?: number
}
