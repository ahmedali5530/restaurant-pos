import {
  DEFAULT_HOLIDAY_MULTIPLIER,
  DEFAULT_NIGHT_END_TIME,
  DEFAULT_NIGHT_MULTIPLIER,
  DEFAULT_NIGHT_START_TIME,
  DEFAULT_WEEKEND_DAYS,
  DEFAULT_WEEKEND_MULTIPLIER,
} from '@/lib/labor-engine/constants.ts'
import type {
  PremiumHourBucket,
  PublicHoliday,
  TimeEntryWithBreaks,
} from '@/lib/labor-engine/types.ts'
import { toLuxonDateTime } from '@/lib/datetime.ts'
import { safeNumber } from '@/lib/utils.ts'

const roundHours = (hours: number): number => Math.round(hours * 100) / 100

const parseTimeToMinutes = (time: string): number => {
  const [hh, mm] = time.split(':').map(Number)
  return hh * 60 + (mm || 0)
}

const isNightMinute = (
  minuteOfDay: number,
  startMin: number,
  endMin: number
): boolean => {
  if (startMin <= endMin) {
    return minuteOfDay >= startMin && minuteOfDay <= endMin
  }
  return minuteOfDay >= startMin || minuteOfDay <= endMin
}

const holidayDateSet = (holidays: PublicHoliday[]): Map<string, PublicHoliday> => {
  const map = new Map<string, PublicHoliday>()
  for (const h of holidays) {
    if (h.deleted_at || h.is_active === false) continue
    const key = toLuxonDateTime(h.date).toFormat('yyyy-MM-dd')
    map.set(key, h)
  }
  return map
}

const getHolidayMultiplier = (holiday: PublicHoliday): number => {
  return safeNumber(
    holiday.labor_policy?.config?.multiplier,
    DEFAULT_HOLIDAY_MULTIPLIER
  )
}

export interface PremiumPolicyConfig {
  nightStart?: string
  nightEnd?: string
  nightMultiplier?: number
  weekendDays?: number[]
  weekendMultiplier?: number
}

export const computeNightPremiumHours = (
  entries: TimeEntryWithBreaks[],
  config: PremiumPolicyConfig = {}
): PremiumHourBucket[] => {
  const startTime = config.nightStart ?? DEFAULT_NIGHT_START_TIME
  const endTime = config.nightEnd ?? DEFAULT_NIGHT_END_TIME
  const multiplier = config.nightMultiplier ?? DEFAULT_NIGHT_MULTIPLIER
  const startMin = parseTimeToMinutes(startTime)
  const endMin = parseTimeToMinutes(endTime)

  const buckets: PremiumHourBucket[] = []

  for (const entry of entries) {
    if (!entry.clock_out) continue
    const start = toLuxonDateTime(entry.clock_in)
    const end = toLuxonDateTime(entry.clock_out)
    let cursor = start
    let nightHours = 0

    while (cursor < end) {
      const next = cursor.plus({ minutes: 15 })
      const sliceEnd = next > end ? end : next
      const midMinute = cursor.hour * 60 + cursor.minute + 7.5
      if (isNightMinute(midMinute, startMin, endMin)) {
        nightHours += sliceEnd.diff(cursor, 'hours').hours
      }
      cursor = sliceEnd
    }

    if (nightHours > 0) {
      buckets.push({
        type: 'night',
        hours: roundHours(nightHours),
        date: start.toFormat('yyyy-MM-dd'),
        multiplier,
      })
    }
  }

  return buckets
}

export const computeWeekendPremiumHours = (
  entries: TimeEntryWithBreaks[],
  config: PremiumPolicyConfig = {}
): PremiumHourBucket[] => {
  const weekendDays = config.weekendDays ?? [...DEFAULT_WEEKEND_DAYS]
  const multiplier = config.weekendMultiplier ?? DEFAULT_WEEKEND_MULTIPLIER
  const buckets: PremiumHourBucket[] = []

  for (const entry of entries) {
    if (!entry.clock_out) continue
    const start = toLuxonDateTime(entry.clock_in)
    const end = toLuxonDateTime(entry.clock_out)
    const hours = roundHours(end.diff(start, 'hours').hours)

    if (weekendDays.includes(start.weekday % 7)) {
      buckets.push({
        type: 'weekend',
        hours,
        date: start.toFormat('yyyy-MM-dd'),
        multiplier,
      })
    }
  }

  return buckets
}

export const computeHolidayPremiumHours = (
  entries: TimeEntryWithBreaks[],
  holidays: PublicHoliday[]
): PremiumHourBucket[] => {
  const holidayMap = holidayDateSet(holidays)
  const buckets: PremiumHourBucket[] = []

  for (const entry of entries) {
    if (!entry.clock_out) continue
    const start = toLuxonDateTime(entry.clock_in)
    const dateKey = start.toFormat('yyyy-MM-dd')
    const holiday = holidayMap.get(dateKey)
    if (!holiday) continue

    const end = toLuxonDateTime(entry.clock_out)
    const hours = roundHours(end.diff(start, 'hours').hours)
    buckets.push({
      type: 'holiday',
      hours,
      date: dateKey,
      holidayId: holiday.id,
      multiplier: getHolidayMultiplier(holiday),
    })
  }

  return buckets
}

export const computePremiumBuckets = (
  entries: TimeEntryWithBreaks[],
  holidays: PublicHoliday[],
  config: PremiumPolicyConfig = {}
): PremiumHourBucket[] => {
  return [
    ...computeNightPremiumHours(entries, config),
    ...computeWeekendPremiumHours(entries, config),
    ...computeHolidayPremiumHours(entries, holidays),
  ]
}

export const computePremiumPay = (
  premiumBuckets: PremiumHourBucket[],
  baseRate: number
): number => {
  const regularRate = safeNumber(baseRate)
  let premiumPay = 0

  for (const bucket of premiumBuckets) {
    const extraMultiplier = Math.max(0, bucket.multiplier - 1)
    premiumPay += bucket.hours * regularRate * extraMultiplier
  }

  return Math.round((premiumPay + Number.EPSILON) * 100) / 100
}

export const premiumConfigFromPayProfile = (profile: {
  night_policy?: { config?: { start_time?: string; end_time?: string; multiplier?: number } }
  weekend_policy?: { config?: { days_of_week?: number[]; multiplier?: number } }
}): PremiumPolicyConfig => ({
  nightStart: profile.night_policy?.config?.start_time ?? DEFAULT_NIGHT_START_TIME,
  nightEnd: profile.night_policy?.config?.end_time ?? DEFAULT_NIGHT_END_TIME,
  nightMultiplier: profile.night_policy?.config?.multiplier ?? DEFAULT_NIGHT_MULTIPLIER,
  weekendDays: profile.weekend_policy?.config?.days_of_week ?? [...DEFAULT_WEEKEND_DAYS],
  weekendMultiplier:
    profile.weekend_policy?.config?.multiplier ?? DEFAULT_WEEKEND_MULTIPLIER,
})
