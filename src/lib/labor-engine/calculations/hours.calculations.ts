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
import { DateTime } from 'luxon'

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

/** Unpaid break windows for an entry, as Luxon instants — used by premium
 *  (night/weekend/holiday) calculations to exclude break time the same way
 *  the regular/overtime bucketing already does. */
export const unpaidBreakIntervals = (
  entry: TimeEntryWithBreaks
): Array<{ start: ReturnType<typeof toLuxonDateTime>; end: ReturnType<typeof toLuxonDateTime> }> => {
  const intervals: Array<{ start: ReturnType<typeof toLuxonDateTime>; end: ReturnType<typeof toLuxonDateTime> }> = []
  for (const br of entry.breaks ?? []) {
    if (!br.end_at || br.break_type !== 'unpaid') continue
    intervals.push({ start: toLuxonDateTime(br.start_at), end: toLuxonDateTime(br.end_at) })
  }
  return intervals
}

const unpaidBreakHours = (entry: TimeEntryWithBreaks): number =>
  unpaidBreakIntervals(entry).reduce(
    (sum, br) => sum + br.end.diff(br.start, 'hours').hours,
    0
  )

export const entryWorkedHours = (entry: TimeEntryWithBreaks): number => {
  // Unpaid breaks must be excluded no matter which source the gross duration
  // came from. `duration_seconds` is stored as clock_out - clock_in (gross of
  // breaks), so it needs the same subtraction as the raw clock path below —
  // otherwise regular/overtime hours and weekend/holiday premium over-count.
  const unpaid = unpaidBreakHours(entry)

  if (entry.duration_seconds !== undefined && entry.duration_seconds !== null) {
    return roundHours(Math.max(0, safeNumber(entry.duration_seconds) / 3600 - unpaid))
  }
  if (!entry.clock_out) return 0

  const gross = toLuxonDateTime(entry.clock_out).diff(
    toLuxonDateTime(entry.clock_in),
    'hours'
  ).hours

  return roundHours(Math.max(0, gross - unpaid))
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

/** ISO calendar week (Mon-Sun) key — the weekly OT threshold resets here. */
const weekKeyForDate = (date: string): string => {
  // `date` is a business calendar day (yyyy-MM-dd) from `daily`. Parse it as a
  // plain calendar date, NOT through toLuxonDateTime: that treats an
  // offset-less string as a UTC instant and re-zones it, which shifts the day
  // (and therefore the ISO week) backwards in any negative-offset timezone —
  // resetting the weekly overtime budget on the wrong day.
  const dt = DateTime.fromISO(date, { zone: 'utc' })
  return `${dt.weekYear}-${dt.weekNumber}`
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

  // Hours already worked earlier in the SAME calendar week as the first day
  // in `daily` (e.g. a pay period that starts mid-week). Only the caller's
  // priorWeekHours seeds this; it is not carried over to later weeks.
  let currentWeekKey: string | null = null
  let weekHoursBeforeToday = 0

  for (const day of daily) {
    const weekKey = weekKeyForDate(day.date)
    if (weekKey !== currentWeekKey) {
      weekHoursBeforeToday = currentWeekKey === null ? priorWeekHours : 0
      currentWeekKey = weekKey
    }

    // Daily rule: hours beyond the double-time threshold are double-time
    // regardless of the week — this is purely "too many hours in one day".
    const dayDouble = Math.max(0, roundHours(day.hours - doubleTimeThreshold))
    const nonDoubleHours = roundHours(day.hours - dayDouble)

    // An hour only counts as "regular" if it clears BOTH the daily cap AND
    // the remaining weekly budget — whichever threshold is hit first wins.
    // This replaces the old approach of computing daily buckets first and
    // then retroactively "shifting" a flat weekly-excess amount out of
    // regular, which double-counted hours that were already daily-overtime.
    const dailyRegularEligible = Math.min(nonDoubleHours, Math.max(0, dailyOt))
    const weekBudgetRemaining = Math.max(0, roundHours(weeklyOt - weekHoursBeforeToday))
    const dayRegular = Math.min(dailyRegularEligible, weekBudgetRemaining)
    const dayOt = roundHours(nonDoubleHours - dayRegular)

    weekHoursBeforeToday = roundHours(weekHoursBeforeToday + day.hours)

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
