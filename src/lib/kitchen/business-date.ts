/**
 * Maps a business_date label (YYYY-MM-DD) to the operational datetime window
 * using the configured closing cycle (e.g. 06:00 on business_date → 02:00 next day).
 */
import {DateTime} from "luxon";
import {ClosingCycleConfig, ClosingCycleWindow, loadClosingCycleConfig} from "@/lib/closing-cycle.ts";
import {getAppTimezone} from "@/lib/datetime.ts";

type DBLike = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

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

export const resolveBusinessDateWindow = async (
  db: DBLike,
  businessDate: string
): Promise<ClosingCycleWindow> => {
  const {config} = await loadClosingCycleConfig(db);
  return buildWindowForBusinessDate(config, businessDate);
};

export const formatBusinessDateWindow = (window: ClosingCycleWindow): string => {
  const timezone = getAppTimezone();
  const from = DateTime.fromJSDate(window.date_from).setZone(timezone);
  const to = DateTime.fromJSDate(window.date_to).setZone(timezone);
  return `${from.toFormat("HH:mm MMM d")} → ${to.toFormat("HH:mm MMM d")}`;
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
  const timezone = getAppTimezone();
  return DateTime.fromJSDate(date).setZone(timezone).toFormat("yyyy-MM-dd");
};
