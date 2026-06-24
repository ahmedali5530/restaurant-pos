import type { Discount } from '@/api/model/discount.ts'
import type { DiscountCandidate, ResolvedSet } from '@/lib/discount-engine/types.ts'
import { roundCurrency } from '@/lib/discount-engine/rounding.ts'

const getGroupKey = (c: DiscountCandidate): string => {
  return c.discount.stack_group || `${c.scope}:${c.discount.category || 'default'}`
}

const isDuplicate = (applied: DiscountCandidate[], candidate: DiscountCandidate): boolean => {
  return applied.some(a => {
    if (a.discount.id !== candidate.discount.id) return false
    const aTargets = (a.targetItemIds || []).sort().join(',')
    const bTargets = (candidate.targetItemIds || []).sort().join(',')
    return aTargets === bTargets
  })
}

const resolveGroup = (
  group: DiscountCandidate[],
  stackingMode: string
): DiscountCandidate[] => {
  if (group.length === 0) return []

  if (stackingMode === 'prevent') {
    return [group.sort((a, b) => b.appliedAmount - a.appliedAmount)[0]]
  }

  if (stackingMode === 'highest_wins') {
    const best = group.sort((a, b) => b.appliedAmount - a.appliedAmount)[0]
    return [best]
  }

  if (stackingMode === 'priority') {
    const sorted = [...group].sort((a, b) => (a.discount.priority ?? 0) - (b.discount.priority ?? 0))
    const result: DiscountCandidate[] = []
    for (const c of sorted) {
      if (result.length === 0 || (c.discount.stackable !== false)) {
        result.push(c)
      } else {
        break
      }
    }
    return result
  }

  // allow — all stackable; non-stackable only if alone
  const nonStackable = group.filter(c => c.discount.stackable === false)
  if (nonStackable.length > 0) {
    return [nonStackable.sort((a, b) => (a.discount.priority ?? 0) - (b.discount.priority ?? 0))[0]]
  }
  return group
}

export const resolveDiscountConflicts = (candidates: DiscountCandidate[]): ResolvedSet => {
  const rejected: DiscountCandidate[] = []
  const applied: DiscountCandidate[] = []

  const byGroup = new Map<string, DiscountCandidate[]>()
  for (const c of candidates) {
    if (c.appliedAmount <= 0) {
      rejected.push(c)
      continue
    }
    const key = getGroupKey(c)
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(c)
  }

  const exclusiveWinners = new Set<string>()

  for (const [, group] of byGroup) {
    const mode = group[0]?.discount.stacking_mode || 'allow'
    let resolved = resolveGroup(group, mode)

    // exclusive flag blocks same scope competitors
    const exclusive = resolved.filter(c => c.discount.exclusive)
    if (exclusive.length > 0) {
      const winner = exclusive.sort((a, b) => (a.discount.priority ?? 0) - (b.discount.priority ?? 0))[0]
      resolved = [winner]
      exclusiveWinners.add(`${winner.scope}`)
    }

    for (const c of resolved) {
      if (isDuplicate(applied, c)) {
        rejected.push(c)
        continue
      }
      if (exclusiveWinners.has(c.scope) && !c.discount.exclusive) {
        const hasExclusive = applied.some(a => a.scope === c.scope && a.discount.exclusive)
        if (hasExclusive) {
          rejected.push(c)
          continue
        }
      }
      applied.push(c)
    }

    const resolvedIds = new Set(resolved.map(r => r.discount.id + (r.targetItemIds || []).join(',')))
    for (const c of group) {
      const key = c.discount.id + (c.targetItemIds || []).join(',')
      if (!resolvedIds.has(key)) rejected.push(c)
    }
  }

  // Global prevent mode across entire order
  const anyPrevent = applied.some(a => a.discount.stacking_mode === 'prevent')
  if (anyPrevent && applied.length > 1) {
    const best = [...applied].sort((a, b) => b.appliedAmount - a.appliedAmount)[0]
    return {
      applied: [best],
      rejected: [...applied.filter(a => a !== best), ...rejected],
    }
  }

  return { applied, rejected }
}

export const sumDiscountTotal = (applied: DiscountCandidate[]): number => {
  return roundCurrency(applied.reduce((s, c) => s + c.appliedAmount, 0))
}

export const candidateToAppliedLine = (c: DiscountCandidate) => ({
  discountId: c.discount.id,
  name: c.discount.name,
  appliedAmount: c.appliedAmount,
  appliedRate: c.appliedRate,
  scope: c.scope,
  valueType: (c.discount.value_type || 'percent') as any,
  taxTreatment: (c.discount.tax_treatment || 'tax_before_discount') as any,
  applicationType: c.applicationType,
  lineAllocations: c.lineAllocations?.map(l => ({ orderItemId: l.orderItemId, amount: l.amount })),
  reasonId: c.reasonId,
  reasonText: c.reasonText,
})
