import {Tables} from "@/api/db/tables.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {isTrialBalanceBalanced, POSTED_ENTRY_FILTER, resolveAsOfDate, toJsDate} from "@/api/reports/accounts/shared.ts";
import {normalizeQueryDate} from "@/api/reports/shared/filters.ts";

export interface TrialBalanceRow {
  account: {code: string; name: string};
  totalDebit: number;
  totalCredit: number;
}

export interface TrialBalanceResult {
  rows: TrialBalanceRow[];
  totals: {
    totalDebit: number;
    totalCredit: number;
    closingDebit: number;
    closingCredit: number;
    isBalanced: boolean;
  };
  asOf: string;
}

export const getTrialBalance = async (
  db: DbClient,
  filters: DateRangeFilter & {asOf?: string} = {},
): Promise<TrialBalanceResult> => {
  const asOfDate = resolveAsOfDate(filters.asOf, filters);
  const asOfLabel = filters.asOf
    ? normalizeQueryDate(filters.asOf)
    : (filters.endDate || filters.startDate || toJsDate(undefined)?.toISOString() || "");

  const [result] = await db.query(
    `
      SELECT
        account,
        account.code,
        account.name,
        math::sum(debit) as total_debit,
        math::sum(credit) as total_credit
      FROM ${Tables.account_journal_lines}
      WHERE ${POSTED_ENTRY_FILTER}
        AND entry.date <= <datetime>$as_of
      GROUP BY account.code, account.name
      ORDER BY account.code ASC
      FETCH account
    `,
    {as_of: asOfDate},
  );

  const rows: TrialBalanceRow[] = (result || []).map((item: {
    account?: {code?: string; name?: string};
    total_debit?: number;
    total_credit?: number;
  }) => ({
    account: {
      code: String(item.account?.code || ""),
      name: String(item.account?.name || ""),
    },
    totalDebit: Number(item.total_debit || 0),
    totalCredit: Number(item.total_credit || 0),
  }));

  const totals = rows.reduce(
    (acc, item) => {
      acc.totalDebit += item.totalDebit;
      acc.totalCredit += item.totalCredit;
      acc.closingDebit += Math.max(item.totalDebit - item.totalCredit, 0);
      acc.closingCredit += Math.max(item.totalCredit - item.totalDebit, 0);
      return acc;
    },
    {totalDebit: 0, totalCredit: 0, closingDebit: 0, closingCredit: 0},
  );

  return {
    rows,
    totals: {
      ...totals,
      isBalanced: isTrialBalanceBalanced(totals.totalDebit, totals.totalCredit),
    },
    asOf: asOfLabel || asOfDate.toISOString(),
  };
};
