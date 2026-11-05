import {DateTime} from "luxon";
import {getAppTimezone} from "@/lib/datetime.ts";
import type {BranchScopeParams, BranchView} from "@/api/reports/shared/branch-scope.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";
import type {ClosingCycleConfig} from "@/lib/closing-cycle.ts";
import {formatReportRangeForQuery} from "@/lib/kitchen/business-date.ts";
import { runtimeDateTimeFormat, runtimeDateFormat } from "@/lib/runtime-config.ts";

/** Luxon format for query parameter values (matches report date pickers). */

const rangeForDays = (
  config: ClosingCycleConfig | null | undefined,
  start: DateTime,
  end: DateTime,
): DateRangeFilter => {
  const {startDate, endDate} = formatReportRangeForQuery(
    config,
    start.toFormat("yyyy-MM-dd"),
    end.toFormat("yyyy-MM-dd"),
  );
  return {startDate, endDate};
};

export const parseMultiFilter = (params: URLSearchParams, name: string): string[] => {
  return [
    ...params.getAll(`${name}[]`),
    ...params.getAll(name),
  ].filter(Boolean) as string[];
};

export const parseDateRangeFromParams = (params: URLSearchParams): DateRangeFilter => ({
  startDate: params.get("start") || undefined,
  endDate: params.get("end") || undefined,
});

export const parseBranchView = (raw: string | null | undefined): BranchView => {
  return raw === "by_branch" ? "by_branch" : "combined";
};

export const parseBranchScopeFromParams = (params: URLSearchParams): BranchScopeParams => ({
  selectedBranchIds: parseMultiFilter(params, "branches"),
  branchView: parseBranchView(params.get("branchView")),
});

export const formatDateTimeForQuery = (dt: DateTime) => dt.toFormat(runtimeDateTimeFormat());

const getNow = () => DateTime.now().setZone(getAppTimezone());

/** Human-readable anchor date for AI system prompts. */
export const getBusinessDateContext = (): string => {
  const now = getNow();
  const dateFormat = runtimeDateFormat();

  return [
    `Today is ${now.toFormat("cccc, MMMM d, yyyy")} (${now.toFormat(dateFormat)})`,
    `current month is ${now.toFormat("MMMM yyyy")}`,
    `current year is ${now.year}`,
  ].join("; ");
};

/** Normalize a date string from AI or user input into the query parameter format. */
export const normalizeQueryDate = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Date value cannot be empty.");
  }

  const timezone = getAppTimezone();
  const fromIso = DateTime.fromISO(trimmed, {zone: timezone});
  if (fromIso.isValid) {
    return formatDateTimeForQuery(fromIso);
  }

  const fromQueryFormat = DateTime.fromFormat(trimmed, runtimeDateTimeFormat(), {zone: timezone});
  if (fromQueryFormat.isValid) {
    return formatDateTimeForQuery(fromQueryFormat);
  }

  const fromDateOnly = DateTime.fromFormat(trimmed, runtimeDateFormat(), {zone: timezone});
  if (fromDateOnly.isValid) {
    return formatDateTimeForQuery(fromDateOnly);
  }

  throw new Error(`Could not parse date: "${value}". Expected format like ${runtimeDateTimeFormat()}.`);
};

