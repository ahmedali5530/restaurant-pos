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
    return new SurrealDateTime(toJsDate(value));
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return new SurrealDateTime(Number(value));
  }

  return SurrealDateTime.now();
};

export const nowSurrealDateTime = (): SurrealDateTime => {
  return SurrealDateTime.now();
};

export const nowInAppTimezone = (): LuxonDateTime => {
  return LuxonDateTime.now().setZone(getAppTimezone());
};

const hasExplicitOffset = (value: string): boolean =>
  /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value.trim());

const parseIsoString = (value: string): LuxonDateTime => {
  const trimmed = value.trim();
  const timezone = getAppTimezone();

  if (hasExplicitOffset(trimmed)) {
    return LuxonDateTime.fromISO(trimmed, { setZone: true }).setZone(timezone);
  }

  // SurrealDB datetimes without an offset are UTC.
  const asUtc = LuxonDateTime.fromISO(trimmed, { zone: "utc" });
  if (asUtc.isValid) {
    return asUtc.setZone(timezone);
  }

  return LuxonDateTime.fromISO(trimmed, { zone: timezone });
};

export const getAppStartOfDay = (): LuxonDateTime => {
  return nowInAppTimezone().startOf("day");
};

export const getAppStartOfDaySurreal = (): SurrealDateTime => {
  return toSurrealDateTime(getAppStartOfDay());
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
    return nowInAppTimezone();
  }

  if (LuxonDateTime.isDateTime(value)) {
    return value.setZone(getAppTimezone());
  }

  if (isSurrealDateTime(value)) {
    return LuxonDateTime.fromJSDate(value.toDate(), { zone: getAppTimezone() });
  }

  if (value instanceof Date) {
    return LuxonDateTime.fromJSDate(value, { zone: getAppTimezone() });
  }

  if (typeof value === "number") {
    return LuxonDateTime.fromMillis(value, { zone: getAppTimezone() });
  }

  if (typeof value === "bigint") {
    return LuxonDateTime.fromMillis(Number(value), { zone: getAppTimezone() });
  }

  if (typeof value === "string") {
    return parseIsoString(value);
  }

  return nowInAppTimezone();
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

  if (typeof value === "string") {
    return parseIsoString(value).toJSDate();
  }

  return new Date();
};
