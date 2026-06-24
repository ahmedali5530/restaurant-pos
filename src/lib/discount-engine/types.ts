import type { Discount, DiscountCategory, DiscountScope, DiscountValueType, StackingMode, TaxTreatment } from '@/api/model/discount.ts'
import type { Customer } from '@/api/model/customer.ts'
import type { OrderItem } from '@/api/model/order_item.ts'
import type { OrderType } from '@/api/model/order_type.ts'
import type { OrderDiscount } from '@/api/model/order_discount.ts'
import type { User } from '@/api/model/user.ts'
import type { RoleDiscountPolicy } from '@/api/model/role_discount_policy.ts'

export interface EvaluableLineItem {
  id: string
  lineTotal: number
  itemId?: string
  categoryIds?: string[]
  quantity: number
}

export interface EvaluationContext {
  items: EvaluableLineItem[]
  itemsTotal: number
  customer?: Customer
  orderType?: OrderType
  floorId?: string
  now: Date
  taxRate?: number
  rules: Discount[]
  existingApplications: AppliedDiscountLine[]
  manualRequests?: ManualDiscountRequest[]
  policies?: RoleDiscountPolicy[]
  currentUser?: User
}

export interface ManualDiscountRequest {
  discountId: string
  rate?: number
  amount?: number
  orderItemIds?: string[]
  reasonId?: string
  reasonText?: string
  approvedBy?: User
  authMethod?: string
}

export interface DiscountCandidate {
  discount: Discount
  appliedAmount: number
  appliedRate?: number
  baseAmount: number
  scope: DiscountScope
  applicationType: 'automatic' | 'manual'
  targetItemIds?: string[]
  lineAllocations?: { orderItemId: string; amount: number }[]
  reasonId?: string
  reasonText?: string
  approvedBy?: User
  authMethod?: string
}

export interface AppliedDiscountLine {
  discountId: string
  orderDiscountId?: string
  name: string
  appliedAmount: number
  appliedRate?: number
  scope: DiscountScope
  valueType: DiscountValueType
  taxTreatment: TaxTreatment
  applicationType: 'automatic' | 'manual'
  lineAllocations?: { orderItemId: string; amount: number }[]
  reasonId?: string
  reasonText?: string
}

export interface EvaluationResult {
  candidates: DiscountCandidate[]
  applied: AppliedDiscountLine[]
  discountTotal: number
  taxableAmount: number
  taxAmount: number
  errors: string[]
}

export interface ApplyDiscountRequest extends ManualDiscountRequest {}

export interface CartTotals {
  itemsTotal: number
  discountTotal: number
  discountLines: AppliedDiscountLine[]
  taxableAmount: number
  taxAmount: number
  extrasTotal: number
  serviceChargeAmount: number
  couponAmount: number
  tipAmount: number
  grandTotal: number
}

export type PermissionStatus = 'allowed' | 'needs_approval' | 'denied'

export interface PermissionResult {
  status: PermissionStatus
  maxPercent?: number | null
  maxFixedAmount?: number | null
  reason?: string
}

export interface ResolvedSet {
  applied: DiscountCandidate[]
  rejected: DiscountCandidate[]
}

export const DISCOUNT_CATEGORIES: DiscountCategory[] = [
  'manager', 'staff', 'vip', 'corporate', 'happy_hour', 'category', 'product',
  'floor', 'damage_wastage', 'service_recovery', 'bulk_order', 'manual', 'scheduled', 'buy_x_get_y',
]

export const STACKING_MODES: StackingMode[] = ['allow', 'prevent', 'highest_wins', 'priority']

export const TAX_TREATMENTS: TaxTreatment[] = [
  'tax_before_discount', 'tax_after_discount', 'inclusive', 'exclusive',
]

export type { OrderDiscount, Discount, RoleDiscountPolicy }
