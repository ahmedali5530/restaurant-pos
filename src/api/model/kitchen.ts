import { ID, Name, Priority } from "@/api/model/common.ts";
import { Printer } from "@/api/model/printer.ts";
import { Dish } from "@/api/model/dish.ts";
import { Order } from "@/api/model/order.ts";
import { OrderItemKitchen } from "@/api/model/order_item_kitchen.ts";
import {DateTime} from "surrealdb";

export interface Kitchen extends ID, Name, Priority{
  items: Dish[]
  printers: Printer[]

  deleted_at?: DateTime
}

/** One fire/batch of kitchen stage rows (same order + same created_at second). */
export interface KitchenOrderBatch {
  batchKey: string
  createdAt?: DateTime | string
  items: OrderItemKitchen[]
}

/** Order ticket on the KDS: one or more batches (original + addons). */
export interface KitchenOrder {
  order: Order
  batches: KitchenOrderBatch[]
}

/** Flat single-batch ticket (completed list / recall). */
export interface KitchenOrderTicket {
  order: Order
  batchKey: string
  createdAt?: DateTime | string
  items: OrderItemKitchen[]
}

export const KITCHEN_FETCHES = [
  'items', 'printers'
]
