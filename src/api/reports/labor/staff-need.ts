import {DateTime} from "luxon";
import {getDemandContext} from "@/api/reports/demand/context.ts";
import {
  DEMAND_HISTORY_DAYS,
  historyQueryRange,
  queryRangeForIsoDates,
  resolveDemandHorizon,
  weekdayName,
} from "@/api/reports/demand/horizon.ts";
import type {LocalEventInput} from "@/api/reports/demand/types.ts";
import {fetchScheduledShifts, fetchTimeEntries} from "@/api/reports/labor/fetch.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {getAppTimezone, toJsDate} from "@/lib/datetime.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {safeNumber} from "@/lib/utils.ts";

const round2 = (value: number) => Math.round(value * 100) / 100;
const roundHeadcount = (value: number) => Math.max(0, Math.round(value));

const isoFromClock = (value: unknown): string | undefined => {
  try {
    const js = toJsDate(value as Parameters<typeof toJsDate>[0]);
    return DateTime.fromJSDate(js).setZone(getAppTimezone()).toISODate() ?? undefined;
  } catch {
    return undefined;
  }
};

const hoursBetween = (start: unknown, end: unknown, durationSeconds?: number): number => {
  if (durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return durationSeconds / 3600;
  }
  try {
    const a = toJsDate(start as Parameters<typeof toJsDate>[0]).getTime();
    const b = toJsDate(end as Parameters<typeof toJsDate>[0]).getTime();
    if (b > a) {
      return (b - a) / 3600000;
    }
  } catch {
    // ignore
  }
  return 0;
};

const overlapMinutes = (startMs: number, endMs: number, windowStart: number, windowEnd: number): number => {
  const start = Math.max(startMs, windowStart);
  const end = Math.min(endMs, windowEnd);
  if (end <= start) {
    return 0;
  }
  return (end - start) / 60000;
};

interface DayLaborStats {
  date: string;
  hours: number;
  peakHeadcount: number;
  peakHour: number;
}

const statsForIntervals = (
  intervals: Array<{start: Date; end: Date}>,
  dateIso: string,
): DayLaborStats => {
  const zone = getAppTimezone();
  const dayStart = DateTime.fromISO(dateIso, {zone}).startOf("day");
  let hours = 0;
  let peakHeadcount = 0;
  let peakHour = 0;
  for (const interval of intervals) {
    hours += Math.max(0, (interval.end.getTime() - interval.start.getTime()) / 3600000);
  }
  for (let hour = 0; hour < 24; hour++) {
    const windowStart = dayStart.plus({hours: hour}).toJSDate().getTime();
    const windowEnd = dayStart.plus({hours: hour + 1}).toJSDate().getTime();
    let concurrent = 0;
    for (const interval of intervals) {
      if (overlapMinutes(interval.start.getTime(), interval.end.getTime(), windowStart, windowEnd) > 0) {
        concurrent += 1;
      }
    }
    if (concurrent > peakHeadcount) {
      peakHeadcount = concurrent;
      peakHour = hour;
    }
  }
  return {date: dateIso, hours: round2(hours), peakHeadcount, peakHour};
};

const weekdayOf = (isoDate: string): number =>
  DateTime.fromISO(isoDate, {zone: getAppTimezone()}).weekday;

