import {DateTime} from "surrealdb";
import {User} from "@/api/model/user.ts";
import {Order} from "@/api/model/order.ts";

export interface OrderSplit {
  id: string
  created_at: DateTime
  created_by: User
  new_orders: Order[]
  new_items: Record<string, string[]> // {new_order_id: [item_id]}
  old_order: Order
  old_items: Record<string, string[]> // {order_id: [item_id]}
}