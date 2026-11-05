/**
 * Maps a business_date label (YYYY-MM-DD) to the operational datetime window
 * using the configured closing cycle (e.g. 06:00 on business_date → 02:00 next day).
 */
import {DateTime} from "luxon";
import {
  ClosingCycleConfig,
  ClosingCycleWindow,
  isClosingCycleEnabled,
  loadClosingCycleConfig,
} from "@/lib/closing-cycle.ts";
import {getAppTimezone, toAppBusinessDate} from "@/lib/datetime.ts";

type DBLike = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

const QUERY_DATE_TIME_FORMAT = import.meta.env.VITE_DATE_TIME_FORMAT as string;

const cycleCrossesNextDay = (config: ClosingCycleConfig): boolean => {
  return (
    config.endHour < config.startHour ||
    (config.endHour === config.startHour && config.endMinute <= config.startMinute)
  );
};

export const buildWindowForBusinessDate = (
  config: ClosingCycleConfig,
  businessDate: string
): ClosingCycleWindow => {
  const timezone = getAppTimezone();
  const date = DateTime.fromISO(businessDate, {zone: timezone});

  const start = date.set({
    hour: config.startHour,
    minute: config.startMinute,
    second: 0,
    millisecond: 0,
  });

  let end = date.set({
    hour: config.endHour,
    minute: config.endMinute,
    second: 0,
    millisecond: 0,
  });

  if (cycleCrossesNextDay(config) || end <= start) {
    end = end.plus({days: 1});
  }

  return {
    date_from: start.toJSDate(),
    date_to: end.toJSDate(),
  };
};

/** Calendar midnight → next midnight in app TZ (exclusive end). */
export const buildCalendarDayWindow = (businessDate: string): ClosingCycleWindow & {exclusiveEnd: true} => {
  const timezone = getAppTimezone();
  const start = DateTime.fromISO(businessDate, {zone: timezone}).startOf("day");
  return {
    date_from: start.toJSDate(),
    date_to: start.plus({days: 1}).toJSDate(),
    exclusiveEnd: true,
  };
};

export type ReportDayWindow = ClosingCycleWindow & {
  exclusiveEnd: boolean;
  businessDate: string;
};

/**
 * Selected YYYY-MM-DD → query window. Closing cycle when enabled; else calendar day.
 */
export const resolveReportDayWindow = (
  config: ClosingCycleConfig | null | undefined,
  businessDate: string,
): ReportDayWindow => {
  if (config && isClosingCycleEnabled(config)) {
    const window = buildWindowForBusinessDate(config, businessDate);
    return {
      ...window,
      exclusiveEnd: false,
      businessDate,
    };
  }
  const calendar = buildCalendarDayWindow(businessDate);
  return {
    ...calendar,
    businessDate,
  };
};

/**
 * Multi-day range: first day's window start → last day's window end.
 */
export const resolveReportRangeWindow = (
  config: ClosingCycleConfig | null | undefined,
  startBusinessDate: string,
  endBusinessDate: string,
): ClosingCycleWindow & {exclusiveEnd: boolean} => {
  const startWin = resolveReportDayWindow(config, startBusinessDate);
  const endWin = resolveReportDayWindow(config, endBusinessDate);
  return {
    date_from: startWin.date_from,
    date_to: endWin.date_to,
    exclusiveEnd: endWin.exclusiveEnd,
  };
};

export const formatWindowBoundForQuery = (date: Date): string => {
  return DateTime.fromJSDate(date, {zone: getAppTimezone()}).toFormat(QUERY_DATE_TIME_FORMAT);
};

/** Hidden-field values for DateRange / AI filters (app TZ wall clock). */
export const formatReportRangeForQuery = (
  config: ClosingCycleConfig | null | undefined,
  startBusinessDate: string,
  endBusinessDate: string,
): {startDate: string; endDate: string} => {
  const window = resolveReportRangeWindow(config, startBusinessDate, endBusinessDate);
  let endDate = formatWindowBoundForQuery(window.date_to);
  // Exclusive calendar end is next midnight — query layer expects inclusive
  // end-of-day when we emit a datetime; for exclusive windows emit end-1ms wall time.
  if (window.exclusiveEnd) {
    endDate = formatWindowBoundForQuery(new Date(window.date_to.getTime() - 1));
  }
  return {
    startDate: formatWindowBoundForQuery(window.date_from),
    endDate,
  };
};

export const resolveBusinessDateWindow = async (
  db: DBLike,
  businessDate: string
): Promise<ClosingCycleWindow> => {
  const {config} = await loadClosingCycleConfig(db);
  return buildWindowForBusinessDate(config, businessDate);
};

export const formatBusinessDateWindow = (
  window: ClosingCycleWindow & {exclusiveEnd?: boolean},
): string => {
  const timezone = getAppTimezone();
  const from = DateTime.fromJSDate(window.date_from).setZone(timezone);
  // Exclusive end is next boundary (e.g. next midnight) — show last included minute.
  const toInstant = window.exclusiveEnd
    ? new Date(window.date_to.getTime() - 1)
    : window.date_to;
  const to = DateTime.fromJSDate(toInstant).setZone(timezone);
  return `${from.toFormat("yyyy-MM-dd HH:mm")} → ${to.toFormat("yyyy-MM-dd HH:mm")}`;
};

export const enumerateBusinessDates = (fromDate: string, toDate: string): string[] => {
  const timezone = getAppTimezone();
  let cursor = DateTime.fromISO(fromDate, {zone: timezone}).startOf("day");
  const end = DateTime.fromISO(toDate, {zone: timezone}).startOf("day");
  const dates: string[] = [];

  while (cursor <= end) {
    dates.push(cursor.toFormat("yyyy-MM-dd"));
    cursor = cursor.plus({days: 1});
  }

  return dates;
};

export const businessDateFromJsDate = (date: Date): string => {
  return toAppBusinessDate(date);
};
