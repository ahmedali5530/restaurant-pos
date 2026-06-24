import {
  Discount,
  getDiscountMaxValue,
  getDiscountMinValue,
  getDiscountPrimaryValue,
  getDiscountValueType,
} from '@/api/model/discount.ts'
import type { EvaluableLineItem } from '@/lib/discount-engine/types.ts'
import { roundCurrency } from '@/lib/discount-engine/rounding.ts'
import { safeNumber } from '@/lib/utils.ts'
import { anyCategoryMatches, targetIdsInclude } from '@/lib/discount-engine/target-ids.ts'

export interface ComputeInput {
  discount: Discount
  baseAmount: number
  rate?: number
  amount?: number
  itemIds?: string[]
}

const capAmount = (amount: number, discount: Discount, baseAmount: number): number => {
  let result = Math.max(0, amount)
  if (discount.max_cap !== undefined && discount.max_cap !== null) {
    result = Math.min(result, discount.max_cap)
  }
  return Math.min(result, baseAmount)
}

export const computeDiscountAmount = ({
  discount,
  baseAmount,
  rate,
  amount,
}: ComputeInput): { appliedAmount: number; appliedRate?: number } => {
  const valueType = getDiscountValueType(discount)
  const minVal = getDiscountMinValue(discount)
  const maxVal = getDiscountMaxValue(discount)
  let appliedAmount = 0
  let appliedRate: number | undefined

  if (valueType === 'percent') {
    const inputRate = rate ?? amount ?? getDiscountPrimaryValue(discount)
    const clampedRate = Math.min(Math.max(inputRate, minVal), maxVal || inputRate)
    appliedRate = clampedRate
    appliedAmount = (baseAmount * clampedRate) / 100
  } else if (valueType === 'fixed_amount') {
    const inputAmount = amount ?? rate ?? getDiscountPrimaryValue(discount)
    const hasRange = minVal !== maxVal
    const clamped = hasRange
      ? Math.min(Math.max(inputAmount, minVal), maxVal)
      : minVal
    appliedAmount = clamped
    appliedRate = clamped
  } else if (valueType === 'fixed_price') {
    const targetPrice = getDiscountPrimaryValue(discount)
    appliedAmount = Math.max(0, baseAmount - targetPrice)
  }

  appliedAmount = capAmount(roundCurrency(appliedAmount), discount, baseAmount)
  return { appliedAmount, appliedRate }
}

const itemMatchesTargets = (item: EvaluableLineItem, discount: Discount): boolean => {
  const targets = discount.targets
  if (!targets) return true

  const scope = discount.scope || 'cart'
  if (scope === 'item' && targets.item_ids?.length) {
    return !!item.itemId && targetIdsInclude(targets.item_ids, item.itemId)
  }
  if (scope === 'category' && targets.category_ids?.length) {
    return anyCategoryMatches(item.categoryIds, targets.category_ids)
  }
  return true
}

export const getScopedItems = (
  items: EvaluableLineItem[],
  discount: Discount,
  targetItemIds?: string[]
): EvaluableLineItem[] => {
  const scope = discount.scope || 'cart'

  if (targetItemIds?.length) {
    return items.filter(i => targetItemIds.includes(i.id))
  }

  if (scope === 'cart' || scope === 'customer' || scope === 'floor') {
    return items
  }

  return items.filter(i => itemMatchesTargets(i, discount))
}

