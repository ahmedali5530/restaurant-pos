import {User} from "@/api/model/user.ts";
import {Order} from "@/api/model/order.ts";
import {OrderItem} from "@/api/model/order_item.ts";
import { DateTime } from "surrealdb";

export enum OrderVoidReason {
  FOHNotMade = 'FOH Not Made',
  BOHNotMade = 'BOH Not Made',
  GuestNotMade = 'Guest Not Made',
  FOHMade = 'FOH Made',
  BOHMade = 'BOH Made',
  GuestMade = 'Guest Made',
  PunchByMistake = 'Punch By Mistake',
  Testing = 'Testing',
}

export interface OrderVoid {
  id: string
  comments?: string
  reason: string
  deleted_by: User
  created_at: DateTime
  order?: Order
  order_item: OrderItem
  quantity: number
  items?: OrderItem[]
}