import { ID } from "@/api/model/common.ts";
import { Discount, DiscountScope, DiscountValueType, TaxTreatment } from "@/api/model/discount.ts";
import { DiscountReason } from "@/api/model/discount_reason.ts";
import { Order } from "@/api/model/order.ts";
import { OrderItem } from "@/api/model/order_item.ts";
import { User } from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

export type DiscountApplicationType = 'automatic' | 'manual'

export interface LineAllocation {
  order_item: string | OrderItem
  amount: number
}

export interface OrderDiscount extends ID {
  order: Order | string
  discount: Discount | string
  name: string
  scope: DiscountScope
  value_type: DiscountValueType
  applied_amount: number
  applied_rate?: number | null
  base_amount: number
  tax_treatment: TaxTreatment
  application_type: DiscountApplicationType
  reason?: DiscountReason | string
  reason_text?: string
  applied_by?: User | string
  approved_by?: User | string
  auth_method?: string
  order_items?: (OrderItem | string)[]
  line_allocations?: LineAllocation[]
  created_at?: DateTime
  removed_at?: DateTime
  removed_by?: User | string
}
