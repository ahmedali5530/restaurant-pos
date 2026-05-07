import {DateTime} from "luxon";

export type ClosingCycleConfig = {
  startHour: number;
  startMinute: number;
};

export const CLOSING_CYCLE_CONFIG: ClosingCycleConfig = {
  startHour: 6,
  startMinute: 0,
};

export type ClosingCycleWindow = {
  date_from: Date;
  date_to: Date;
};

export const getActiveClosingWindow = (now: Date = new Date()): ClosingCycleWindow => {
  const nowDt = DateTime.fromJSDate(now);

  let start = nowDt.set({
    hour: CLOSING_CYCLE_CONFIG.startHour,
    minute: CLOSING_CYCLE_CONFIG.startMinute,
    second: 0,
    millisecond: 0,
  });

  if (nowDt < start) {
    start = start.minus({days: 1});
  }

  const end = start.plus({days: 1}).minus({milliseconds: 1});

  return {
    date_from: start.toJSDate(),
    date_to: end.toJSDate(),
  };
};

export const isWithinClosingWindow = (date: Date, window: ClosingCycleWindow): boolean => {
  const value = date.getTime();
  return value >= window.date_from.getTime() && value <= window.date_to.getTime();
};