const average = (values: number[]): number => {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const formatHourLabel = (hour: number): string => {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
};

export interface ForecastStaffNeedOptions {
  days?: number;
  phrase?: string;
  targetDate?: string;
  prompt?: string;
  startHour?: number;
  endHour?: number;
  localEvents?: LocalEventInput[];
}

export const forecastStaffNeed = async (
  db: DbClient,
  options: ForecastStaffNeedOptions = {},
) => {
  const horizon = resolveDemandHorizon({
    phrase: options.phrase,
    targetDate: options.targetDate,
    days: options.days,
    prompt: options.prompt,
  });
  const historyRange = historyQueryRange(DEMAND_HISTORY_DAYS);
  const scheduleRange = queryRangeForIsoDates(horizon.dates);

  const [context, timeEntries, scheduledShifts] = await Promise.all([
    getDemandContext(db, {dates: horizon.dates, localEvents: options.localEvents}),
    fetchTimeEntries(db, {
      ...historyRange,
      includeOpen: false,
      activeOnly: false,
    }),
    fetchScheduledShifts(db, scheduleRange),
  ]);

  const historyByDate = new Map<string, Array<{start: Date; end: Date}>>();
  timeEntries.forEach(entry => {
    if (!entry.clock_out) {
      return;
    }
    const date = isoFromClock(entry.clock_in);
    if (!date) {
      return;
    }
    const start = toJsDate(entry.clock_in as Parameters<typeof toJsDate>[0]);
    const hours = hoursBetween(entry.clock_in, entry.clock_out, safeNumber(entry.duration_seconds) || undefined);
    const end = new Date(start.getTime() + hours * 3600000);
    const list = historyByDate.get(date) ?? [];
    list.push({start, end});
    historyByDate.set(date, list);
  });

  const historyStats: DayLaborStats[] = Array.from(historyByDate.keys())
    .sort()
    .map(date => statsForIntervals(historyByDate.get(date) || [], date));

  const scheduleByDate = new Map<string, Array<{start: Date; end: Date; employeeId: string}>>();
  scheduledShifts.forEach(shift => {
    const date = isoFromClock(shift.start_at);
    if (!date || !horizon.dates.includes(date)) {
      return;
    }
    const start = toJsDate(shift.start_at as Parameters<typeof toJsDate>[0]);
    const end = toJsDate(shift.end_at as Parameters<typeof toJsDate>[0]);
    const list = scheduleByDate.get(date) ?? [];
    list.push({
      start,
      end,
      employeeId: recordIdToString(shift.employee) || String(shift.employee ?? ""),
    });
    scheduleByDate.set(date, list);
  });

  const dayByDate = new Map(context.days.map(day => [day.date, day]));

  const days = horizon.dates.map(date => {
    const weekday = weekdayOf(date);
    const same = historyStats.filter(row => weekdayOf(row.date) === weekday);
    const prior = same.filter(row => row.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
    const avgHours = same.length ? average(same.map(row => row.hours)) : average(historyStats.map(row => row.hours));
    const avgPeak = same.length ? average(same.map(row => row.peakHeadcount)) : average(historyStats.map(row => row.peakHeadcount));
    const avgPeakHour = same.length
      ? Math.round(average(same.map(row => row.peakHour)))
      : Math.round(average(historyStats.map(row => row.peakHour)));
    const day = dayByDate.get(date);
    const multiplier = day?.multiplier ?? 1;
    const recommendedHours = round2(avgHours * multiplier);
    const recommendedHeadcount = roundHeadcount(avgPeak * multiplier);
    const scheduled = scheduleByDate.get(date) || [];
    const scheduledStats = scheduled.length ? statsForIntervals(scheduled, date) : undefined;
    const scheduledHeadcount = scheduled.length
      ? new Set(scheduled.map(row => row.employeeId).filter(Boolean)).size
      : 0;

    return {
      date,
      weekday: weekdayName(date),
      multiplier,
      drivers: day?.drivers ?? [],
      priorSameWeekdayHours: prior ? round2(prior.hours) : 0,
      priorSameWeekdayHeadcount: prior?.peakHeadcount ?? 0,
      priorSameWeekdayDate: prior?.date,
      recommendedHours,
      recommendedHeadcount,
      peakHour: formatHourLabel(avgPeakHour || 0),
      peakHeadcount: recommendedHeadcount,
      scheduledHours: scheduledStats ? scheduledStats.hours : undefined,
      scheduledHeadcount: scheduled.length ? scheduledHeadcount : undefined,
      gapHours: scheduledStats ? round2(recommendedHours - scheduledStats.hours) : undefined,
      gapHeadcount: scheduled.length ? recommendedHeadcount - scheduledHeadcount : undefined,
    };
  });

  const method = "Same-weekday average clocked hours and peak concurrent headcount (28-day history), adjusted for holidays/weather/prompt events.";
  const confidenceNote = historyStats.length < 7
    ? "Low confidence: fewer than 7 days of clocked history."
    : historyStats.length < 14
      ? "Low confidence: less than 14 days of clocked history."
      : "Moderate confidence based on same-weekday averages. Projections are estimates.";

  return {
    found: historyStats.length > 0 || days.length > 0,
    mode: horizon.mode,
    targetDate: horizon.targetDate,
    horizonDays: horizon.horizonDays,
    historyDays: DEMAND_HISTORY_DAYS,
    days,
    context: {
      ...context,
      warnings: [...horizon.warnings, ...context.warnings],
    },
    method,
    confidenceNote,
  };
};
