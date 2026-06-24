import { ID, Name, Priority } from "@/api/model/common.ts";
import { DateTime } from "surrealdb";

/** @deprecated Use DiscountValueType instead — kept for service charge / tip compatibility */
export enum DiscountType {
  Fixed = 'Fixed',
  Percent = 'Percent',
}

export type DiscountScope = 'item' | 'category' | 'cart' | 'customer' | 'floor'

export type DiscountValueType = 'percent' | 'fixed_amount' | 'fixed_price'

export type DiscountApplicationMode = 'automatic' | 'manual' | 'both'

export type DiscountCategory =
  | 'manager'
  | 'staff'
  | 'vip'
  | 'corporate'
  | 'happy_hour'
  | 'category'
  | 'product'
  | 'floor'
  | 'damage_wastage'
  | 'service_recovery'
  | 'bulk_order'
  | 'manual'
  | 'scheduled'
  | 'buy_x_get_y'

export type StackingMode = 'allow' | 'prevent' | 'highest_wins' | 'priority'

export type TaxTreatment =
  | 'tax_before_discount'
  | 'tax_after_discount'
  | 'inclusive'
  | 'exclusive'

export interface DiscountSchedule {
  start_date?: string
  end_date?: string
  days_of_week?: number[]
  months?: number[]
  start_time?: string
  end_time?: string
  order_type_ids?: string[]
}

export interface DiscountTargets {
  item_ids?: string[]
  category_ids?: string[]
  customer_ids?: string[]
  customer_tags?: string[]
  floor_ids?: string[]
}

export interface BuyXGetYCondition {
  buy_quantity: number
  buy_targets: { item_ids?: string[]; category_ids?: string[] }
  get_quantity: number
  get_targets: { item_ids?: string[]; category_ids?: string[] }
  get_value_type: 'percent' | 'fixed_amount' | 'free'
  get_value: number
}

export interface Discount extends ID, Name, Priority {
  /** Legacy field — maps to value_type percent */
  type?: string
  /** Legacy min/max rate for variable manual discounts */
  min_rate?: number
  max_rate?: number
  max_cap?: number

  code?: string
  category?: DiscountCategory | string
  scope?: DiscountScope | string
  value_type?: DiscountValueType | string
  value?: number
  min_value?: number
  max_value?: number
  min_order_amount?: number
  application_mode?: DiscountApplicationMode | string
  schedules?: DiscountSchedule[]
  targets?: DiscountTargets
  conditions?: BuyXGetYCondition
  stacking_mode?: StackingMode | string
  stack_group?: string
  exclusive?: boolean
  stackable?: boolean
  tax_treatment?: TaxTreatment | string
  requires_reason?: boolean
  requires_approval?: boolean
  stackable_with_coupon?: boolean
  is_active?: boolean
  branch_id?: string
  applicable_floors?: string[]

  deleted_at?: DateTime
}

/** Normalize legacy type fields to value_type */
export const getDiscountValueType = (d: Discount): DiscountValueType => {
  if (d.value_type) {
    return d.value_type as DiscountValueType
  }
  if (d.type === DiscountType.Percent) {
    return 'percent'
  }
  if (d.type === DiscountType.Fixed) {
    return 'fixed_amount'
  }
  return 'percent'
}

export const getDiscountMinValue = (d: Discount): number => {
  return d.min_value ?? d.min_rate ?? 0
}

export const getDiscountMaxValue = (d: Discount): number => {
  return d.max_value ?? d.max_rate ?? d.min_rate ?? 0
}

export const getDiscountPrimaryValue = (d: Discount): number => {
  if (d.value !== undefined && d.value !== null) {
    return d.value
  }
  return getDiscountMinValue(d)
}
