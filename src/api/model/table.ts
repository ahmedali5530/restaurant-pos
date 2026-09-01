import { ID, Name, Priority } from "@/api/model/common.ts";
import { Category } from "@/api/model/category.ts";
import { PaymentType } from "@/api/model/payment_type.ts";
import { OrderType } from "@/api/model/order_type.ts";
import { Floor } from "@/api/model/floor.ts";
import { DateTime } from "surrealdb";

export interface Table extends ID, Name, Priority {
  number: string
  capacity?: number
  ask_for_covers?: boolean
  allow_multiple_orders?: boolean

  background?: string
  color?: string

  height?: number
  width?: number
  x?: number
  y?: number
  rounded?: string

  floor?: Floor

  categories?: Category[]
  order_types?: OrderType[]
  payment_types?: PaymentType[]

  is_block?: boolean
  block_source?: string

  is_locked?: boolean
  locked_at?: DateTime
  locked_by?: string

  deleted_at?: DateTime
}

export const TABLE_FETCHES = ['floor', 'categories', 'payment_types', 'order_types'];