export const resolveNaturalDateRange = ({
  phrase,
  closingCycleConfig = null,
}: {
  phrase: string;
  closingCycleConfig?: ClosingCycleConfig | null;
}): DateRangeFilter => {
  const normalized = phrase.trim().toLowerCase();
  const now = getNow();
  const cfg = closingCycleConfig;

  if (normalized === "today" || normalized.includes("today")) {
    return rangeForDays(cfg, now, now);
  }

  if (normalized === "yesterday" || normalized.includes("yesterday")) {
    const day = now.minus({days: 1});
    return rangeForDays(cfg, day, day);
  }

  if (normalized === "this week" || normalized.includes("this week")) {
    return rangeForDays(cfg, now.startOf("week"), now.endOf("week"));
  }

  if (normalized === "last week" || normalized.includes("last week")) {
    const week = now.minus({weeks: 1});
    return rangeForDays(cfg, week.startOf("week"), week.endOf("week"));
  }

  if (normalized === "this month" || normalized.includes("this month")) {
    return rangeForDays(cfg, now.startOf("month"), now.endOf("month"));
  }

  if (normalized === "last month" || normalized.includes("last month")) {
    const month = now.minus({months: 1});
    return rangeForDays(cfg, month.startOf("month"), month.endOf("month"));
  }

  if (normalized === "this year" || normalized.includes("this year")) {
    return rangeForDays(cfg, now.startOf("year"), now.endOf("year"));
  }

  if (normalized === "last 7 days" || normalized.includes("last 7 days") || normalized.includes("past 7 days")) {
    return rangeForDays(cfg, now.minus({days: 6}), now);
  }

  if (normalized === "last 30 days" || normalized.includes("last 30 days") || normalized.includes("past 30 days")) {
    return rangeForDays(cfg, now.minus({days: 29}), now);
  }

  const lastDaysMatch = normalized.match(/(?:last|past)\s+(\d+)\s+days?/);
  if (lastDaysMatch) {
    const days = Math.max(1, Number(lastDaysMatch[1]));
    return rangeForDays(cfg, now.minus({days: days - 1}), now);
  }

  const quarterMatch = normalized.match(/q([1-4])\s*(\d{4})?/);
  if (quarterMatch) {
    const quarter = Number(quarterMatch[1]);
    const year = quarterMatch[2] ? Number(quarterMatch[2]) : now.year;
    const startMonth = (quarter - 1) * 3 + 1;
    const start = DateTime.fromObject({year, month: startMonth, day: 1}, {zone: getAppTimezone()});
    return rangeForDays(cfg, start.startOf("month"), start.plus({months: 2}).endOf("month"));
  }

  const weekdayRange = resolveWeekdayPhrase(normalized, now, cfg);
  if (weekdayRange) {
    return weekdayRange;
  }

  throw new Error(`Could not resolve date range for phrase: "${phrase}". Try "yesterday", "today", "this week", "last week", "last Friday", "this month", "last month", or "Q1 2026".`);
};

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

const resolveWeekdayPhrase = (
  normalized: string,
  now: DateTime,
  config: ClosingCycleConfig | null | undefined,
): DateRangeFilter | null => {
  const match = normalized.match(/\b(last|this)\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun)\b/);
  if (!match) {
    return null;
  }

  const modifier = match[1] as "last" | "this";
  const weekday = WEEKDAY_NAMES[match[2]];
  if (!weekday) {
    return null;
  }

  if (modifier === "last") {
    const daysBack = (now.weekday - weekday + 7) % 7;
    const offset = daysBack === 0 ? 7 : daysBack;
    const target = now.minus({days: offset});
    return rangeForDays(config, target, target);
  }

  const startOfWeek = now.startOf("week");
  let target = startOfWeek.plus({days: weekday - 1});
  if (target > now.endOf("day")) {
    target = target.minus({weeks: 1});
  }
  return rangeForDays(config, target, target);
};

/** Default peak dining hours in business timezone (7 PM – 9 PM). */
export const getPeakHoursRange = () => ({
  startHour: 19,
  endHour: 21,
  label: "7 PM – 9 PM",
});

/** Parse hour range from phrases like "7 PM - 9 PM" or "peak hours". */
export const parseHourRangeFromPhrase = (
  phrase: string,
): {startHour: number; endHour: number} | null => {
  const normalized = phrase.trim().toLowerCase();
  if (/\bpeak\s+hours?\b/.test(normalized)) {
    const peak = getPeakHoursRange();
    return {startHour: peak.startHour, endHour: peak.endHour};
  }

  const rangeMatch = normalized.match(/(\d{1,2})\s*(?:pm|am)?\s*[-–to]+\s*(\d{1,2})\s*(pm|am)?/i);
  if (rangeMatch) {
    let start = Number(rangeMatch[1]);
    let end = Number(rangeMatch[2]);
    const suffix = (rangeMatch[3] || normalized.match(/pm/i) ? "pm" : "").toLowerCase();
    if (suffix === "pm" || normalized.includes("pm")) {
      if (start < 12) start += 12;
      if (end < 12) end += 12;
    }
    if (end > start) {
      return {startHour: start, endHour: end};
    }
  }

  return null;
};

/** Merge explicit dates with an optional natural-language phrase when dates are omitted. */
export const parseDateRangeWithPhrase = (
  args: {startDate?: unknown; endDate?: unknown; phrase?: unknown},
): DateRangeFilter => {
  const hasStart = args.startDate !== undefined && args.startDate !== null && String(args.startDate).trim() !== "";
  const hasEnd = args.endDate !== undefined && args.endDate !== null && String(args.endDate).trim() !== "";

  if (hasStart || hasEnd) {
    const range: DateRangeFilter = {};
    if (hasStart) {
      range.startDate = normalizeQueryDate(String(args.startDate));
    }
    if (hasEnd) {
      range.endDate = normalizeQueryDate(String(args.endDate));
    }
    return range;
  }

  if (args.phrase) {
    return resolveNaturalDateRange({phrase: String(args.phrase)});
  }

  return {};
};
