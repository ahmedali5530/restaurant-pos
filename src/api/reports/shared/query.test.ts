import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCreatedAtDateConditions,
  toReportBoundaryUtcIso,
} from './query.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('toReportBoundaryUtcIso', () => {
  it('leaves a start boundary at the start of the named minute', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'UTC')
    expect(toReportBoundaryUtcIso('2026-10-02 23:59')).toBe(
      '2026-10-02T23:59:00.000Z'
    )
  })

  it('extends a minute-precision end boundary to the end of that minute', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'UTC')
    expect(toReportBoundaryUtcIso('2026-10-02 23:59', { endOfRange: true })).toBe(
      '2026-10-02T23:59:59.999Z'
    )
  })

  it('keeps a second-precision end boundary unchanged', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'UTC')
    expect(
      toReportBoundaryUtcIso('2026-10-02T23:59:30Z', { endOfRange: true })
    ).toBe('2026-10-02T23:59:30.000Z')
  })

  it('treats a bare date start as local midnight', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'UTC')
    expect(toReportBoundaryUtcIso('2026-10-02')).toBe(
      '2026-10-02T00:00:00.000Z'
    )
  })

  it('treats a bare date end as the next local midnight (exclusive)', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'UTC')
    expect(toReportBoundaryUtcIso('2026-10-02', { endOfRange: true })).toBe(
      '2026-10-03T00:00:00.000Z'
    )
  })

  it('interprets wall-clock boundaries in the configured timezone', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'Asia/Karachi') // UTC+5
    expect(toReportBoundaryUtcIso('2026-10-02 00:00')).toBe(
      '2026-10-01T19:00:00.000Z'
    )
  })

  it('handles half-hour timezone offsets', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'Asia/Kolkata') // UTC+5:30
    expect(toReportBoundaryUtcIso('2026-10-02')).toBe(
      '2026-10-01T18:30:00.000Z'
    )
  })

  it('crosses a DST boundary correctly when expanding a bare end date', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'America/New_York')
    // 2026-03-08 00:00 local is still EST (UTC-5); DST starts at 02:00.
    expect(toReportBoundaryUtcIso('2026-03-07', { endOfRange: true })).toBe(
      '2026-03-08T05:00:00.000Z'
    )
  })

  it('returns undefined and warns for an unparseable boundary', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'UTC')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toReportBoundaryUtcIso('not-a-date')).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('buildCreatedAtDateConditions', () => {
  it('uses an inclusive end-of-minute condition for a datetime end', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'UTC')
    const { conditions, params } = buildCreatedAtDateConditions({
      startDate: '2026-10-02 00:00',
      endDate: '2026-10-02 23:59',
    })

    expect(conditions).toEqual([
      'created_at >= <datetime>$startDate',
      'created_at <= <datetime>$endDate',
    ])
    expect(params).toEqual({
      startDate: '2026-10-02T00:00:00.000Z',
      endDate: '2026-10-02T23:59:59.999Z',
    })
  })

  it('uses an exclusive next-day condition for a bare end date', () => {
    vi.stubEnv('VITE_APP_TIMEZONE', 'UTC')
    const { conditions, params } = buildCreatedAtDateConditions({
      endDate: '2026-10-02',
    })

    expect(conditions).toEqual(['created_at < <datetime>$endDate'])
    expect(params).toEqual({ endDate: '2026-10-03T00:00:00.000Z' })
  })
})
