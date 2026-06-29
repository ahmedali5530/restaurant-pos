import type { Order } from '@/api/model/order.ts'
import type { OrderItem } from '@/api/model/order_item.ts'
import type { MenuItem } from '@/api/model/cart_item.ts'
import { calculateOrderItemPrice, calculateCartItemPrice } from '@/lib/cart.ts'
import { getOrderFilteredItems } from '@/lib/order.ts'
import type { EvaluationContext, EvaluableLineItem, AppliedDiscountLine } from '@/lib/discount-engine/types.ts'
import type { OrderDiscount } from '@/api/model/order_discount.ts'

import { toTargetId } from '@/lib/discount-engine/target-ids.ts'

const getCategoryIds = (item: OrderItem): string[] => {
  const ids = new Set<string>()
  for (const category of (item.item as { categories?: { id?: unknown }[] })?.categories || []) {
    const id = category?.id?.toString()
    if (id) ids.add(id)
  }
  if (item.category_id) {
    ids.add(toTargetId(item.category_id))
  }
  return [...ids]
}

const getCartCategoryIds = (item: MenuItem): string[] => {
  const ids = new Set<string>()
  for (const category of (item.dish as { categories?: { id?: unknown }[] })?.categories || []) {
    const id = category?.id?.toString()
    if (id) ids.add(id)
  }
  if (item.category_id) {
    ids.add(toTargetId(item.category_id))
  }
  return [...ids]
}

export const orderItemToEvaluable = (item: OrderItem): EvaluableLineItem => ({
  id: item.id?.toString() || '',
  lineTotal: calculateOrderItemPrice(item),
  itemId: item.item?.id?.toString(),
  categoryIds: getCategoryIds(item),
  quantity: item.quantity || 1,
})

export const cartItemToEvaluable = (item: MenuItem, tempId: string): EvaluableLineItem => ({
  id: tempId,
  lineTotal: calculateCartItemPrice(item),
  itemId: item.dish?.id?.toString(),
  categoryIds: getCartCategoryIds(item),
  quantity: item.quantity || 1,
})

export const buildEvaluationContext = (
  order: Order,
  options: {
    taxRate?: number
    rules: EvaluationContext['rules']
    now?: Date
    pendingCart?: MenuItem[]
    existingApplications?: AppliedDiscountLine[]
    manualRequests?: EvaluationContext['manualRequests']
    policies?: EvaluationContext['policies']
    currentUser?: EvaluationContext['currentUser']
  }
): EvaluationContext => {
  const orderItems = getOrderFilteredItems(order).map(orderItemToEvaluable)
  const cartItems = (options.pendingCart || []).map((item, idx) =>
    cartItemToEvaluable(item, `cart-${idx}`)
  )
  const items = [...orderItems, ...cartItems]
  const itemsTotal = items.reduce((s, i) => s + i.lineTotal, 0)

  return {
    items,
    itemsTotal,
    customer: order.customer,
    orderType: order.order_type,
    floorId: order.floor?.id?.toString(),
    now: options.now || new Date(),
    taxRate: options.taxRate ?? order.tax?.rate,
    rules: options.rules,
    existingApplications: options.existingApplications || [],
    manualRequests: options.manualRequests,
    policies: options.policies,
    currentUser: options.currentUser,
  }
}

export const orderDiscountToAppliedLine = (od: OrderDiscount): AppliedDiscountLine => ({
  discountId: typeof od.discount === 'string' ? od.discount : od.discount?.id?.toString() || '',
  orderDiscountId: od.id,
  name: od.name,
  appliedAmount: od.applied_amount,
  appliedRate: od.applied_rate ?? undefined,
  scope: od.scope,
  valueType: od.value_type,
  taxTreatment: od.tax_treatment,
  applicationType: od.application_type,
  lineAllocations: od.line_allocations?.map(l => ({
    orderItemId: typeof l.order_item === 'string' ? l.order_item : l.order_item?.id?.toString() || '',
    amount: l.amount,
  })),
  reasonId: typeof od.reason === 'string' ? od.reason : od.reason?.id,
  reasonText: od.reason_text,
})
