import {DateTime} from "luxon";
import {Tables} from "@/api/db/tables.ts";
import {Setting} from "@/api/model/setting.ts";
import {DateInput, toJsDate} from "@/lib/datetime.ts";

export const CLOSING_CYCLE_KEY = "closing_cycle";

export type ClosingCycleConfig = {
  enabled: boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

type ClosingCycleValues = {
  enabled?: boolean;
  start_time?: string;
  end_time?: string;
};

const DEFAULT_START_TIME = "06:00";
const DEFAULT_END_TIME = "02:00";

export const DEFAULT_CLOSING_CYCLE_CONFIG: ClosingCycleConfig = {
  enabled: true,
  startHour: 6,
  startMinute: 0,
  endHour: 2,
  endMinute: 0,
};

export type ClosingCycleWindow = {
  date_from: Date;
  date_to: Date;
};

export type ResolvedClosingWindow = {
  cycleEnabled: boolean;
  window: ClosingCycleWindow;
};

type ClosingRecordLike = {
  closed_at?: DateInput;
  date_to?: DateInput;
  status?: string;
};

type DBLike = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

const parseHHMM = (value: string, fallback: string): {hour: number; minute: number} => {
  const [rawHour, rawMinute] = (value || fallback).split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    const [fallbackHour, fallbackMinute] = fallback.split(":").map(Number);
    return {hour: fallbackHour, minute: fallbackMinute};
  }
  return {hour, minute};
};

export const getActiveClosingWindowFromConfig = (
  config: ClosingCycleConfig,
  now: Date = new Date()
): ClosingCycleWindow => {
  const nowDt = DateTime.fromJSDate(now);

  const startToday = nowDt.set({
    hour: config.startHour,
    minute: config.startMinute,
    second: 0,
    millisecond: 0,
  });
  const endToday = nowDt.set({
    hour: config.endHour,
    minute: config.endMinute,
    second: 0,
    millisecond: 0,
  });

  const crossesNextDay = endToday <= startToday;
  let start = startToday;
  let end = crossesNextDay ? endToday.plus({days: 1}) : endToday;

  if (nowDt < start) {
    start = start.minus({days: 1});
    end = crossesNextDay ? end.minus({days: 1}) : end.minus({days: 1});
  } else if (nowDt > end) {
    start = start.plus({days: 1});
    end = crossesNextDay ? end.plus({days: 1}) : end.plus({days: 1});
  }

  return {
    date_from: start.toJSDate(),
    date_to: end.toJSDate(),
  };
};

export const getActiveClosingWindow = (now: Date = new Date()): ClosingCycleWindow => {
  return getActiveClosingWindowFromConfig(DEFAULT_CLOSING_CYCLE_CONFIG, now);
};

export const isWithinClosingWindow = (date: Date, window: ClosingCycleWindow): boolean => {
  const value = date.getTime();
  return value >= window.date_from.getTime() && value <= window.date_to.getTime();
};

export const isClosingCycleEnabled = (config: ClosingCycleConfig): boolean => {
  return config.enabled === true;
};

export const isWithinActiveClosingCycle = (
  config: ClosingCycleConfig,
  now: Date = new Date()
): boolean => {
  const window = getActiveClosingWindowFromConfig(config, now);
  return isWithinClosingWindow(now, window);
};

export const getLastCycleEndTime = (
  config: ClosingCycleConfig,
  now: Date = new Date()
): Date | null => {
  const window = getActiveClosingWindowFromConfig(config, now);
  if (isWithinClosingWindow(now, window)) {
    return null;
  }

  const nowDt = DateTime.fromJSDate(now);
  const windowStart = DateTime.fromJSDate(window.date_from);

  if (nowDt < windowStart) {
    const endOnStartDay = windowStart.set({
      hour: config.endHour,
      minute: config.endMinute,
      second: 0,
      millisecond: 0,
    });
    const cycleStartOnSameDay = windowStart.set({
      hour: config.startHour,
      minute: config.startMinute,
      second: 0,
      millisecond: 0,
    });
    const crossesNextDay = endOnStartDay <= cycleStartOnSameDay;
    if (crossesNextDay) {
      return endOnStartDay.toJSDate();
    }
    return endOnStartDay.minus({days: 1}).toJSDate();
  }

  return DateTime.fromJSDate(window.date_to).toJSDate();
};

export const formatClosingCycleTime = (date: Date): string => {
  return DateTime.fromJSDate(date).toLocaleString(DateTime.TIME_SIMPLE);
};

export const getClosingCycleKey = (window: ClosingCycleWindow): string => {
  return window.date_from.toISOString();
};

export const getSecondsUntilClosingCycleEnd = (window: ClosingCycleWindow, now: Date = new Date()): number => {
  return Math.floor((window.date_to.getTime() - now.getTime()) / 1000);
};

export type AutoCloseCycleState = {
  window: ClosingCycleWindow;
  cycleKey: string;
  secondsUntilEnd: number;
  shouldWarn: boolean;
  shouldClose: boolean;
};

