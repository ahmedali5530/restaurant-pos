import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bucketHours, entryWorkedHours } from './hours.calculations.ts'
import {
  computeNightPremiumHours,
  computeWeekendPremiumHours,
} from './premium.calculations.ts'
import type { TimeEntryWithBreaks } from '@/lib/labor-engine/types.ts'

type BreakInput = {
  break_type: 'paid' | 'unpaid'
  start_at: string
  end_at: string
}

const makeEntry = (
  overrides: Record<string, unknown> = {}
): TimeEntryWithBreaks =>
  ({
    clock_in: '2026-01-05T09:00:00Z',
    clock_out: '2026-01-05T17:00:00Z',
    ...overrides,
  } as unknown as TimeEntryWithBreaks)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('bucketHours weekly overtime', () => {
  it('resets the weekly OT budget on ISO week boundaries regardless of app timezone', () => {
    // Regression: parsing the bare business date through toLuxonDateTime treats
    // it as UTC midnight and re-zones it, shifting the ISO week in negative-
    // offset zones — which paid weekly OT as regular time.
    vi.stubEnv('VITE_APP_TIMEZONE', 'America/New_York')

    const daily = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-01-${String(5 + index).padStart(2, '0')}`,
      hours: 8,
    }))

    const result = bucketHours(daily, {
      dailyOtThreshold: 8,
      weeklyOtThreshold: 40,
    })

    expect(result.regularHours).toBe(40)
    expect(result.overtimeHours).toBe(16)
  })

  it('does not treat a normal 40-hour week as overtime', () => {
    const daily = [
      { date: '2026-01-05', hours: 8 },
      { date: '2026-01-06', hours: 8 },
      { date: '2026-01-07', hours: 8 },
      { date: '2026-01-08', hours: 8 },
      { date: '2026-01-09', hours: 8 },
    ]

    const result = bucketHours(daily, {
      dailyOtThreshold: 8,
      weeklyOtThreshold: 40,
    })

    expect(result.regularHours).toBe(40)
    expect(result.overtimeHours).toBe(0)
  })
})

describe('entryWorkedHours', () => {
  it('subtracts unpaid breaks from duration_seconds (gross) entries', () => {
    const entry = makeEntry({
      duration_seconds: 8 * 3600,
      breaks: [
        {
          break_type: 'unpaid',
          start_at: '2026-01-05T12:00:00Z',
          end_at: '2026-01-05T12:30:00Z',
        } satisfies BreakInput,
      ],
    })

    expect(entryWorkedHours(entry)).toBeCloseTo(7.5, 5)
  })

  it('ignores paid breaks', () => {
    const entry = makeEntry({
      duration_seconds: 8 * 3600,
      breaks: [
        {
          break_type: 'paid',
          start_at: '2026-01-05T12:00:00Z',
          end_at: '2026-01-05T12:30:00Z',
        } satisfies BreakInput,
      ],
    })

    expect(entryWorkedHours(entry)).toBeCloseTo(8, 5)
  })
})

describe('premium break handling', () => {
  beforeEach(() => {
    // Simulate wall-clock times directly: pin the app timezone to UTC so the
    // Z-suffixed clock times land in the 22:00–06:00 night window.
    vi.stubEnv('VITE_APP_TIMEZONE', 'UTC')
  })

  it('subtracts only the exact break overlap from night premium', () => {
    // The break starts 5 minutes past a slice boundary; the old logic dropped
    // the whole overlapping 15-minute slice (45 min) instead of 30.
    const entry = makeEntry({
      clock_in: '2026-01-05T22:00:00Z',
      clock_out: '2026-01-06T06:00:00Z',
      breaks: [
        {
          break_type: 'unpaid',
          start_at: '2026-01-06T02:05:00Z',
          end_at: '2026-01-06T02:35:00Z',
        } satisfies BreakInput,
      ],
    })

    const buckets = computeNightPremiumHours([entry])
    expect(buckets).toHaveLength(1)
    expect(buckets[0].hours).toBeCloseTo(7.5, 5)
  })

  it('excludes unpaid breaks from weekend premium', () => {
    // 2026-01-04 is a Sunday.
    const entry = makeEntry({
      clock_in: '2026-01-04T09:00:00Z',
      clock_out: '2026-01-04T17:00:00Z',
      duration_seconds: 8 * 3600,
      breaks: [
        {
          break_type: 'unpaid',
          start_at: '2026-01-04T12:00:00Z',
          end_at: '2026-01-04T12:30:00Z',
        } satisfies BreakInput,
      ],
    })

    const buckets = computeWeekendPremiumHours([entry])
    expect(buckets).toHaveLength(1)
    expect(buckets[0].hours).toBeCloseTo(7.5, 5)
  })
})
