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

/** Duck-type Surreal DateTime so multi-bundle `instanceof` mismatches still convert correctly. */
const surrealDateTimeToJsDate = (value: unknown): Date | null => {
  if (isSurrealDateTime(value)) {
    return value.toDate();
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as {toDate?: unknown}).toDate === "function"
  ) {
    try {
      const date = (value as {toDate: () => Date}).toDate();
      if (date instanceof Date && Number.isFinite(date.getTime())) {
        return date;
      }
    } catch {
      // fall through
    }
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as {toISOString?: unknown}).toISOString === "function"
  ) {
    try {
      const iso = (value as {toISOString: () => string}).toISOString();
      const parsed = Date.parse(iso);
      if (Number.isFinite(parsed)) {
        return new Date(parsed);
      }
    } catch {
      // fall through
    }
  }

  return null;
};

export const toSurrealDateTime = (value?: DateInput): SurrealDateTime => {
  if (value === undefined || value === null) {
    return new SurrealDateTime(LuxonDateTime.now().toJSDate());
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

  return new SurrealDateTime(LuxonDateTime.now().toJSDate());
};

export const nowSurrealDateTime = (): SurrealDateTime => {
  return new SurrealDateTime(LuxonDateTime.now().toJSDate());
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

/** Calendar date (yyyy-MM-dd) in the app timezone — never use UTC toISOString for this. */
export const toAppBusinessDate = (value?: DateInput): string => {
  return toLuxonDateTime(value).toFormat("yyyy-MM-dd");
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

  const fromSurreal = surrealDateTimeToJsDate(value);
  if (fromSurreal) {
    return LuxonDateTime.fromJSDate(fromSurreal, { zone: getAppTimezone() });
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

  const fromSurreal = surrealDateTimeToJsDate(value);
  if (fromSurreal) {
    return fromSurreal;
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

export const formatDateTime = (value?: DateInput): string =>
  toLuxonDateTime(value).toFormat(import.meta.env.VITE_DATE_TIME_FORMAT as string);

/** Start of a calendar day in the app timezone. */
export const calendarDateToAppDateTime = (dateValue: {
  year: number;
  month: number;
  day: number;
}): LuxonDateTime => {
  return LuxonDateTime.fromObject(
    { year: dateValue.year, month: dateValue.month, day: dateValue.day },
    { zone: getAppTimezone() }
  ).startOf("day");
};

/**
 * Inventory document created_at: wall-clock now when the selected day is today
 * in app TZ; otherwise start of the selected day in app TZ.
 */
export const documentCreatedAtFromDateValue = (
  dateValue?: { year: number; month: number; day: number } | null
): SurrealDateTime => {
  if (!dateValue) {
    return nowSurrealDateTime();
  }

  const selected = `${dateValue.year}-${String(dateValue.month).padStart(2, "0")}-${String(dateValue.day).padStart(2, "0")}`;
  if (selected === toAppBusinessDate()) {
    return nowSurrealDateTime();
  }

  return toSurrealDateTime(calendarDateToAppDateTime(dateValue));
};
