import {describe, expect, it} from 'bun:test';
import {
  buildWindowForBusinessDate,
  formatBusinessDateWindow,
  formatReportRangeForQuery,
  resolveReportDayWindow,
  resolveReportRangeWindow,
} from './business-date.ts';
import type {ClosingCycleConfig} from '@/lib/closing-cycle.ts';

const overnight: ClosingCycleConfig = {
  enabled: true,
  startHour: 6,
  startMinute: 0,
  endHour: 5,
  endMinute: 59,
};

const disabled: ClosingCycleConfig = {
  ...overnight,
  enabled: false,
};

describe('resolveReportDayWindow', () => {
  it('uses cycle 06:00 → next day 05:59 when enabled', () => {
    const win = resolveReportDayWindow(overnight, '2026-11-05');
    expect(win.exclusiveEnd).toBe(false);
    const from = win.date_from;
    const to = win.date_to;
    // Compare in app TZ via ISO hours — buildWindow uses getAppTimezone
    const cycle = buildWindowForBusinessDate(overnight, '2026-11-05');
    expect(win.date_from.getTime()).toBe(cycle.date_from.getTime());
    expect(win.date_to.getTime()).toBe(cycle.date_to.getTime());
    expect(to.getTime()).toBeGreaterThan(from.getTime());
    // ~24h window (minus 1 minute)
    const hours = (to.getTime() - from.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThan(24);
  });

  it('uses calendar midnight when cycle disabled', () => {
    const win = resolveReportDayWindow(disabled, '2026-11-05');
    expect(win.exclusiveEnd).toBe(true);
    const hours = (win.date_to.getTime() - win.date_from.getTime()) / 3_600_000;
    expect(hours).toBe(24);
  });
});

describe('formatBusinessDateWindow', () => {
  it('shows inclusive end for cycle windows', () => {
    const win = resolveReportDayWindow(overnight, '2026-11-05');
    const label = formatBusinessDateWindow(win);
    expect(label).toMatch(/2026-11-05 06:00/);
    expect(label).toMatch(/2026-11-06 05:59/);
    expect(label).toContain('→');
  });

  it('shows last minute of calendar day when exclusive', () => {
    const win = resolveReportDayWindow(disabled, '2026-11-05');
    const label = formatBusinessDateWindow(win);
    expect(label).toMatch(/2026-11-05 00:00/);
    expect(label).toMatch(/2026-11-05 23:59/);
  });
});

describe('formatReportRangeForQuery', () => {
  it('formats Today-style bounds with cycle times', () => {
    const {startDate, endDate} = formatReportRangeForQuery(overnight, '2026-11-05', '2026-11-05');
    expect(startDate).toContain('06:00');
    expect(endDate).toContain('05:59');
  });

  it('spans first start to last end for multi-day', () => {
    const range = resolveReportRangeWindow(overnight, '2026-11-03', '2026-11-05');
    const first = buildWindowForBusinessDate(overnight, '2026-11-03');
    const last = buildWindowForBusinessDate(overnight, '2026-11-05');
    expect(range.date_from.getTime()).toBe(first.date_from.getTime());
    expect(range.date_to.getTime()).toBe(last.date_to.getTime());
  });
});
