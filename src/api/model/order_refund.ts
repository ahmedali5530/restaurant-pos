import {Order} from "@/api/model/order.ts";
import {OrderItem} from "@/api/model/order_item.ts";
import {User} from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

export interface OrderRefund {
  id: string
  order: Order
  items: OrderItem[]
  created_at: DateTime
  manager: User
  logged_in_user: User
  reason?: string
}