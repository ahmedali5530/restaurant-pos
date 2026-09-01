import {
  DEFAULT_DOUBLE_TIME_MULTIPLIER,
  DEFAULT_OT_MULTIPLIER,
} from '@/lib/labor-engine/constants.ts'
import { computePremiumPay } from '@/lib/labor-engine/calculations/premium.calculations.ts'
import {
  isDailyPayType,
  isSalariedPayType,
} from '@/lib/labor-engine/calculations/work-days.calculations.ts'
import type {
  EmployeePayProfile,
  HoursBreakdown,
  LaborAdjustment,
  LaborCostBreakdown,
} from '@/lib/labor-engine/types.ts'
import { safeNumber } from '@/lib/utils.ts'

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

const uniqueHourDates = (hours: HoursBreakdown): number => {
  const dates = new Set<string>()
  for (const bucket of hours.buckets ?? []) {
    if (bucket.date) dates.add(bucket.date)
  }
  return dates.size
}

const computeRegularPay = (
  hours: HoursBreakdown,
  payProfile: EmployeePayProfile,
  paidDays: number | undefined,
  unpaidLeaveDays: number | undefined,
  expectedWorkDays: number | undefined
): number => {
  const baseRate = safeNumber(payProfile.base_rate)
  const payType = payProfile.pay_type

  if (isDailyPayType(payType)) {
    const days = paidDays ?? uniqueHourDates(hours)
    return roundMoney(days * baseRate)
  }

  if (isSalariedPayType(payType)) {
    const expected = safeNumber(
      expectedWorkDays ?? payProfile.expected_work_days
    )
    const unpaid = Math.max(0, safeNumber(unpaidLeaveDays))
    if (expected > 0) {
      const payableDays = Math.max(0, expected - unpaid)
      return roundMoney(baseRate * (payableDays / expected))
    }
    return roundMoney(baseRate)
  }

  return roundMoney(hours.regularHours * baseRate)
}

export interface ComputeLaborCostInput {
  hours: HoursBreakdown
  payProfile: EmployeePayProfile
  adjustments?: LaborAdjustment[]
  ruleBonuses?: number
  ruleDeductions?: number
  paidDays?: number
  unpaidLeaveDays?: number
  expectedWorkDays?: number
}

export const computeLaborCost = ({
  hours,
  payProfile,
  adjustments = [],
  ruleBonuses = 0,
  ruleDeductions = 0,
  paidDays,
  unpaidLeaveDays,
  expectedWorkDays,
}: ComputeLaborCostInput): LaborCostBreakdown => {
  const baseRate = safeNumber(payProfile.base_rate)
  const otMultiplier = safeNumber(
    payProfile.overtime_policy?.config?.multiplier,
    DEFAULT_OT_MULTIPLIER
  )
  const doubleMultiplier = DEFAULT_DOUBLE_TIME_MULTIPLIER

  const regularPay = computeRegularPay(
    hours,
    payProfile,
    paidDays,
    unpaidLeaveDays,
    expectedWorkDays
  )
  const overtimePay = roundMoney(hours.overtimeHours * baseRate * otMultiplier)
  const doubleTimePay = roundMoney(
    hours.doubleTimeHours * baseRate * doubleMultiplier
  )

  const premiumPay = computePremiumPay(
    hours.premiumBuckets,
    baseRate
  )

  const adjustmentTotal = roundMoney(
    adjustments.reduce((s, a) => s + safeNumber(a.amount), 0)
  )

  const bonuses = roundMoney(ruleBonuses)
  const deductions = roundMoney(ruleDeductions)

  const grossPay = roundMoney(
    regularPay +
      overtimePay +
      doubleTimePay +
      premiumPay +
      bonuses +
      adjustmentTotal
  )

  const netPay = roundMoney(Math.max(0, grossPay - deductions))

  return {
    regularPay,
    overtimePay,
    doubleTimePay,
    premiumPay,
    bonuses,
    deductions,
    adjustments: adjustmentTotal,
    grossPay,
    netPay,
  }
}
