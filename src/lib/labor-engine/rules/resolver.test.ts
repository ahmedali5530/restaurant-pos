import { describe, expect, it } from 'vitest'
import { resolveRuleStacking } from './resolver.ts'
import type { LaborRuleCandidate } from '@/lib/labor-engine/types.ts'

const candidate = (
  id: string,
  code: string,
  totalAmount: number,
  stackingMode: string
): LaborRuleCandidate =>
  ({
    rule: { id, name: id, code, stacking_mode: stackingMode },
    applications: [
      { ruleId: id, ruleName: id, effect: 'deduction', amount: totalAmount },
    ],
    totalAmount,
  }) as unknown as LaborRuleCandidate

describe('resolveRuleStacking', () => {
  it('applies pure-deduction rules instead of dropping them', () => {
    const { applied } = resolveRuleStacking([
      candidate('d1', 'PENALTY', -25, 'allow'),
    ])
    expect(applied).toHaveLength(1)
    expect(applied[0].rule.id).toBe('d1')
  })

  it('highest_wins picks the largest bonus', () => {
    const { applied } = resolveRuleStacking([
      candidate('b1', 'BONUS', 5, 'highest_wins'),
      candidate('b2', 'BONUS', 20, 'highest_wins'),
    ])
    expect(applied).toHaveLength(1)
    expect(applied[0].rule.id).toBe('b2')
  })

  it('highest_wins picks the largest-magnitude deduction', () => {
    const { applied } = resolveRuleStacking([
      candidate('d1', 'PENALTY', -10, 'highest_wins'),
      candidate('d2', 'PENALTY', -50, 'highest_wins'),
    ])
    expect(applied).toHaveLength(1)
    expect(applied[0].rule.id).toBe('d2')
  })

  it('prevent keeps the strongest rule across groups', () => {
    const { applied } = resolveRuleStacking([
      candidate('bonus', 'BONUS', 5, 'allow'),
      candidate('penalty', 'PENALTY', -30, 'prevent'),
    ])
    expect(applied).toHaveLength(1)
    expect(applied[0].rule.id).toBe('penalty')
  })
})
