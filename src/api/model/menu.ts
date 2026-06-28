import {Dish} from "@/api/model/dish.ts";
import {Tax} from "@/api/model/tax.ts";
import { DateTime } from "surrealdb";

export type TaxMode = 'exclusive' | 'inclusive';

export interface Menu {
  id: string
  name: string
  end_time?: DateTime
  ends_on_next_day?: boolean
  items: MenuMenuItem[]
  start_from?: DateTime
  active?: boolean

  deleted_at?: DateTime
}

export interface MenuMenuItem {
  id: string
  price?: number
  base_price?: number
  menu_item: Dish
  tax?: Tax
  taxes?: Tax[]
  tax_mode?: TaxMode
  active?: boolean
}