import type { LaborPayRuleEffect } from '@/api/model/hr.types.ts'
import type { LaborPayRule } from '@/api/model/labor_pay_rule.ts'
import {
  DEFAULT_DOUBLE_TIME_MULTIPLIER,
  DEFAULT_OT_MULTIPLIER,
} from '@/lib/labor-engine/constants.ts'
import { computeLaborCost } from '@/lib/labor-engine/calculations/cost.calculations.ts'
import { isRuleEligible } from '@/lib/labor-engine/rules/eligibility.ts'
import type {
  LaborCalculationContext,
  LaborRuleCandidate,
  RuleApplicationResult,
} from '@/lib/labor-engine/types.ts'
import { safeNumber } from '@/lib/utils.ts'

const roundMoney = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

const getBaseForEffect = (
  effect: LaborPayRuleEffect,
  ctx: LaborCalculationContext,
  baseCost: ReturnType<typeof computeLaborCost>
): number => {
  const appliesTo = effect.applies_to ?? 'all_hours'
  const profile = ctx.payProfile
  const baseRate = safeNumber(profile.base_rate)

  if (effect.type === 'multiplier') {
    if (appliesTo === 'regular') return baseCost.regularPay
    if (appliesTo === 'overtime') return baseCost.overtimePay + baseCost.doubleTimePay
    return baseCost.grossPay
  }

  if (appliesTo === 'regular') {
    return baseCost.regularPay || baseRate * safeNumber(baseCost.regularPay / Math.max(baseRate, 0.01))
  }
  if (appliesTo === 'overtime') {
    return baseCost.overtimePay + baseCost.doubleTimePay
  }
  return baseCost.grossPay
}

const applyEffect = (
  effect: LaborPayRuleEffect,
  baseAmount: number
): number => {
  const value = safeNumber(effect.value)

  switch (effect.type) {
    case 'multiplier':
      return roundMoney(baseAmount * (value - 1))
    case 'fixed_bonus':
      return roundMoney(value)
    case 'fixed_deduction':
      return roundMoney(-Math.abs(value))
    case 'percent_bonus':
      return roundMoney((baseAmount * value) / 100)
    case 'percent_deduction':
      return roundMoney(-(baseAmount * Math.abs(value)) / 100)
    default:
      return 0
  }
}

const buildCandidate = (
  rule: LaborPayRule,
  ctx: LaborCalculationContext,
  baseCost: ReturnType<typeof computeLaborCost>
): LaborRuleCandidate | null => {
  const effects = rule.effects ?? []
  if (effects.length === 0) return null

  const applications: RuleApplicationResult[] = []
  let totalAmount = 0

  for (const effect of effects) {
    const baseAmount = getBaseForEffect(effect, ctx, baseCost)
    const amount = applyEffect(effect, baseAmount)
    if (amount === 0) continue

    applications.push({
      ruleId: rule.id,
      ruleName: rule.name,
      effect,
      amount,
    })
    totalAmount = roundMoney(totalAmount + amount)
  }

  if (applications.length === 0) return null

  return { rule, applications, totalAmount }
}

export const evaluateRules = (
  ctx: LaborCalculationContext,
  baseCost: ReturnType<typeof computeLaborCost>
): LaborRuleCandidate[] => {
  const candidates: LaborRuleCandidate[] = []

  const sortedRules = [...ctx.rules].sort(
    (a, b) => safeNumber(a.priority) - safeNumber(b.priority)
  )

  for (const rule of sortedRules) {
    if (!isRuleEligible(rule, ctx)) continue
    const candidate = buildCandidate(rule, ctx, baseCost)
    if (candidate) candidates.push(candidate)
  }

  return candidates
}

export const getDefaultOtMultipliers = (): {
  overtime: number
  doubleTime: number
} => ({
  overtime: DEFAULT_OT_MULTIPLIER,
  doubleTime: DEFAULT_DOUBLE_TIME_MULTIPLIER,
})
