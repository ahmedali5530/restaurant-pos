import { CALCULATION_VERSION } from '@/lib/labor-engine/constants.ts'
import { computeLaborCost } from '@/lib/labor-engine/calculations/cost.calculations.ts'
import {
  computeHoursBreakdown,
  thresholdsFromPayProfile,
} from '@/lib/labor-engine/calculations/hours.calculations.ts'
import {
  computePremiumBuckets,
  premiumConfigFromPayProfile,
} from '@/lib/labor-engine/calculations/premium.calculations.ts'
import { evaluateRules } from '@/lib/labor-engine/rules/evaluator.ts'
import {
  flattenRuleApplications,
  resolveRuleStacking,
  sumRuleApplications,
} from '@/lib/labor-engine/rules/resolver.ts'
import { computePayrollCalendar } from '@/lib/labor-engine/calculations/work-days.calculations.ts'
import type {
  HoursBreakdown,
  LaborCalculationContext,
  LaborCalculationResult,
} from '@/lib/labor-engine/types.ts'
import { safeNumber } from '@/lib/utils.ts'

export const calculateEmployeeLabor = (
  ctx: LaborCalculationContext
): LaborCalculationResult => {
  const errors: string[] = []
  const calculatedAt = ctx.now ?? new Date()

  const thresholds = thresholdsFromPayProfile(ctx.payProfile)
  const hoursBase = computeHoursBreakdown(
    ctx.timeEntries,
    thresholds,
    ctx.priorWeekHours ?? 0
  )

  const premiumConfig = premiumConfigFromPayProfile(ctx.payProfile)
  const premiumBuckets = computePremiumBuckets(
    ctx.timeEntries,
    ctx.holidays,
    premiumConfig
  )

  const hours: HoursBreakdown = {
    ...hoursBase,
    premiumBuckets,
  }

  const calendar = computePayrollCalendar({
    timeEntries: ctx.timeEntries,
    leaveRequests: ctx.leaveRequests ?? [],
    periodStart: ctx.periodStart,
    periodEnd: ctx.periodEnd,
    workWeekdays: ctx.payProfile.work_weekdays,
  })
  const expectedWorkDays = ctx.payProfile.expected_work_days
  const costInput = {
    hours,
    payProfile: ctx.payProfile,
    adjustments: ctx.adjustments,
    paidDays: calendar.paidDays,
    unpaidLeaveDays: calendar.unpaidLeaveDaysCount,
    expectedWorkDays,
  }

  const baseCost = computeLaborCost(costInput)

  const candidates = evaluateRules(ctx, baseCost)
  const { applied, rejected } = resolveRuleStacking(candidates)

  if (rejected.length > 0) {
    errors.push(`${rejected.length} pay rule(s) excluded by stacking rules`)
  }

  const { bonuses, deductions } = sumRuleApplications(applied)
  const cost = computeLaborCost({
    ...costInput,
    ruleBonuses: bonuses,
    ruleDeductions: deductions,
  })

  return {
    employeeId: ctx.employee.id,
    payProfileId: ctx.payProfile.id,
    hours,
    cost,
    payType: ctx.payProfile.pay_type,
    paidDays: calendar.paidDays,
    unpaidLeaveDays: calendar.unpaidLeaveDaysCount,
    expectedWorkDays:
      expectedWorkDays === undefined || expectedWorkDays === null
        ? undefined
        : safeNumber(expectedWorkDays),
    ruleApplications: flattenRuleApplications(applied),
    calculationVersion: CALCULATION_VERSION,
    calculatedAt,
    errors,
  }
}
