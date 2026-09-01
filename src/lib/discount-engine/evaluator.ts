import type { DiscountScope } from '@/api/model/discount.ts'
import {
  isEligibleForAuto,
  isEligibleForManual,
} from '@/lib/discount-engine/eligibility.ts'
import { computeScopedDiscount } from '@/lib/discount-engine/calculator.ts'
import {
  candidateToAppliedLine,
  resolveDiscountConflicts,
  sumDiscountTotal,
} from '@/lib/discount-engine/resolver.ts'
import { computeTaxAmount, pickOrderTaxTreatment } from '@/lib/discount-engine/tax.ts'
import { toTargetId } from '@/lib/discount-engine/target-ids.ts'
import type {
  DiscountCandidate,
  EvaluationContext,
  EvaluationResult,
} from '@/lib/discount-engine/types.ts'

const buildAutoCandidates = (ctx: EvaluationContext): DiscountCandidate[] => {
  const candidates: DiscountCandidate[] = []
  const appliedDiscountIds = new Set(
    ctx.existingApplications.map(a => toTargetId(a.discountId)).filter(Boolean),
  )

  for (const rule of ctx.rules) {
    const ruleId = toTargetId(rule.id)
    if (appliedDiscountIds.has(ruleId)) continue
    if (!isEligibleForAuto(rule, ctx)) continue

    const computed = computeScopedDiscount(rule, ctx.items)
    if (computed.appliedAmount <= 0) continue

    candidates.push({
      discount: rule,
      appliedAmount: computed.appliedAmount,
      appliedRate: computed.appliedRate,
      baseAmount: computed.baseAmount,
      scope: (rule.scope || 'cart') as DiscountScope,
      applicationType: 'automatic',
      targetItemIds: computed.targetItemIds,
      lineAllocations: computed.lineAllocations?.map(l => ({
        orderItemId: l.orderItemId,
        amount: l.amount,
      })),
    })
  }

  return candidates
}

const buildManualCandidates = (ctx: EvaluationContext): DiscountCandidate[] => {
  const candidates: DiscountCandidate[] = []

  for (const req of ctx.manualRequests || []) {
    const reqId = toTargetId(req.discountId)
    const rule = ctx.rules.find(r => toTargetId(r.id) === reqId)
    if (!rule || !isEligibleForManual(rule, ctx)) continue

    const computed = computeScopedDiscount(rule, ctx.items, {
      rate: req.rate,
      amount: req.amount,
      targetItemIds: req.orderItemIds,
    })

    if (computed.appliedAmount <= 0) continue

    candidates.push({
      discount: rule,
      appliedAmount: computed.appliedAmount,
      appliedRate: computed.appliedRate,
      baseAmount: computed.baseAmount,
      scope: (rule.scope || 'cart') as DiscountScope,
      applicationType: 'manual',
      targetItemIds: req.orderItemIds || computed.targetItemIds,
      lineAllocations: computed.lineAllocations?.map(l => ({
        orderItemId: l.orderItemId,
        amount: l.amount,
      })),
      reasonId: req.reasonId,
      reasonText: req.reasonText,
      approvedBy: req.approvedBy,
      authMethod: req.authMethod,
    })
  }

  return candidates
}

export const evaluateDiscounts = (ctx: EvaluationContext): EvaluationResult => {
  const errors: string[] = []

  const existingLines = [...ctx.existingApplications]
  const autoCandidates = buildAutoCandidates(ctx)
  const manualCandidates = buildManualCandidates(ctx)
  const allCandidates = [...autoCandidates, ...manualCandidates]

  const { applied, rejected } = resolveDiscountConflicts(allCandidates)

  if (rejected.length > 0) {
    errors.push(`${rejected.length} discount(s) excluded by stacking rules`)
  }

  const newLines = applied.map(candidateToAppliedLine)
  const combined = [...existingLines, ...newLines]

  // Deduplicate by discountId + targets
  const seen = new Set<string>()
  const uniqueLines = combined.filter(line => {
    const key = `${toTargetId(line.discountId)}:${(line.lineAllocations || []).map(l => toTargetId(l.orderItemId)).join(',')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const discountTotal = sumDiscountTotal(
    uniqueLines.map(l => ({
      discount: { id: toTargetId(l.discountId), name: l.name, priority: 0 } as any,
      appliedAmount: l.appliedAmount,
      baseAmount: 0,
      scope: l.scope,
      applicationType: l.applicationType,
    }))
  )

  const taxTreatment = pickOrderTaxTreatment(uniqueLines)
  const { taxableAmount, taxAmount } = computeTaxAmount(
    ctx.itemsTotal,
    discountTotal,
    ctx.taxRate ?? 0,
    taxTreatment
  )

  return {
    candidates: applied,
    applied: uniqueLines,
    discountTotal,
    taxableAmount,
    taxAmount,
    errors,
  }
}
