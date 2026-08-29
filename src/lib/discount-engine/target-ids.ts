import type { BuyXGetYCondition, Discount, DiscountTargets } from '@/api/model/discount.ts'

export type SelectOption = { label: string; value: string }

export const toTargetId = (id: unknown): string => {
  if (id === null || id === undefined) return ''
  if (typeof id === 'string') return id
  if (typeof id === 'object' && id !== null && 'toString' in id) {
    return (id as { toString: () => string }).toString()
  }
  return String(id)
}

export const optionsFromIds = (
  ids: string[] | undefined,
  lookup: Map<string, string>
): SelectOption[] =>
  (ids || []).map(id => {
    const normalized = toTargetId(id)
    return { value: normalized, label: lookup.get(normalized) ?? normalized }
  })

export const idsFromOptions = (options: SelectOption[] | undefined): string[] =>
  (options || []).map(o => toTargetId(o.value)).filter(Boolean)

export const mergeTargetsFromRecord = (discount: Discount): DiscountTargets => {
  const targets: DiscountTargets = { ...(discount.targets || {}) }

  if (targets.item_ids?.length) {
    targets.item_ids = targets.item_ids.map(toTargetId)
  }
  if (targets.category_ids?.length) {
    targets.category_ids = targets.category_ids.map(toTargetId)
  }
  if (targets.floor_ids?.length) {
    targets.floor_ids = targets.floor_ids.map(toTargetId)
  } else if (discount.applicable_floors?.length) {
    targets.floor_ids = discount.applicable_floors.map(f =>
      typeof f === 'string' ? toTargetId(f) : toTargetId((f as { id?: unknown }).id)
    )
  }
  if (targets.customer_tags?.length) {
    targets.customer_tags = [...targets.customer_tags]
  }
  if (targets.payment_type_ids?.length) {
    targets.payment_type_ids = targets.payment_type_ids.map(toTargetId)
  }

  return targets
}

export const sanitizeTargetsForSave = (targets: DiscountTargets | null | undefined): DiscountTargets | null => {
  if (!targets) return null;
  const result: DiscountTargets = {}

  if (targets.item_ids?.length) {
    result.item_ids = targets.item_ids.map(toTargetId)
  }
  if (targets.category_ids?.length) {
    result.category_ids = targets.category_ids.map(toTargetId)
  }
  if (targets.floor_ids?.length) {
    result.floor_ids = targets.floor_ids.map(toTargetId)
  }
  if (targets.customer_ids?.length) {
    result.customer_ids = targets.customer_ids.map(toTargetId)
  }
  if (targets.customer_tags?.length) {
    result.customer_tags = targets.customer_tags.map(t => t.trim()).filter(Boolean)
  }
  if (targets.payment_type_ids?.length) {
    result.payment_type_ids = targets.payment_type_ids.map(toTargetId).filter(Boolean)
  }

  return Object.keys(result).length ? result : null
}

export const targetIdsInclude = (haystack: string[] | undefined, needle: unknown): boolean => {
  if (!haystack?.length || needle === null || needle === undefined) return false
  const normalized = toTargetId(needle)
  return haystack.some(id => toTargetId(id) === normalized)
}

export const validateTargetsForScope = (
  scope: string | undefined,
  targets: DiscountTargets | null | undefined
): boolean => {
  const safeTargets = targets ?? {};
  switch (scope) {
    case 'item':
      return (safeTargets.item_ids?.length ?? 0) >= 1
    case 'category':
      return (safeTargets.category_ids?.length ?? 0) >= 1
    case 'floor':
      return (safeTargets.floor_ids?.length ?? 0) >= 1
    case 'customer':
      return (safeTargets.customer_tags?.length ?? 0) >= 1
    default:
      return true
  }
}

export const anyCategoryMatches = (
  categoryIds: string[] | undefined,
  targetCategoryIds: string[] | undefined
): boolean => {
  if (!targetCategoryIds?.length) return false
  return (categoryIds || []).some(cid => targetIdsInclude(targetCategoryIds, cid))
}

export const bxgyPoolsOverlap = (
  conditions: BuyXGetYCondition,
  options?: { manualSelection?: boolean }
): boolean => {
  if (options?.manualSelection) return true

  const buy = conditions.buy_targets || {}
  const get = conditions.get_targets || {}
  const getEmpty = !get.item_ids?.length && !get.category_ids?.length
  if (getEmpty) return true

  const buyItemIds = buy.item_ids || []
  const buyCategoryIds = buy.category_ids || []
  const getItemIds = get.item_ids || []
  const getCategoryIds = get.category_ids || []

  if (buyItemIds.length && getItemIds.length) {
    return getItemIds.every(id => targetIdsInclude(buyItemIds, id))
  }

  if (buyCategoryIds.length && getCategoryIds.length) {
    return getCategoryIds.every(id => targetIdsInclude(buyCategoryIds, id))
  }

  if (buyItemIds.length && getCategoryIds.length) return true
  if (buyCategoryIds.length && getItemIds.length) return true

  return false
}
