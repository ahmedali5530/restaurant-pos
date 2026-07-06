import {Tables} from "@/api/db/tables.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {getAccountHeadType, toAccountBalance} from "@/components/accounts/reports.utils.ts";
import {POSTED_ENTRY_FILTER, resolveAsOfDate} from "@/api/reports/accounts/shared.ts";
import {normalizeQueryDate} from "@/api/reports/shared/filters.ts";

export interface BalanceSheetAccountRow {
  code: string;
  name: string;
  balance: number;
  totalDebit: number;
  totalCredit: number;
}

export interface BalanceSheetResult {
  assets: BalanceSheetAccountRow[];
  liabilities: BalanceSheetAccountRow[];
  equity: BalanceSheetAccountRow[];
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    liabilitiesPlusEquity: number;
    isBalanced: boolean;
  };
  asOf: string;
}

export const getBalanceSheet = async (
  db: DbClient,
  filters: DateRangeFilter & {asOf?: string} = {},
): Promise<BalanceSheetResult> => {
  const asOfDate = resolveAsOfDate(filters.asOf, filters);
  const asOfLabel = filters.asOf
    ? normalizeQueryDate(filters.asOf)
    : (filters.endDate || filters.startDate || asOfDate.toISOString());

  const [result] = await db.query(
    `
      SELECT
        account,
        account.code,
        account.name,
        account.group,
        math::sum(debit) as total_debit,
        math::sum(credit) as total_credit
      FROM ${Tables.account_journal_lines}
      WHERE ${POSTED_ENTRY_FILTER}
        AND entry.date <= <datetime>$as_of
      GROUP BY account.code, account.name, account.group
      ORDER BY account.code ASC
      FETCH account, account.group
    `,
    {as_of: asOfDate},
  );

  const assets: BalanceSheetAccountRow[] = [];
  const liabilities: BalanceSheetAccountRow[] = [];
  const equity: BalanceSheetAccountRow[] = [];

  (result || []).forEach((row: {
    account?: {
      code?: string;
      name?: string;
      account_type?: string;
      group?: {head_type?: string; normal_balance?: string};
      normal_balance?: string;
    };
    total_debit?: number;
    total_credit?: number;
  }) => {
    const head = getAccountHeadType(row.account);
    if (!head || !["asset", "liability", "equity"].includes(head)) {
      return;
    }

    const normalBalance = row.account?.normal_balance || row.account?.group?.normal_balance;
    const balance = toAccountBalance(
      Number(row.total_debit || 0),
      Number(row.total_credit || 0),
      normalBalance,
    );
    const item: BalanceSheetAccountRow = {
      code: String(row.account?.code || ""),
      name: String(row.account?.name || ""),
      balance,
      totalDebit: Number(row.total_debit || 0),
      totalCredit: Number(row.total_credit || 0),
    };

    if (head === "asset") {
      assets.push(item);
    } else if (head === "liability") {
      liabilities.push(item);
    } else {
      equity.push(item);
    }
  });

  const totalAssets = assets.reduce((sum, row) => sum + row.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, row) => sum + row.balance, 0);
  const totalEquity = equity.reduce((sum, row) => sum + row.balance, 0);
  const liabilitiesPlusEquity = totalLiabilities + totalEquity;

  return {
    assets,
    liabilities,
    equity,
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
      equity: totalEquity,
      liabilitiesPlusEquity,
      isBalanced: Math.abs(totalAssets - liabilitiesPlusEquity) < 0.01,
    },
    asOf: asOfLabel,
  };
};
