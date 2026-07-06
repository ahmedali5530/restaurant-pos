import {Tables} from "@/api/db/tables.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {
  getAccountIdFromRow,
  POSTED_ENTRY_FILTER,
  resolveAccountId,
  resolveDateRangeParams,
  toAccountRecordId,
} from "@/api/reports/accounts/shared.ts";

export interface GeneralLedgerRow {
  account: {id?: string; code: string; name: string};
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  periodBalance: number;
  closingBalance: number;
}

export interface GeneralLedgerResult {
  rows: GeneralLedgerRow[];
  dateRange: DateRangeFilter;
  accountFilter?: {id?: string; code?: string};
}

export const getGeneralLedger = async (
  db: DbClient,
  filters: DateRangeFilter & {accountId?: string; accountCode?: string} = {},
): Promise<GeneralLedgerResult> => {
  const {dateFrom, dateTo} = resolveDateRangeParams(filters);
  const accountId = await resolveAccountId(db, filters.accountId, filters.accountCode);

  const periodWhere: string[] = [
    POSTED_ENTRY_FILTER,
    "entry.date >= <datetime>$date_from",
    "entry.date <= <datetime>$date_to",
  ];
  const openingWhere: string[] = [
    POSTED_ENTRY_FILTER,
    "entry.date < <datetime>$start_date",
  ];
  const parameters: Record<string, unknown> = {
    start_date: dateFrom,
    date_from: dateFrom,
    date_to: dateTo,
  };

  if (accountId) {
    periodWhere.push("account = $account");
    openingWhere.push("account = $account");
    parameters.account = toAccountRecordId(accountId);
  }

  const whereClause = (clauses: string[]) => clauses.join(" AND ");

  const openingQuery = `
    SELECT account.code, account.name, account.id, math::sum(debit - credit) AS balance
    FROM ${Tables.account_journal_lines}
    WHERE ${whereClause(openingWhere)}
    GROUP BY account.id, account.name, account.code
    FETCH account
  `;

  const periodQuery = `
    SELECT
      account,
      account.id,
      account.code,
      account.name,
      math::sum(debit) AS total_debit,
      math::sum(credit) AS total_credit,
      math::sum(debit - credit) AS balance
    FROM ${Tables.account_journal_lines}
    WHERE ${whereClause(periodWhere)}
    GROUP BY account.id, account.code, account.name
    ORDER BY account.code ASC
    FETCH account, account.group
  `;

  const [[openingRows], [periodRows]] = await Promise.all([
    db.query(openingQuery, parameters),
    db.query(periodQuery, parameters),
  ]);

  const openingByAccount = new Map<string, number>();
  (openingRows || []).forEach((row: {account?: unknown; balance?: number}) => {
    const id = getAccountIdFromRow(row.account);
    if (!id) {
      return;
    }
    openingByAccount.set(id, Number(row.balance || 0));
  });

  const periodByAccount = new Map<string, GeneralLedgerRow>();
  (periodRows || []).forEach((row: {
    account?: {id?: {toString(): string}; code?: string; name?: string};
    total_debit?: number;
    total_credit?: number;
    balance?: number;
  }) => {
    const id = getAccountIdFromRow(row.account);
    if (!id) {
      return;
    }

    const openingBalance = openingByAccount.get(id) ?? 0;
    const periodBalance = Number(row.balance || 0);
    periodByAccount.set(id, {
      account: {
        id,
        code: String(row.account?.code || ""),
        name: String(row.account?.name || ""),
      },
      openingBalance,
      totalDebit: Number(row.total_debit || 0),
      totalCredit: Number(row.total_credit || 0),
      periodBalance,
      closingBalance: openingBalance + periodBalance,
    });
    openingByAccount.delete(id);
  });

  const openingOnlyRows: GeneralLedgerRow[] = (openingRows || [])
    .map((row: {account?: {id?: {toString(): string}; code?: string; name?: string}; balance?: number}) => {
      const id = getAccountIdFromRow(row.account);
      if (!id || !openingByAccount.has(id)) {
        return null;
      }

      const openingBalance = Number(row.balance || 0);
      return {
        account: {
          id,
          code: String(row.account?.code || ""),
          name: String(row.account?.name || ""),
        },
        openingBalance,
        totalDebit: 0,
        totalCredit: 0,
        periodBalance: 0,
        closingBalance: openingBalance,
      };
    })
    .filter((row): row is GeneralLedgerRow => row !== null);

  const rows = [...periodByAccount.values(), ...openingOnlyRows]
    .sort((a, b) => a.account.code.localeCompare(b.account.code));

  return {
    rows,
    dateRange: filters,
    accountFilter: accountId
      ? {id: accountId, code: filters.accountCode}
      : undefined,
  };
};
