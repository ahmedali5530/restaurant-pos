import {User} from "@/api/model/user.ts";
import {Order} from "@/api/model/order.ts";
import {DateTime, RecordId, StringRecordId} from "surrealdb";

export interface OrderMerge {
  id: string
  created_at: DateTime
  created_by: User
  new_order: Order
  old_orders: Order[]
  old_items: Record<string, string[]> // {order_id: [item_id]}
  new_items: Record<string, string[]> // {new_order_id: [item_id]}
}

export type OrderMergeReference = string | RecordId | StringRecordId

export interface OrderMergeCreatePayload {
  created_at: Date
  created_by: OrderMergeReference
  new_order: OrderMergeReference
  old_orders: OrderMergeReference[]
  old_items: OrderMerge['old_items']
  new_items: OrderMerge['new_items']
}