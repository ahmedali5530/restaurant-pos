import type { Order } from '@/api/model/order.ts'
import type { MenuItem } from '@/api/model/cart_item.ts'
import { calculateOrderGrandTotal } from '@/lib/cart.ts'
import { buildEvaluationContext } from '@/lib/discount-engine/context.ts'
import { evaluateDiscounts } from '@/lib/discount-engine/evaluator.ts'
import { getDiscountCache } from '@/lib/discount-engine/cache.ts'
import type {
  ApplyDiscountRequest,
  CartTotals,
  EvaluationContext,
  EvaluationResult,
  ManualDiscountRequest,
} from '@/lib/discount-engine/types.ts'

export const recalculateCart = (
  order: Order,
  options?: {
    pendingCart?: MenuItem[]
    manualRequests?: ManualDiscountRequest[]
    existingApplications?: EvaluationContext['existingApplications']
    extrasTotal?: number
    serviceChargeAmount?: number
    couponAmount?: number
    tipAmount?: number
    taxRate?: number
    now?: Date
    rules?: EvaluationContext['rules']
  }
): CartTotals => {
  const rules = options?.rules ?? getDiscountCache().all
  const ctx = buildEvaluationContext(order, {
    rules,
    pendingCart: options?.pendingCart,
    existingApplications: options?.existingApplications,
    manualRequests: options?.manualRequests,
    now: options?.now,
    taxRate: options?.taxRate,
  })

  const result = evaluateDiscounts(ctx)
  const extrasTotal = options?.extrasTotal ?? 0
  const serviceChargeAmount = options?.serviceChargeAmount ?? 0
  const couponAmount = options?.couponAmount ?? 0
  const tipAmount = options?.tipAmount ?? 0

  const grandTotal = calculateOrderGrandTotal({
    itemsTotal: ctx.itemsTotal,
    extrasTotal,
    taxAmount: result.taxAmount,
    discountAmount: result.discountTotal,
    serviceChargeAmount,
    couponAmount,
    tipAmount,
  })

  return {
    itemsTotal: ctx.itemsTotal,
    discountTotal: result.discountTotal,
    discountLines: result.applied,
    taxableAmount: result.taxableAmount,
    taxAmount: result.taxAmount,
    extrasTotal,
    serviceChargeAmount,
    couponAmount,
    tipAmount,
    grandTotal,
  }
}

export const applyDiscount = (
  ctx: EvaluationContext,
  request: ApplyDiscountRequest
): EvaluationResult => {
  const manualRequests = [...(ctx.manualRequests || []), request]
  return evaluateDiscounts({ ...ctx, manualRequests })
}

export const removeDiscount = (
  ctx: EvaluationContext,
  orderDiscountId: string
): EvaluationResult => {
  const existingApplications = ctx.existingApplications.filter(
    a => a.orderDiscountId !== orderDiscountId
  )
  return evaluateDiscounts({ ...ctx, existingApplications })
}
