import {Tables} from "@/api/db/tables.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {
  computeRunningBalances,
  isCustomerAccount,
  isSupplierAccount,
} from "@/components/accounts/reports.utils.ts";
import {
  POSTED_ENTRY_FILTER,
  resolveAccountId,
  resolveDateRangeParams,
  toAccountRecordId,
} from "@/api/reports/accounts/shared.ts";

export type AccountStatementType = "customer" | "supplier";

export interface AccountStatementLine {
  date: string;
  description?: string;
  debit: number;
  credit: number;
  runningBalance: number;
  entryNumber?: number;
  memo?: string;
}

export interface AccountStatementResult {
  account: {id?: string; code: string; name: string};
  statementType: AccountStatementType;
  openingBalance: number;
  lines: AccountStatementLine[];
  closingBalance: number;
  dateRange: DateRangeFilter;
}

export const getAccountStatement = async (
  db: DbClient,
  filters: DateRangeFilter & {
    accountId?: string;
    accountCode?: string;
    statementType?: AccountStatementType;
  },
): Promise<AccountStatementResult> => {
  const statementType = filters.statementType ?? "customer";
  const accountId = await resolveAccountId(db, filters.accountId, filters.accountCode);

  if (!accountId) {
    throw new Error("accountCode or accountId is required for account statements.");
  }

  const [accountRows] = await db.query(
    `SELECT * FROM ONLY $account FETCH group`,
    {account: toAccountRecordId(accountId)},
  );
  const account = accountRows as {
    id?: {toString(): string};
    code?: string;
    name?: string;
    group?: {code?: string; name?: string};
  } | undefined;

  if (!account) {
    throw new Error(`Account not found: ${filters.accountCode || accountId}`);
  }

  const isValidType = statementType === "customer"
    ? isCustomerAccount(account)
    : isSupplierAccount(account);

  if (!isValidType) {
    throw new Error(
      `Account ${account.code} does not match ${statementType} statement heuristics.`,
    );
  }

  const {dateFrom, dateTo} = resolveDateRangeParams(filters);
  const params = {
    account: toAccountRecordId(accountId),
    date_from: dateFrom,
    date_to: dateTo,
  };

  const [openingRows] = await db.query(
    `
      SELECT math::sum(debit - credit) as opening
      FROM ${Tables.account_journal_lines}
      WHERE ${POSTED_ENTRY_FILTER}
        AND account = $account
        AND entry.date < <datetime>$date_from
      GROUP ALL
    `,
    params,
  );
  const openingBalance = Number(
    (openingRows as Array<{opening?: number}> | undefined)?.[0]?.opening || 0,
  );

  const [lineRows] = await db.query(
    `
      SELECT *
      FROM ${Tables.account_journal_lines}
      WHERE ${POSTED_ENTRY_FILTER}
        AND account = $account
        AND entry.date >= <datetime>$date_from
        AND entry.date <= <datetime>$date_to
      ORDER BY entry.date ASC
      FETCH entry
    `,
    params,
  );

  const withRunning = computeRunningBalances(openingBalance, (lineRows || []) as Array<{
    debit?: number;
    credit?: number;
  }>);

  const lines: AccountStatementLine[] = withRunning.map((row: {
    debit?: number;
    credit?: number;
    description?: string;
    running_balance?: number;
    entry?: {entry_number?: number; date?: string | Date; memo?: string};
  }) => ({
    date: row.entry?.date ? new Date(row.entry.date).toISOString() : "",
    description: row.description,
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    runningBalance: Number(row.running_balance || 0),
    entryNumber: row.entry?.entry_number,
    memo: row.entry?.memo,
  }));

  const closingBalance = lines.length > 0
    ? lines[lines.length - 1].runningBalance
    : openingBalance;

  return {
    account: {
      id: account.id?.toString(),
      code: String(account.code || ""),
      name: String(account.name || ""),
    },
    statementType,
    openingBalance,
    lines,
    closingBalance,
    dateRange: filters,
  };
};
