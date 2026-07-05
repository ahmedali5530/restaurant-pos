import type {DateValue} from "react-aria-components";
import type {Dayjs} from "dayjs";
import type {SelectOption} from "@/components/common/form/types.ts";
import {toLuxonDateTime, toSurrealDateTime} from "@/lib/datetime.ts";
import {toRecordId as toSurrealRecordId} from "@/lib/utils.ts";
import {calendarDateToDate, dateToCalendarDate} from "@/utils/date.ts";
import {jsDateToDayjs} from "@/components/common/antd/datetime.picker.tsx";
import type {User} from "@/api/model/user.ts";
import type {FieldErrors} from "react-hook-form";

export type {SelectOption};

export const toRecordId = (value?: string | null) => {
  if (!value) return undefined;
  return toSurrealRecordId(value);
};

export const toUserRecordId = (user?: User | null) =>
  user?.id ? toRecordId(String(user.id)) : null;

export const toCalendarDateValue = (value?: unknown): DateValue | null =>
  value ? dateToCalendarDate(toLuxonDateTime(value as never).toJSDate()) : null;

export const calendarDateToSurreal = (value?: DateValue | null) => {
  if (!value) return null;
  const date = calendarDateToDate(value);
  return date ? toSurrealDateTime(date) : null;
};

export const toDatetimeLocal = (value?: unknown) => {
  if (!value) return "";
  return toLuxonDateTime(value as never).toFormat("yyyy-MM-dd'T'HH:mm");
};

export const toDateLocal = (value?: unknown) => {
  if (!value) return "";
  return toLuxonDateTime(value as never).toFormat("yyyy-MM-dd");
};

export const formatDisplayDate = (value?: unknown) => {
  if (!value) return "";
  return toLuxonDateTime(value as never).toFormat("yyyy-MM-dd HH:mm");
};

export const entityLabel = (record?: {
  first_name?: string;
  last_name?: string;
  name?: string;
  code?: string;
  employee_number?: string;
}) => {
  if (!record) return "";
  if (record.first_name) {
    return `${record.first_name} ${record.last_name ?? ""}`.trim();
  }
  if (record.employee_number) {
    return `${record.employee_number} — ${record.first_name ?? ""} ${record.last_name ?? ""}`.trim();
  }
  return record.name ?? record.code ?? "";
};

export const toSelectOption = (
  record?: { id?: string; name?: string; code?: string; first_name?: string; last_name?: string; employee_number?: string },
): SelectOption | null => {
  if (!record?.id) return null;
  return {
    value: String(record.id),
    label: entityLabel(record) || String(record.id),
  };
};

/** Convert snake_case enum value to camelCase locale key segment. */
export const enumLocaleKey = (value: string) =>
  value.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** Build select options from enum values and a locale key prefix. */
export const enumOptions = (
  t: (key: string) => string,
  values: readonly string[],
  labelPrefix: string,
  labelKeyFor?: (value: string) => string,
): SelectOption[] =>
  values.map((value) => ({
    value,
    label: t(`${labelPrefix}.${labelKeyFor ? labelKeyFor(value) : value}`),
  }));

export const toDayjsDateTime = (value?: unknown): Dayjs | null =>
  value ? jsDateToDayjs(toLuxonDateTime(value as never).toJSDate()) : null;

export const dayjsToSurreal = (value?: Dayjs | null) =>
  value ? toSurrealDateTime(value.toDate()) : null;

/** Extract the first validation error message from react-hook-form errors. */
export const firstFormError = (errors: FieldErrors): string | undefined => {
  for (const value of Object.values(errors)) {
    if (!value) continue;
    if (typeof value === "object" && "message" in value && value.message) {
      return String(value.message);
    }
    if (typeof value === "object") {
      const nested = firstFormError(value as FieldErrors);
      if (nested) return nested;
    }
  }
  return undefined;
};
