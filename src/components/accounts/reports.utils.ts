import {DateTime} from "luxon";
import dayjs, {type Dayjs} from "dayjs";
import {toRecordId} from "@/lib/utils.ts";
import type {AccountHeadType} from "@/api/model/account.ts";

export const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

export const toQueryDateTime = (value?: string | Dayjs | Date | null) => {
  if (!value) {
    return undefined;
  }

  if (dayjs.isDayjs(value)) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  const asDayjs = dayjs(value);
  if (asDayjs.isValid()) {
    return asDayjs.toDate();
  }

  return DateTime.fromFormat(value, DATETIME_LOCAL_FORMAT).toJSDate();
};

export const computeLineDelta = (debit?: number, credit?: number) => {
  return Number(debit || 0) - Number(credit || 0);
};

export const computeRunningBalances = <T extends {debit?: number; credit?: number}>(
  openingBalance: number,
  rows: T[]
) => {
  let running = openingBalance;
  return rows.map((row) => {
    running += computeLineDelta(row.debit, row.credit);
    return {
      ...row,
      running_balance: running,
    };
  });
};

export const sortJournalLinesByEntry = <T extends {
  id?: string;
  entry?: {date?: string | Date; entry_number?: number};
}>(rows: T[]): T[] => {
  return [...rows].sort((a, b) => {
    const dateA = a.entry?.date ? new Date(a.entry.date).getTime() : 0;
    const dateB = b.entry?.date ? new Date(b.entry.date).getTime() : 0;
    if (dateA !== dateB) {
      return dateA - dateB;
    }

    const numA = Number(a.entry?.entry_number ?? 0);
    const numB = Number(b.entry?.entry_number ?? 0);
    if (numA !== numB) {
      return numA - numB;
    }

    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
};

export const toAccountBalance = (
  debit: number,
  credit: number,
  normalBalance?: string
) => {
  if (normalBalance === "credit") {
    return Number(credit || 0) - Number(debit || 0);
  }

  return Number(debit || 0) - Number(credit || 0);
};

export const getAccountHeadType = (account?: {
  account_type?: string;
  group?: {head_type?: string};
}): AccountHeadType | undefined => {
  const head = account?.group?.head_type || account?.account_type;
  if (!head) {
    return undefined;
  }
  return head as AccountHeadType;
};

export const isCustomerAccount = (account?: {
  code?: string;
  name?: string;
  group?: {code?: string; name?: string};
}) => {
  if (!account) {
    return false;
  }

  const groupCode = String(account.group?.code || "").toLowerCase();
  const groupName = String(account.group?.name || "").toLowerCase();
  const code = String(account.code || "").toLowerCase();
  const name = String(account.name || "").toLowerCase();
  return (
    groupCode.includes("cust") ||
    groupCode.includes("customer") ||
    groupName.includes("customer") ||
    groupName.includes("cust") ||
    code.includes("cust") ||
    code.includes("customer") ||
    name.includes("customer") ||
    name.includes("cust")
  );
};

export const isSupplierAccount = (account?: {
  code?: string;
  name?: string;
  group?: {code?: string; name?: string};
}) => {
  if (!account) {
    return false;
  }

  const groupCode = String(account.group?.code || "").toLowerCase();
  const groupName = String(account.group?.name || "").toLowerCase();
  const code = String(account.code || "").toLowerCase();
  const name = String(account.name || "").toLowerCase();
  return (
    groupCode.includes("sup") ||
    groupCode.includes("supplier") ||
    groupName.includes("supplier") ||
    groupName.includes("sup") ||
    code.includes("sup") ||
    code.includes("supplier") ||
    name.includes("supplier") ||
    name.includes("sup")
  );
};

export const isCashGroupAccount = (account?: {
  code?: string;
  name?: string;
  group?: {code?: string; name?: string};
}) => {
  if (!account) {
    return false;
  }

  const groupCode = String(account.group?.code || "").toLowerCase();
  const groupName = String(account.group?.name || "").toLowerCase();
  const code = String(account.code || "").toLowerCase();
  const name = String(account.name || "").toLowerCase();

  return (
    groupCode.includes("cash") ||
    groupCode.includes("bank") ||
    groupName.includes("cash") ||
    groupName.includes("bank") ||
    code.includes("cash") ||
    code.includes("bank") ||
    name.includes("cash") ||
    name.includes("bank") ||
    code.startsWith("10")
  );
};

export const classifyCashFlowBucket = (sourceModule?: string) => {
  const source = String(sourceModule || "").toLowerCase();
  if (["purchase", "purchase_return", "waste"].includes(source)) {
    return "Investing";
  }

  if (["capital", "loan", "equity"].includes(source)) {
    return "Financing";
  }

  return "Operating";
};
