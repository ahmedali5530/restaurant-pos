import type { LeaveRequest } from '@/api/model/leave_request.ts'
import type { TimeEntry } from '@/api/model/time_entry.ts'
import type { DateInput } from '@/lib/datetime.ts'
import { toLuxonDateTime } from '@/lib/datetime.ts'

export const isSalariedPayType = (payType?: string): boolean =>
  payType === 'monthly_salary' ||
  payType === 'weekly_salary' ||
  payType === 'contract'

export const isDailyPayType = (payType?: string): boolean =>
  payType === 'daily_wage'

export const isHourlyLikePayType = (payType?: string): boolean =>
  !payType ||
  payType === 'hourly' ||
  payType === 'commission' ||
  payType === 'mixed'

export const isWorkDaysPayType = (payType?: string): boolean =>
  isDailyPayType(payType) || isSalariedPayType(payType)

const dateKey = (value: DateInput): string =>
  toLuxonDateTime(value).toFormat('yyyy-MM-dd')

export const enumerateDateKeys = (
  start: DateInput,
  end: DateInput,
  workWeekdays?: number[]
): string[] => {
  const from = toLuxonDateTime(start).startOf('day')
  const to = toLuxonDateTime(end).startOf('day')
  if (!from.isValid || !to.isValid || from > to) return []

  const filter =
    Array.isArray(workWeekdays) && workWeekdays.length > 0
      ? new Set(workWeekdays.map(day => Number(day)))
      : null

  const keys: string[] = []
  let cursor = from
  while (cursor <= to) {
    if (!filter || filter.has(cursor.weekday)) {
      keys.push(cursor.toFormat('yyyy-MM-dd'))
    }
    cursor = cursor.plus({ days: 1 })
  }
  return keys
}

export const uniqueClockDateKeys = (timeEntries: TimeEntry[]): Set<string> => {
  const days = new Set<string>()
  for (const entry of timeEntries) {
    if (!entry.clock_in) continue
    days.add(dateKey(entry.clock_in))
  }
  return days
}

const isPaidLeaveType = (request: LeaveRequest): boolean => {
  const leaveType = request.leave_type
  if (leaveType && typeof leaveType === 'object') {
    return leaveType.paid !== false
  }
  return true
}

export interface PayrollCalendarInput {
  timeEntries: TimeEntry[]
  leaveRequests?: LeaveRequest[]
  periodStart: DateInput
  periodEnd: DateInput
  workWeekdays?: number[]
}

export interface PayrollCalendar {
  clockDays: string[]
  paidLeaveDays: string[]
  unpaidLeaveDays: string[]
  paidDays: number
  unpaidLeaveDaysCount: number
}

export const computePayrollCalendar = ({
  timeEntries,
  leaveRequests = [],
  periodStart,
  periodEnd,
  workWeekdays,
}: PayrollCalendarInput): PayrollCalendar => {
  const clockDays = uniqueClockDateKeys(timeEntries)
  const paidLeave = new Set<string>()
  const unpaidLeave = new Set<string>()

  const periodFrom = toLuxonDateTime(periodStart).startOf('day')
  const periodTo = toLuxonDateTime(periodEnd).startOf('day')

  for (const request of leaveRequests) {
    if (request.status && request.status !== 'approved') continue

    const leaveStart = toLuxonDateTime(request.start_date).startOf('day')
    const leaveEnd = toLuxonDateTime(request.end_date).startOf('day')
    if (!leaveStart.isValid || !leaveEnd.isValid) continue

    const from = leaveStart > periodFrom ? leaveStart : periodFrom
    const to = leaveEnd < periodTo ? leaveEnd : periodTo
    if (from > to) continue

    const keys = enumerateDateKeys(from, to, workWeekdays)
    const target = isPaidLeaveType(request) ? paidLeave : unpaidLeave
    for (const key of keys) {
      target.add(key)
    }
  }

  const paidDaysSet = new Set<string>([...clockDays, ...paidLeave])
  for (const day of unpaidLeave) {
    paidDaysSet.delete(day)
  }

  return {
    clockDays: [...clockDays].sort(),
    paidLeaveDays: [...paidLeave].sort(),
    unpaidLeaveDays: [...unpaidLeave].sort(),
    paidDays: paidDaysSet.size,
    unpaidLeaveDaysCount: unpaidLeave.size,
  }
}
