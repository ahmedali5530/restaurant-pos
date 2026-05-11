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

export interface KitchenOrder {
  order: Order
  items: OrderItemKitchen[]
}

export const KITCHEN_FETCHES = [
  'items', 'printers'
]