import {
  DEFAULT_DAILY_OT_THRESHOLD_HOURS,
  DEFAULT_DOUBLE_TIME_THRESHOLD_HOURS,
  DEFAULT_WEEKLY_OT_THRESHOLD_HOURS,
} from '@/lib/labor-engine/constants.ts'
import type {
  HourBucket,
  HoursBreakdown,
  TimeEntryWithBreaks,
} from '@/lib/labor-engine/types.ts'
import { toLuxonDateTime } from '@/lib/datetime.ts'
import { safeNumber } from '@/lib/utils.ts'

export interface HoursPolicyThresholds {
  dailyOtThreshold?: number
  weeklyOtThreshold?: number
  doubleTimeThreshold?: number
  maxHoursPerDay?: number
  maxHoursPerWeek?: number
}

const roundHours = (hours: number): number => {
  return Math.round(hours * 100) / 100
}

const entryWorkedHours = (entry: TimeEntryWithBreaks): number => {
  if (entry.duration_seconds !== undefined && entry.duration_seconds !== null) {
    return roundHours(safeNumber(entry.duration_seconds) / 3600)
  }
  if (!entry.clock_out) return 0

  const start = toLuxonDateTime(entry.clock_in)
  const end = toLuxonDateTime(entry.clock_out)
  let gross = end.diff(start, 'hours').hours

  const breaks = entry.breaks ?? []
  for (const br of breaks) {
    if (!br.end_at) continue
    const bStart = toLuxonDateTime(br.start_at)
    const bEnd = toLuxonDateTime(br.end_at)
    if (br.break_type === 'unpaid') {
      gross -= bEnd.diff(bStart, 'hours').hours
    }
  }

  return roundHours(Math.max(0, gross))
}

const breakHours = (entry: TimeEntryWithBreaks): { paid: number; unpaid: number } => {
  let paid = 0
  let unpaid = 0
  for (const br of entry.breaks ?? []) {
    if (!br.end_at) continue
    const hours = toLuxonDateTime(br.end_at).diff(toLuxonDateTime(br.start_at), 'hours').hours
    if (br.break_type === 'paid') paid += hours
    else unpaid += hours
  }
  return { paid: roundHours(paid), unpaid: roundHours(unpaid) }
}

interface DailyHours {
  date: string
  hours: number
}

export const computeHoursFromEntries = (
  entries: TimeEntryWithBreaks[]
): { totalHours: number; daily: DailyHours[]; paidBreakHours: number; unpaidBreakHours: number } => {
  const dailyMap = new Map<string, number>()
  let paidBreakHours = 0
  let unpaidBreakHours = 0

  for (const entry of entries) {
    const hours = entryWorkedHours(entry)
    const date = toLuxonDateTime(entry.clock_in).toFormat('yyyy-MM-dd')
    dailyMap.set(date, roundHours((dailyMap.get(date) ?? 0) + hours))

    const br = breakHours(entry)
    paidBreakHours = roundHours(paidBreakHours + br.paid)
    unpaidBreakHours = roundHours(unpaidBreakHours + br.unpaid)
  }

  const daily = [...dailyMap.entries()]
    .map(([date, hours]) => ({ date, hours }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalHours = roundHours(daily.reduce((s, d) => s + d.hours, 0))

  return { totalHours, daily, paidBreakHours, unpaidBreakHours }
}

export const bucketHours = (
  daily: DailyHours[],
  thresholds: HoursPolicyThresholds = {},
  priorWeekHours = 0
): HoursBreakdown => {
  const dailyOt =
    thresholds.dailyOtThreshold ?? DEFAULT_DAILY_OT_THRESHOLD_HOURS
  const weeklyOt =
    thresholds.weeklyOtThreshold ?? DEFAULT_WEEKLY_OT_THRESHOLD_HOURS
  const doubleTimeThreshold =
    thresholds.doubleTimeThreshold ?? DEFAULT_DOUBLE_TIME_THRESHOLD_HOURS

  const buckets: HourBucket[] = []
  let regularHours = 0
  let overtimeHours = 0
  let doubleTimeHours = 0
  let runningWeekHours = priorWeekHours

  for (const day of daily) {
    let remaining = day.hours
    let dayRegular = 0
    let dayOt = 0
    let dayDouble = 0

    const dailyRegularCap = dailyOt
    const toRegular = Math.min(remaining, Math.max(0, dailyRegularCap))
    dayRegular = toRegular
    remaining = roundHours(remaining - toRegular)

    if (remaining > 0) {
      const otCap = Math.max(0, doubleTimeThreshold - dailyRegularCap)
      const toOt = Math.min(remaining, otCap)
      dayOt = toOt
      remaining = roundHours(remaining - toOt)
    }

    if (remaining > 0) {
      dayDouble = remaining
      remaining = 0
    }

    runningWeekHours = roundHours(runningWeekHours + day.hours)
    if (runningWeekHours > weeklyOt) {
      const weeklyExcess = roundHours(runningWeekHours - weeklyOt)
      const shiftFromRegular = Math.min(dayRegular, weeklyExcess)
      dayRegular = roundHours(dayRegular - shiftFromRegular)
      dayOt = roundHours(dayOt + shiftFromRegular)
    }

    regularHours = roundHours(regularHours + dayRegular)
    overtimeHours = roundHours(overtimeHours + dayOt)
    doubleTimeHours = roundHours(doubleTimeHours + dayDouble)

    if (dayRegular > 0) {
      buckets.push({ type: 'regular', hours: dayRegular, date: day.date })
    }
    if (dayOt > 0) {
      buckets.push({ type: 'overtime', hours: dayOt, date: day.date })
    }
    if (dayDouble > 0) {
      buckets.push({ type: 'double_time', hours: dayDouble, date: day.date })
    }
  }

  return {
    regularHours,
    overtimeHours,
    doubleTimeHours,
    totalHours: roundHours(regularHours + overtimeHours + doubleTimeHours),
    buckets,
    premiumBuckets: [],
    paidBreakHours: 0,
    unpaidBreakHours: 0,
  }
}

export const computeHoursBreakdown = (
  entries: TimeEntryWithBreaks[],
  thresholds: HoursPolicyThresholds = {},
  priorWeekHours = 0
): HoursBreakdown => {
  const { totalHours, daily, paidBreakHours, unpaidBreakHours } =
    computeHoursFromEntries(entries)
  const bucketed = bucketHours(daily, thresholds, priorWeekHours)

  return {
    ...bucketed,
    totalHours,
    paidBreakHours,
    unpaidBreakHours,
  }
}

export const thresholdsFromPayProfile = (
  profile: { maximum_hours_per_day?: number; maximum_hours_per_week?: number; overtime_policy?: { config?: { threshold_hours?: number; multiplier?: number } } }
): HoursPolicyThresholds => ({
  dailyOtThreshold:
    profile.overtime_policy?.config?.threshold_hours ?? DEFAULT_DAILY_OT_THRESHOLD_HOURS,
  weeklyOtThreshold:
    profile.maximum_hours_per_week ?? DEFAULT_WEEKLY_OT_THRESHOLD_HOURS,
  doubleTimeThreshold: DEFAULT_DOUBLE_TIME_THRESHOLD_HOURS,
  maxHoursPerDay: profile.maximum_hours_per_day,
  maxHoursPerWeek: profile.maximum_hours_per_week,
})
