import {DateTime} from "luxon";
import {Tables} from "@/api/db/tables.ts";
import {getAppTimezone} from "@/lib/datetime.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {normalizeQueryDate} from "@/api/reports/shared/filters.ts";
import {toRecordId} from "@/lib/utils.ts";

const QUERY_DATE_TIME_FORMAT = import.meta.env.VITE_DATE_TIME_FORMAT as string;

export const POSTED_ENTRY_FILTER = "entry.status = 'posted'";

export const toJsDate = (value?: string): Date | undefined => {
  if (!value) {
    return undefined;
  }

  const dt = DateTime.fromFormat(value, QUERY_DATE_TIME_FORMAT, {zone: getAppTimezone()});
  if (dt.isValid) {
    return dt.toJSDate();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const resolveAsOfDate = (asOf?: string, dateRange?: DateRangeFilter): Date => {
  const value = asOf || dateRange?.endDate || dateRange?.startDate;
  if (value) {
    const normalized = normalizeQueryDate(value);
    return toJsDate(normalized) ?? new Date();
  }

  return DateTime.now().setZone(getAppTimezone()).toJSDate();
};

export const resolveDateRangeParams = (dateRange: DateRangeFilter = {}) => {
  const now = DateTime.now().setZone(getAppTimezone());
  const dateFrom = toJsDate(dateRange.startDate) ?? now.startOf("month").toJSDate();
  const dateTo = toJsDate(dateRange.endDate) ?? now.endOf("month").toJSDate();
  return {dateFrom, dateTo};
};

export const resolveAccountId = async (
  db: DbClient,
  accountId?: string,
  accountCode?: string,
): Promise<string | undefined> => {
  if (accountId) {
    return accountId;
  }

  if (!accountCode) {
    return undefined;
  }

  const [rows] = await db.query(
    `SELECT id FROM ${Tables.accounts} WHERE code = $code LIMIT 1`,
    {code: accountCode.trim()},
  );
  const row = (rows as Array<{id?: {toString(): string}}> | undefined)?.[0];
  return row?.id?.toString();
};

export const toAccountRecordId = (accountId: string) => toRecordId(accountId);

export const getAccountIdFromRow = (account?: unknown): string | undefined => {
  if (!account || typeof account !== "object") {
    if (typeof account === "string") {
      return account;
    }
    return undefined;
  }

  const record = account as {id?: {toString(): string}};
  const id = record.id?.toString();
  if (!id || id === "[object Object]") {
    return undefined;
  }
  return id;
};

export const isTrialBalanceBalanced = (totalDebit: number, totalCredit: number) =>
  Math.abs(totalDebit - totalCredit) < 0.01;
