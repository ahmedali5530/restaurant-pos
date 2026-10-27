import type {ID} from "@/api/model/common.ts";
import type {Dish} from "@/api/model/dish.ts";
import type {DateTime} from "surrealdb";

/** Per parent-dish override for a modifier option's FOH availability. */
export interface MenuItemModifierAvailability extends ID {
  parent: Dish | string
  option: Dish | string
  /** false = 86 for this parent only; missing/true = inherit global sold-out. */
  available?: boolean | null
  /** Optional sale limit under this parent; null = unlimited (global may still apply). */
  available_qty?: number | null
  available_qty_set_at?: DateTime | string | null
}
