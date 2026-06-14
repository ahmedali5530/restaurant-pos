import {DateTime} from "luxon";
import {getAppTimezone} from "@/lib/datetime.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";

/** Luxon format for query parameter values (matches report date pickers). */
const QUERY_DATE_TIME_FORMAT = import.meta.env.VITE_DATE_TIME_FORMAT as string;

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

export const formatDateTimeForQuery = (dt: DateTime) => dt.toFormat(QUERY_DATE_TIME_FORMAT);

const getNow = () => DateTime.now().setZone(getAppTimezone());

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

  const fromQueryFormat = DateTime.fromFormat(trimmed, QUERY_DATE_TIME_FORMAT, {zone: timezone});
  if (fromQueryFormat.isValid) {
    return formatDateTimeForQuery(fromQueryFormat);
  }

  const fromDateOnly = DateTime.fromFormat(trimmed, import.meta.env.VITE_DATE_FORMAT as string, {zone: timezone});
  if (fromDateOnly.isValid) {
    return formatDateTimeForQuery(fromDateOnly);
  }

  throw new Error(`Could not parse date: "${value}". Expected format like ${QUERY_DATE_TIME_FORMAT}.`);
};

export const resolveNaturalDateRange = ({phrase}: {phrase: string}): DateRangeFilter => {
  const normalized = phrase.trim().toLowerCase();
  const now = getNow();

  if (normalized === "today" || normalized.includes("today")) {
    return {
      startDate: formatDateTimeForQuery(now.startOf("day")),
      endDate: formatDateTimeForQuery(now.endOf("day")),
    };
  }

  if (normalized === "yesterday" || normalized.includes("yesterday")) {
    const day = now.minus({days: 1});
    return {
      startDate: formatDateTimeForQuery(day.startOf("day")),
      endDate: formatDateTimeForQuery(day.endOf("day")),
    };
  }

  if (normalized === "this week" || normalized.includes("this week")) {
    return {
      startDate: formatDateTimeForQuery(now.startOf("week")),
      endDate: formatDateTimeForQuery(now.endOf("week")),
    };
  }

  if (normalized === "last week" || normalized.includes("last week")) {
    const week = now.minus({weeks: 1});
    return {
      startDate: formatDateTimeForQuery(week.startOf("week")),
      endDate: formatDateTimeForQuery(week.endOf("week")),
    };
  }

  if (normalized === "this month" || normalized.includes("this month")) {
    return {
      startDate: formatDateTimeForQuery(now.startOf("month")),
      endDate: formatDateTimeForQuery(now.endOf("month")),
    };
  }

  if (normalized === "last month" || normalized.includes("last month")) {
    const month = now.minus({months: 1});
    return {
      startDate: formatDateTimeForQuery(month.startOf("month")),
      endDate: formatDateTimeForQuery(month.endOf("month")),
    };
  }

  if (normalized === "this year" || normalized.includes("this year")) {
    return {
      startDate: formatDateTimeForQuery(now.startOf("year")),
      endDate: formatDateTimeForQuery(now.endOf("year")),
    };
  }

  throw new Error(`Could not resolve date range for phrase: "${phrase}". Try "yesterday", "today", "this week", "last week", "this month", or "last month".`);
};