export const computeBxgyCandidates = (
  discount: Discount,
  items: EvaluableLineItem[],
  options?: { manualSelection?: boolean }
): { targetItemIds: string[]; appliedAmount: number; lineAllocations: { orderItemId: string; amount: number }[] }[] => {
  const conditions = discount.conditions
  if (!conditions || discount.category !== 'buy_x_get_y') {
    return []
  }

  const manualSelection = options?.manualSelection === true

  const buyItems = manualSelection
    ? items
    : items.filter(i => {
      const buyTargets = conditions.buy_targets
      if (buyTargets.item_ids?.length && i.itemId && targetIdsInclude(buyTargets.item_ids, i.itemId)) {
        return true
      }
      if (buyTargets.category_ids?.length) {
        return anyCategoryMatches(i.categoryIds, buyTargets.category_ids)
      }
      return false
    })

  const totalBuyQty = buyItems.reduce((s, i) => s + safeNumber(i.quantity), 0)
  const sets = Math.floor(totalBuyQty / conditions.buy_quantity)

  if (sets <= 0) return []

  const getItems = (manualSelection ? items : items.filter(i => {
    const getTargets = conditions.get_targets
    if (getTargets?.item_ids?.length && i.itemId && targetIdsInclude(getTargets.item_ids, i.itemId)) {
      return true
    }
    if (getTargets?.category_ids?.length) {
      return anyCategoryMatches(i.categoryIds, getTargets.category_ids)
    }
    return buyItems.some(b => b.id === i.id)
  })).sort((a, b) => a.lineTotal - b.lineTotal)

  const freeQty = sets * conditions.get_quantity
  const results: { targetItemIds: string[]; appliedAmount: number; lineAllocations: { orderItemId: string; amount: number }[] }[] = []
  let remaining = freeQty

  const lineAllocations: { orderItemId: string; amount: number }[] = []
  let totalDiscount = 0

  for (const item of getItems) {
    if (remaining <= 0) break
    const qty = Math.min(remaining, safeNumber(item.quantity))
    const unitPrice = item.lineTotal / Math.max(1, item.quantity)
    let itemDiscount = 0

    if (conditions.get_value_type === 'free') {
      itemDiscount = unitPrice * qty
    } else if (conditions.get_value_type === 'percent') {
      itemDiscount = (unitPrice * qty * conditions.get_value) / 100
    } else {
      itemDiscount = conditions.get_value * qty
    }

    itemDiscount = roundCurrency(itemDiscount)
    if (itemDiscount > 0) {
      lineAllocations.push({ orderItemId: item.id, amount: itemDiscount })
      totalDiscount += itemDiscount
      remaining -= qty
    }
  }

  if (totalDiscount > 0) {
    results.push({
      targetItemIds: lineAllocations.map(l => l.orderItemId),
      appliedAmount: roundCurrency(totalDiscount),
      lineAllocations,
    })
  }

  return results
}

export const computeScopedDiscount = (
  discount: Discount,
  items: EvaluableLineItem[],
  options?: { rate?: number; amount?: number; targetItemIds?: string[] }
): {
  appliedAmount: number
  appliedRate?: number
  baseAmount: number
  targetItemIds?: string[]
  lineAllocations?: { orderItemId: string; amount: number }[]
} => {
  if (discount.category === 'buy_x_get_y') {
    const pool = options?.targetItemIds?.length
      ? items.filter(i => options.targetItemIds!.includes(i.id))
      : items
    const bxgy = computeBxgyCandidates(discount, pool, {
      manualSelection: (options?.targetItemIds?.length ?? 0) > 0,
    })
    if (bxgy.length === 0) {
      return { appliedAmount: 0, baseAmount: 0 }
    }
    const first = bxgy[0]
    return {
      appliedAmount: first.appliedAmount,
      baseAmount: first.appliedAmount,
      targetItemIds: first.targetItemIds,
      lineAllocations: first.lineAllocations,
    }
  }

  const scoped = getScopedItems(items, discount, options?.targetItemIds)
  const baseAmount = scoped.reduce((s, i) => s + i.lineTotal, 0)
  const { appliedAmount, appliedRate } = computeDiscountAmount({
    discount,
    baseAmount,
    rate: options?.rate,
    amount: options?.amount,
  })

  return {
    appliedAmount,
    appliedRate,
    baseAmount,
    targetItemIds: scoped.map(i => i.id),
  }
}
