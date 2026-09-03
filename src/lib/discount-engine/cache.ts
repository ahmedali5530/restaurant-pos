import type { Discount } from '@/api/model/discount.ts'
import type { DiscountScope } from '@/api/model/discount.ts'
import { toTargetId } from '@/lib/discount-engine/target-ids.ts'

export interface DiscountCacheIndex {
  all: Discount[]
  byScope: Map<DiscountScope, Discount[]>
  byItemId: Map<string, Discount[]>
  byCategoryId: Map<string, Discount[]>
  byDayBitmask: Map<number, Discount[]>
  version: number
}

let cache: DiscountCacheIndex = {
  all: [],
  byScope: new Map(),
  byItemId: new Map(),
  byCategoryId: new Map(),
  byDayBitmask: new Map(),
  version: 0,
}

const dayBitmask = (days?: number[]): number => {
  if (!days?.length) return 127 // all days
  return days.reduce((mask, d) => mask | (1 << d), 0)
}

export const buildDiscountCache = (discounts: Discount[]): DiscountCacheIndex => {
  const active = discounts.filter(d => d.is_active !== false && !d.deleted_at)
  const byScope = new Map<DiscountScope, Discount[]>()
  const byItemId = new Map<string, Discount[]>()
  const byCategoryId = new Map<string, Discount[]>()
  const byDayBitmask = new Map<number, Discount[]>()

  for (const d of active) {
    const scope = (d.scope || 'cart') as DiscountScope
    if (!byScope.has(scope)) byScope.set(scope, [])
    byScope.get(scope)!.push(d)

    for (const itemId of d.targets?.item_ids || []) {
      const key = toTargetId(itemId)
      if (!byItemId.has(key)) byItemId.set(key, [])
      byItemId.get(key)!.push(d)
    }
    for (const catId of d.targets?.category_ids || []) {
      const key = toTargetId(catId)
      if (!byCategoryId.has(key)) byCategoryId.set(key, [])
      byCategoryId.get(key)!.push(d)
    }

    const mask = dayBitmask(
      d.schedules?.flatMap(s => s.days_of_week || []) || []
    )
    if (!byDayBitmask.has(mask)) byDayBitmask.set(mask, [])
    byDayBitmask.get(mask)!.push(d)
  }

  cache = {
    all: active,
    byScope,
    byItemId,
    byCategoryId,
    byDayBitmask,
    version: cache.version + 1,
  }
  return cache
}

export const getDiscountCache = (): DiscountCacheIndex => cache

export const getCandidateRulesForContext = (
  itemIds: string[],
  categoryIds: string[],
  day: number
): Discount[] => {
  const seen = new Set<string>()
  const result: Discount[] = []

  const add = (list: Discount[]) => {
    for (const d of list) {
      if (!seen.has(d.id)) {
        seen.add(d.id)
        result.push(d)
      }
    }
  }

  add(cache.all.filter(d => (d.scope || 'cart') === 'cart'))
  add(cache.byScope.get('customer') || [])
  add(cache.byScope.get('floor') || [])

  for (const id of itemIds) {
    add(cache.byItemId.get(toTargetId(id)) || [])
  }
  for (const id of categoryIds) {
    add(cache.byCategoryId.get(toTargetId(id)) || [])
  }

  const dayBit = 1 << day
  for (const [mask, rules] of cache.byDayBitmask) {
    if (mask === 127 || (mask & dayBit)) {
      add(rules)
    }
  }

  return result
}
