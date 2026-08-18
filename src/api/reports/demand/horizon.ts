import {DateTime} from "luxon";
import {formatDateTimeForQuery} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";
import {getAppTimezone, toJsDate} from "@/lib/datetime.ts";
import type {DemandHorizon} from "@/api/reports/demand/types.ts";

const WEEKDAY_NAMES: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
};

export const MAX_DEMAND_HORIZON_DAYS = 14;
export const DEFAULT_DEMAND_HORIZON_DAYS = 7;
export const DEMAND_HISTORY_DAYS = 28;

const getNow = () => DateTime.now().setZone(getAppTimezone());

export const toIsoDate = (value: unknown): string | undefined => {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  try {
    const js = toJsDate(value as Parameters<typeof toJsDate>[0]);
    const dt = DateTime.fromJSDate(js).setZone(getAppTimezone());
    return dt.isValid ? dt.toISODate() ?? undefined : undefined;
  } catch {
    const iso = DateTime.fromISO(String(value), {zone: getAppTimezone()});
    return iso.isValid ? iso.toISODate() ?? undefined : undefined;
  }
};

export const weekdayName = (isoDate: string): string => {
  const dt = DateTime.fromISO(isoDate, {zone: getAppTimezone()});
  return dt.isValid ? dt.toFormat("cccc") : "";
};

export const upcomingWeekday = (weekday: number, now: DateTime = getNow(), forceNext = false): DateTime => {
  const daysAhead = (weekday - now.weekday + 7) % 7;
  if (forceNext && daysAhead === 0) {
    return now.plus({days: 7}).startOf("day");
  }
  return now.plus({days: daysAhead}).startOf("day");
};

export const isoDateRange = (startIso: string, count: number): string[] => {
  const zone = getAppTimezone();
  const start = DateTime.fromISO(startIso, {zone}).startOf("day");
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const iso = start.plus({days: i}).toISODate();
    if (iso) {
      dates.push(iso);
    }
  }
  return dates;
};

export const historyQueryRange = (historyDays = DEMAND_HISTORY_DAYS): DateRangeFilter => {
  const now = getNow();
  const start = now.minus({days: historyDays}).startOf("day");
  return {
    startDate: formatDateTimeForQuery(start),
    endDate: formatDateTimeForQuery(now.endOf("day")),
  };
};

export const queryRangeForIsoDates = (dates: string[]): DateRangeFilter => {
  if (!dates.length) {
    return {};
  }
  const zone = getAppTimezone();
  const start = DateTime.fromISO(dates[0], {zone}).startOf("day");
  const end = DateTime.fromISO(dates[dates.length - 1], {zone}).endOf("day");
  return {
    startDate: formatDateTimeForQuery(start),
    endDate: formatDateTimeForQuery(end),
  };
};

const clampDays = (days?: number, fallback = DEFAULT_DEMAND_HORIZON_DAYS): number => {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.min(MAX_DEMAND_HORIZON_DAYS, Math.max(1, Math.round(n)));
};

const parseNamedDay = (text: string, now: DateTime): DateTime | undefined => {
  const normalized = text.trim().toLowerCase();
  if (/\btomorrow\b/.test(normalized)) {
    return now.plus({days: 1}).startOf("day");
  }
  const weekend = normalized.match(/\b(this|next|coming)?\s*weekend\b/);
  if (weekend) {
    return upcomingWeekday(6, now, weekend[1] === "next");
  }
  const match = normalized.match(/\b(this|next|coming)?\s*(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun)\b/);
  if (!match) {
    return undefined;
  }
  const modifier = match[1];
  const weekday = WEEKDAY_NAMES[match[2]];
  if (!weekday) {
    return undefined;
  }
  return upcomingWeekday(weekday, now, modifier === "next");
};

export const resolveDemandHorizon = (options: {
  phrase?: string;
  targetDate?: string;
  days?: number;
  prompt?: string;
} = {}): DemandHorizon => {
  const now = getNow();
  const warnings: string[] = [];
  const combined = [options.phrase, options.prompt].filter(Boolean).join(" ");
  const nextDaysMatch = combined.match(/\b(?:next|coming|following)\s+(\d+)\s*days?\b/i);
  const named = parseNamedDay(combined, now);
  const explicitTarget = toIsoDate(options.targetDate);

  if (explicitTarget) {
    return {
      mode: "day",
      dates: [explicitTarget],
      targetDate: explicitTarget,
      horizonDays: 1,
      warnings,
    };
  }

  if (named && !nextDaysMatch) {
    const iso = named.toISODate();
    if (iso) {
      const weekend = /\bweekend\b/i.test(combined);
      if (weekend) {
        const sunday = named.plus({days: 1}).toISODate();
        const dates = [iso, sunday].filter(Boolean) as string[];
        return {
          mode: dates.length === 1 ? "day" : "horizon",
          dates,
          targetDate: iso,
          horizonDays: dates.length,
          warnings,
        };
      }
      return {
        mode: "day",
        dates: [iso],
        targetDate: iso,
        horizonDays: 1,
        warnings,
      };
    }
  }

  const days = clampDays(
    nextDaysMatch?.[1] ? Number(nextDaysMatch[1]) : options.days,
    DEFAULT_DEMAND_HORIZON_DAYS,
  );
  const startIso = now.toISODate() ?? now.toFormat("yyyy-MM-dd");
  return {
    mode: "horizon",
    dates: isoDateRange(startIso, days),
    horizonDays: days,
    warnings,
  };
};
