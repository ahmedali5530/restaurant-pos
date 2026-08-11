import { CalendarDate } from '@internationalized/date';
import { DateValue } from 'react-aria-components';
import dayjs, { Dayjs } from "dayjs";
import {
  calendarDateToAppDateTime,
  getAppTimezone,
  nowInAppTimezone,
  toLuxonDateTime,
} from "@/lib/datetime.ts";

/**
 * Converts a Date / ISO string to a CalendarDate using the app timezone.
 */
export const dateToCalendarDate = (date: Date | string | undefined): CalendarDate | null => {
  if (!date) return null;

  const luxon = toLuxonDateTime(date);
  if (!luxon.isValid) return null;

  return new CalendarDate(luxon.year, luxon.month, luxon.day);
};

/**
 * Converts a CalendarDate (DateValue) to a JS Date at start of day in the app timezone.
 */
export const calendarDateToDate = (dateValue: DateValue | null | undefined): Date | null => {
  if (!dateValue) return null;

  return calendarDateToAppDateTime({
    year: dateValue.year,
    month: dateValue.month,
    day: dateValue.day,
  }).toJSDate();
};

/**
 * Gets today's date as a CalendarDate in the app timezone.
 */
export const getToday = (): CalendarDate => {
  const now = nowInAppTimezone();
  return new CalendarDate(now.year, now.month, now.day);
};

export const dateValueToDayjs = (dateValue: DateValue | null | undefined): Dayjs | null => {
  if (!dateValue) return null;

  return dayjs(
    calendarDateToAppDateTime({
      year: dateValue.year,
      month: dateValue.month,
      day: dateValue.day,
    }).toJSDate()
  );
};

export const dayjsToCalendarDate = (value: Dayjs | null | undefined): CalendarDate | null => {
  if (!value) return null;

  // Prefer app-zone Y/M/D from the underlying instant when possible.
  const luxon = toLuxonDateTime(value.toDate()).setZone(getAppTimezone());
  return new CalendarDate(luxon.year, luxon.month, luxon.day);
};
