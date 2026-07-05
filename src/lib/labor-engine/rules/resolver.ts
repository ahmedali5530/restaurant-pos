import type { LaborRuleCandidate, ResolvedRuleSet } from '@/lib/labor-engine/types.ts'

const getGroupKey = (c: LaborRuleCandidate): string => {
  return c.rule.code || c.rule.id
}

const isDuplicate = (
  applied: LaborRuleCandidate[],
  candidate: LaborRuleCandidate
): boolean => {
  return applied.some(a => a.rule.id === candidate.rule.id)
}

const resolveGroup = (
  group: LaborRuleCandidate[],
  stackingMode: string
): LaborRuleCandidate[] => {
  if (group.length === 0) return []

  if (stackingMode === 'prevent' || stackingMode === 'highest_wins') {
    return [group.sort((a, b) => b.totalAmount - a.totalAmount)[0]]
  }

  if (stackingMode === 'priority') {
    const sorted = [...group].sort(
      (a, b) => (a.rule.priority ?? 0) - (b.rule.priority ?? 0)
    )
    const result: LaborRuleCandidate[] = []
    for (const c of sorted) {
      if (result.length === 0) {
        result.push(c)
      } else if (!c.rule.exclusive) {
        result.push(c)
      } else {
        break
      }
    }
    return result
  }

  const exclusive = group.filter(c => c.rule.exclusive)
  if (exclusive.length > 0) {
    return [
      exclusive.sort((a, b) => (a.rule.priority ?? 0) - (b.rule.priority ?? 0))[0],
    ]
  }

  return group
}

export const resolveRuleStacking = (
  candidates: LaborRuleCandidate[]
): ResolvedRuleSet => {
  const rejected: LaborRuleCandidate[] = []
  const applied: LaborRuleCandidate[] = []

  const byGroup = new Map<string, LaborRuleCandidate[]>()
  for (const c of candidates) {
    if (c.totalAmount <= 0) {
      rejected.push(c)
      continue
    }
    const key = getGroupKey(c)
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(c)
  }

  for (const [, group] of byGroup) {
    const mode = group[0]?.rule.stacking_mode || 'allow'
    const resolved = resolveGroup(group, mode)

    for (const c of resolved) {
      if (isDuplicate(applied, c)) {
        rejected.push(c)
        continue
      }
      applied.push(c)
    }

    const resolvedIds = new Set(resolved.map(r => r.rule.id))
    for (const c of group) {
      if (!resolvedIds.has(c.rule.id)) rejected.push(c)
    }
  }

  const anyPrevent = applied.some(a => a.rule.stacking_mode === 'prevent')
  if (anyPrevent && applied.length > 1) {
    const best = [...applied].sort((a, b) => b.totalAmount - a.totalAmount)[0]
    return {
      applied: [best],
      rejected: [...applied.filter(a => a !== best), ...rejected],
    }
  }

  return { applied, rejected }
}

export const sumRuleApplications = (
  candidates: LaborRuleCandidate[]
): { bonuses: number; deductions: number } => {
  let bonuses = 0
  let deductions = 0

  for (const c of candidates) {
    for (const app of c.applications) {
      if (app.amount >= 0) bonuses += app.amount
      else deductions += Math.abs(app.amount)
    }
  }

  return {
    bonuses: Math.round((bonuses + Number.EPSILON) * 100) / 100,
    deductions: Math.round((deductions + Number.EPSILON) * 100) / 100,
  }
}

export const flattenRuleApplications = (
  candidates: LaborRuleCandidate[]
) => {
  return candidates.flatMap(c => c.applications)
}
