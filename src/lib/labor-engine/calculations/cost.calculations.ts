import {
  DEFAULT_DOUBLE_TIME_MULTIPLIER,
  DEFAULT_OT_MULTIPLIER,
} from '@/lib/labor-engine/constants.ts'
import { computePremiumPay } from '@/lib/labor-engine/calculations/premium.calculations.ts'
import type {
  EmployeePayProfile,
  HoursBreakdown,
  LaborAdjustment,
  LaborCostBreakdown,
} from '@/lib/labor-engine/types.ts'
import { safeNumber } from '@/lib/utils.ts'

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

export interface ComputeLaborCostInput {
  hours: HoursBreakdown
  payProfile: EmployeePayProfile
  adjustments?: LaborAdjustment[]
  ruleBonuses?: number
  ruleDeductions?: number
}

export const computeLaborCost = ({
  hours,
  payProfile,
  adjustments = [],
  ruleBonuses = 0,
  ruleDeductions = 0,
}: ComputeLaborCostInput): LaborCostBreakdown => {
  const baseRate = safeNumber(payProfile.base_rate)
  const otMultiplier = safeNumber(
    payProfile.overtime_policy?.config?.multiplier,
    DEFAULT_OT_MULTIPLIER
  )
  const doubleMultiplier = DEFAULT_DOUBLE_TIME_MULTIPLIER

  const regularPay = roundMoney(hours.regularHours * baseRate)
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
