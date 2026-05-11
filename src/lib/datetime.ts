import { DateTime as LuxonDateTime } from "luxon";
import { DateTime as SurrealDateTime } from "surrealdb";

export type DateInput =
  | SurrealDateTime
  | LuxonDateTime
  | Date
  | string
  | number
  | bigint
  | null
  | undefined;

export const isSurrealDateTime = (value: unknown): value is SurrealDateTime => {
  return value instanceof SurrealDateTime;
};

export const toSurrealDateTime = (value?: DateInput): SurrealDateTime => {
  if (value === undefined || value === null) {
    return SurrealDateTime.now();
  }

  if (isSurrealDateTime(value)) {
    return value;
  }

  if (LuxonDateTime.isDateTime(value)) {
    return new SurrealDateTime(value.toJSDate());
  }

  if (value instanceof Date) {
    return new SurrealDateTime(value);
  }

  if (typeof value === "string") {
    return new SurrealDateTime(new Date(value));
  }

  return new SurrealDateTime(value);
};

export const nowSurrealDateTime = (): SurrealDateTime => {
  return SurrealDateTime.now();
};

export const getAppTimezone = (): string => {
  const timezone = (import.meta.env.VITE_APP_TIMEZONE as string | undefined)?.trim();
  if (!timezone) {
    return "UTC";
  }

  const zoneProbe = LuxonDateTime.now().setZone(timezone);
  return zoneProbe.isValid ? timezone : "UTC";
};

export const getBusinessDayUnixRange = (value?: DateInput) => {
  const timezone = getAppTimezone();
  const dateTime = toLuxonDateTime(value).setZone(timezone);
  const dayStart = dateTime.startOf("day");
  const dayEnd = dayStart.plus({days: 1});

  return {
    timezone,
    day: dayStart.toFormat("yyyy-MM-dd"),
    startUnix: Math.floor(dayStart.toSeconds()),
    endUnix: Math.floor(dayEnd.toSeconds())
  };
};

export const toLuxonDateTime = (value?: DateInput): LuxonDateTime => {
  if (value === undefined || value === null) {
    return LuxonDateTime.now();
  }

  if (LuxonDateTime.isDateTime(value)) {
    return value;
  }

  if (isSurrealDateTime(value)) {
    return LuxonDateTime.fromJSDate(value.toDate());
  }

  if (value instanceof Date) {
    return LuxonDateTime.fromJSDate(value);
  }

  if (typeof value === "number") {
    return LuxonDateTime.fromMillis(value);
  }

  if (typeof value === "bigint") {
    return LuxonDateTime.fromMillis(Number(value));
  }

  return LuxonDateTime.fromISO(value);
};

export const toJsDate = (value?: DateInput): Date => {
  if (value === undefined || value === null) {
    return new Date();
  }

  if (isSurrealDateTime(value)) {
    return value.toDate();
  }

  if (LuxonDateTime.isDateTime(value)) {
    return value.toJSDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  if (typeof value === "bigint") {
    return new Date(Number(value));
  }

  return new Date(value);
};
