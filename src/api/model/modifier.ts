import { ID } from "@/api/model/common.ts";
import { Dish } from "@/api/model/dish.ts";
import { ModifierGroup } from "@/api/model/modifier_group.ts";

export interface Modifier extends ID {
  modifier: Dish
  price: number
  allowed_next_groups?: ModifierGroup[]
}
