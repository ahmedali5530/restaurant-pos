import { ID } from "@/api/model/common.ts";
import { Customer } from "@/api/model/customer.ts";
import { Discount, DiscountType } from "@/api/model/discount.ts";
import { Floor } from "@/api/model/floor.ts";
import { Tax } from "@/api/model/tax.ts";
import { OrderItem } from "@/api/model/order_item.ts";
import { OrderType } from "@/api/model/order_type.ts";
import { User } from "@/api/model/user.ts";
import { Table } from "@/api/model/table.ts";
import { OrderPayment } from "@/api/model/order_payment.ts";
import { OrderCoupon } from "@/api/model/order_coupon.ts";
import { DateTime } from "surrealdb";

export interface Order extends ID{
  covers?: number
  created_at: DateTime
  completed_at?: DateTime
  customer?: Customer
  floor: Floor
  table: Table
  auto_id: number
  invoice_number: number
  split?: number
  items: OrderItem[]
  order_type: OrderType
  status: string
  notes?: string

  discount?: Discount
  discount_amount?: number
  discount_rate?: number

  tax?: Tax
  tax_amount?: number

  service_charge_type?: string
  service_charge?: number
  service_charge_amount?: number

  tip?: number
  tip_amount?: number
  tip_type?: DiscountType

  user: User
  cashier?: User
  tags?: string[]

  delivery?: any

  extras?: OrderExtra[]

  payments?: OrderPayment[]

  coupon?: OrderCoupon
}

export interface OrderExtra extends ID{
  name: string
  value: number
}

export enum OrderStatus {
  'In Progress' = 'In Progress',
  Paid = 'Paid',
  Cancelled = 'Cancelled',
  Spilt = 'Spilt',
  Merged = 'Merged',
  Refunded = 'Refunded',
  Pending = 'Pending'
}

export const ORDER_FETCHES = [
  'items',
  'items.item',
  'item.item.categories',
  'item.item.modifiers',
  'table',
  'user',
  'cashier',
  'order_type',
  'customer',
  'discount',
  'tax',
  'payments',
  'payments.payment_type',
  'extras',
  'extras.order_extras',
  'coupon',
  'coupon.coupon'
];