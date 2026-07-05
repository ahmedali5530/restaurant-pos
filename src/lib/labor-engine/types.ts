import type { useDB } from '@/api/db/db.ts'
import type { Employee } from '@/api/model/employee.ts'
import type { EmployeePayProfile } from '@/api/model/employee_pay_profile.ts'
import type { LaborAdjustment } from '@/api/model/labor_adjustment.ts'
import type { LaborPayRule } from '@/api/model/labor_pay_rule.ts'
import type { LaborPayRuleEffect } from '@/api/model/hr.types.ts'
import type { PublicHoliday } from '@/api/model/public_holiday.ts'
import type { TimeEntry } from '@/api/model/time_entry.ts'
import type { TimeEntryBreak } from '@/api/model/time_entry_break.ts'
import type { DateInput } from '@/lib/datetime.ts'

export type DbClient = Pick<
  ReturnType<typeof useDB>,
  'query' | 'create' | 'merge' | 'select'
>

export type HourBucketType = 'regular' | 'overtime' | 'double_time'

export interface HourBucket {
  type: HourBucketType
  hours: number
  date: string
}

export interface PremiumHourBucket {
  type: 'night' | 'weekend' | 'holiday'
  hours: number
  date: string
  holidayId?: string
  multiplier: number
}

export interface TimeEntryWithBreaks extends TimeEntry {
  breaks?: TimeEntryBreak[]
}

export interface LaborCalculationContext {
  employee: Employee
  payProfile: EmployeePayProfile
  timeEntries: TimeEntryWithBreaks[]
  rules: LaborPayRule[]
  holidays: PublicHoliday[]
  periodStart: DateInput
  periodEnd: DateInput
  adjustments?: LaborAdjustment[]
  /** Hours already worked in the ISO week before period entries (for weekly OT) */
  priorWeekHours?: number
  now?: Date
}

export interface RuleApplicationResult {
  ruleId: string
  ruleName: string
  effect: LaborPayRuleEffect
  amount: number
}

export interface LaborRuleCandidate {
  rule: LaborPayRule
  applications: RuleApplicationResult[]
  totalAmount: number
}

export interface HoursBreakdown {
  regularHours: number
  overtimeHours: number
  doubleTimeHours: number
  totalHours: number
  buckets: HourBucket[]
  premiumBuckets: PremiumHourBucket[]
  unpaidBreakHours: number
  paidBreakHours: number
}

export interface LaborCostBreakdown {
  regularPay: number
  overtimePay: number
  doubleTimePay: number
  premiumPay: number
  bonuses: number
  deductions: number
  adjustments: number
  grossPay: number
  netPay: number
}

export interface LaborCalculationResult {
  employeeId: string
  payProfileId: string
  hours: HoursBreakdown
  cost: LaborCostBreakdown
  ruleApplications: RuleApplicationResult[]
  calculationVersion: string
  calculatedAt: Date
  errors: string[]
}

export interface ResolvedRuleSet {
  applied: LaborRuleCandidate[]
  rejected: LaborRuleCandidate[]
}

export interface ScheduleConflict {
  type: 'overlap' | 'insufficient_rest' | 'max_hours_exceeded'
  message: string
  conflictingShiftId?: string
}

export interface AccrualInput {
  accrualRate: number
  monthsEmployed: number
  maxDaysPerYear?: number
  carriedOver?: number
  used?: number
  pending?: number
}

export interface AccrualResult {
  accrued: number
  remaining: number
  available: number
}

export type {
  Employee,
  EmployeePayProfile,
  LaborPayRule,
  LaborAdjustment,
  PublicHoliday,
  TimeEntry,
  TimeEntryBreak,
}