const cycleCrossesNextDay = (config: ClosingCycleConfig): boolean => {
  return (
    config.endHour < config.startHour ||
    (config.endHour === config.startHour && config.endMinute <= config.startMinute)
  );
};

const buildCycleWindow = (
  config: ClosingCycleConfig,
  start: DateTime
): ClosingCycleWindow => {
  let end = start.set({
    hour: config.endHour,
    minute: config.endMinute,
    second: 0,
    millisecond: 0,
  });

  if (cycleCrossesNextDay(config)) {
    end = end.plus({days: 1});
  } else if (end <= start) {
    end = end.plus({days: 1});
  }

  return {
    date_from: start.toJSDate(),
    date_to: end.toJSDate(),
  };
};

export const getAutoCloseCycleState = (
  config: ClosingCycleConfig,
  now: Date = new Date()
): AutoCloseCycleState => {
  const nowDt = DateTime.fromJSDate(now);
  const pointerWindow = getActiveClosingWindowFromConfig(config, now);
  const pointerStart = DateTime.fromJSDate(pointerWindow.date_from);

  // Between cycles: pointer already moved to the next start, but "now" is still before it.
  if (nowDt < pointerStart) {
    const previousWindow = buildCycleWindow(config, pointerStart.minus({days: 1}));
    const secondsSinceEnd = Math.floor(
      (nowDt.toMillis() - previousWindow.date_to.getTime()) / 1000
    );

    return {
      window: previousWindow,
      cycleKey: getClosingCycleKey(previousWindow),
      secondsUntilEnd: -secondsSinceEnd,
      shouldWarn: false,
      shouldClose: secondsSinceEnd >= 0,
    };
  }

  const secondsUntilEnd = getSecondsUntilClosingCycleEnd(pointerWindow, now);

  if (secondsUntilEnd > 0) {
    return {
      window: pointerWindow,
      cycleKey: getClosingCycleKey(pointerWindow),
      secondsUntilEnd,
      shouldWarn: secondsUntilEnd <= 60,
      shouldClose: false,
    };
  }

  return {
    window: pointerWindow,
    cycleKey: getClosingCycleKey(pointerWindow),
    secondsUntilEnd,
    shouldWarn: false,
    shouldClose: true,
  };
};

export const getAutoCloseCycleStateFromDb = async (
  db: DBLike,
  now: Date = new Date()
): Promise<{config: ClosingCycleConfig; state: AutoCloseCycleState}> => {
  const {config} = await loadClosingCycleConfig(db);
  return {
    config,
    state: getAutoCloseCycleState(config, now),
  };
};

export const loadClosingCycleConfig = async (db: DBLike): Promise<{
  setting: Setting | null;
  config: ClosingCycleConfig;
}> => {
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true`,
    {key: CLOSING_CYCLE_KEY}
  ) as [Setting[] | undefined];

  const setting = rows?.[0] ?? null;
  const values = (setting?.values ?? {}) as ClosingCycleValues;
  const {hour: startHour, minute: startMinute} = parseHHMM(values.start_time ?? DEFAULT_START_TIME, DEFAULT_START_TIME);
  const {hour: endHour, minute: endMinute} = parseHHMM(values.end_time ?? DEFAULT_END_TIME, DEFAULT_END_TIME);

  return {
    setting,
    config: {
      enabled: values.enabled ?? DEFAULT_CLOSING_CYCLE_CONFIG.enabled,
      startHour,
      startMinute,
      endHour,
      endMinute,
    },
  };
};

export const getActiveClosingWindowFromDb = async (db: DBLike, now: Date = new Date()): Promise<ClosingCycleWindow> => {
  const {config} = await loadClosingCycleConfig(db);
  return getActiveClosingWindowFromConfig(config, now);
};

export const getLastCompletedClosing = async (db: DBLike): Promise<ClosingRecordLike | null> => {
  const [rows] = await db.query(
    `
      SELECT closed_at, date_to, status
      FROM ${Tables.closings}
      WHERE status = 'completed'
      ORDER BY closed_at DESC, date_to DESC
      LIMIT 1
    `
  ) as [ClosingRecordLike[] | undefined];

  return rows?.[0] ?? null;
};

const getLastClosingTime = (closing: ClosingRecordLike | null, now: Date): Date => {
  if (closing?.closed_at) {
    return toJsDate(closing.closed_at);
  }

  if (closing?.date_to) {
    return toJsDate(closing.date_to);
  }

  return DateTime.fromJSDate(now).startOf("day").toJSDate();
};

export const resolveClosingWindow = async (
  db: DBLike,
  now: Date = new Date()
): Promise<ResolvedClosingWindow> => {
  const {config} = await loadClosingCycleConfig(db);

  if (isClosingCycleEnabled(config)) {
    return {
      cycleEnabled: true,
      window: getActiveClosingWindowFromConfig(config, now),
    };
  }

  const lastCompleted = await getLastCompletedClosing(db);

  return {
    cycleEnabled: false,
    window: {
      date_from: getLastClosingTime(lastCompleted, now),
      date_to: now,
    },
  };
};

