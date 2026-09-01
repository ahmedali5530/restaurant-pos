import type { LaborPayRule } from '@/api/model/labor_pay_rule.ts'
import type { LaborCalculationContext } from '@/lib/labor-engine/types.ts'
import { toJsDate, toLuxonDateTime } from '@/lib/datetime.ts'

const parseTimeToMinutes = (time?: string): number | undefined => {
  if (!time) return undefined
  const [hh, mm] = time.split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return undefined
  return hh * 60 + mm
}

const isTimeInWindow = (
  minutes: number,
  startMin: number,
  endMin: number
): boolean => {
  if (startMin <= endMin) {
    return minutes >= startMin && minutes <= endMin
  }
  return minutes >= startMin || minutes <= endMin
}

const matchesDateRange = (
  conditions: NonNullable<LaborPayRule['conditions']>,
  date: Date
): boolean => {
  if (conditions.start_date) {
    const start = new Date(conditions.start_date)
    start.setHours(0, 0, 0, 0)
    if (date < start) return false
  }
  if (conditions.end_date) {
    const end = new Date(conditions.end_date)
    end.setHours(23, 59, 59, 999)
    if (date > end) return false
  }
  if (conditions.months?.length) {
    const month = date.getMonth() + 1
    if (!conditions.months.includes(month)) return false
  }
  if (conditions.days_of_week?.length) {
    const weekday = toLuxonDateTime(date).weekday // 1=Mon … 7=Sun
    if (!conditions.days_of_week.includes(weekday)) return false
  }
  return true
}

const matchesTimeWindow = (
  conditions: NonNullable<LaborPayRule['conditions']>,
  date: Date
): boolean => {
  const startMin = parseTimeToMinutes(conditions.start_time)
  const endMin = parseTimeToMinutes(conditions.end_time)
  if (startMin === undefined && endMin === undefined) return true

  const minutes = date.getHours() * 60 + date.getMinutes()
  if (startMin !== undefined && endMin !== undefined) {
    return isTimeInWindow(minutes, startMin, endMin)
  }
  if (startMin !== undefined && minutes < startMin) return false
  if (endMin !== undefined && minutes > endMin) return false
  return true
}

const matchesEmployeeScope = (
  rule: LaborPayRule,
  ctx: LaborCalculationContext
): boolean => {
  const conditions = rule.conditions
  if (!conditions) return true

  const employee = ctx.employee

  if (conditions.employee_ids?.length) {
    const eid = employee.id?.toString()
    if (!eid || !conditions.employee_ids.some(id => id.toString() === eid)) {
      return false
    }
  }

  if (conditions.department_ids?.length) {
    const deptId = employee.department?.id?.toString()
    if (!deptId || !conditions.department_ids.some(id => id.toString() === deptId)) {
      return false
    }
  }

  if (conditions.position_ids?.length) {
    const posId = employee.position?.id?.toString()
    if (!posId || !conditions.position_ids.some(id => id.toString() === posId)) {
      return false
    }
  }

  if (conditions.cost_center_ids?.length) {
    const ccId = employee.cost_center?.id?.toString()
    if (!ccId || !conditions.cost_center_ids.some(id => id.toString() === ccId)) {
      return false
    }
  }

  if (conditions.holiday_ids?.length) {
    const holidayIds = new Set(ctx.holidays.map(h => h.id.toString()))
    if (!conditions.holiday_ids.some(id => holidayIds.has(id.toString()))) {
      return false
    }
  }

  return true
}

export const isRuleActive = (rule: LaborPayRule): boolean => {
  if (rule.deleted_at) return false
  if (rule.is_active === false) return false
  return true
}

export const isRuleEligible = (
  rule: LaborPayRule,
  ctx: LaborCalculationContext
): boolean => {
  if (!isRuleActive(rule)) return false
  if (!matchesEmployeeScope(rule, ctx)) return false

  const conditions = rule.conditions
  if (!conditions) return true

  const periodStart = toJsDate(ctx.periodStart)
  const periodEnd = toJsDate(ctx.periodEnd)
  const checkDate = periodEnd

  if (!matchesDateRange(conditions, checkDate)) return false
  if (!matchesTimeWindow(conditions, checkDate)) return false

  const totalHours =
    ctx.timeEntries.reduce((sum, e) => {
      if (!e.clock_out) return sum
      const start = toLuxonDateTime(e.clock_in)
      const end = toLuxonDateTime(e.clock_out)
      return sum + end.diff(start, 'hours').hours
    }, 0)

  if (conditions.after_hours_day !== undefined) {
    const dailyMax = ctx.timeEntries.reduce((max, e) => {
      if (!e.clock_out) return max
      const hours = toLuxonDateTime(e.clock_out).diff(toLuxonDateTime(e.clock_in), 'hours').hours
      return Math.max(max, hours)
    }, 0)
    if (dailyMax < conditions.after_hours_day) return false
  }

  if (conditions.after_hours_week !== undefined) {
    const weekHours = (ctx.priorWeekHours ?? 0) + totalHours
    if (weekHours < conditions.after_hours_week) return false
  }

  if (conditions.start_date || conditions.end_date) {
    if (periodEnd < periodStart) return false
  }

  return true
}
