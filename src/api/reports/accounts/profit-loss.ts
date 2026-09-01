import {Tables} from "@/api/db/tables.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {getAccountHeadType} from "@/components/accounts/reports.utils.ts";
import {POSTED_ENTRY_FILTER, resolveDateRangeParams} from "@/api/reports/accounts/shared.ts";

export interface ProfitLossAccountRow {
  code: string;
  name: string;
  amount: number;
  totalDebit: number;
  totalCredit: number;
}

export interface ProfitLossResult {
  income: ProfitLossAccountRow[];
  expenses: ProfitLossAccountRow[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  dateRange: DateRangeFilter;
}

export const getProfitLoss = async (
  db: DbClient,
  dateRange: DateRangeFilter = {},
): Promise<ProfitLossResult> => {
  const {dateFrom, dateTo} = resolveDateRangeParams(dateRange);

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
        AND entry.date >= <datetime>$date_from
        AND entry.date <= <datetime>$date_to
      GROUP BY account.code, account.name, account.group
      ORDER BY account.code ASC
      FETCH account, account.group
    `,
    {date_from: dateFrom, date_to: dateTo},
  );

  const income: ProfitLossAccountRow[] = [];
  const expenses: ProfitLossAccountRow[] = [];

  (result || []).forEach((row: {
    account?: {code?: string; name?: string; account_type?: string; group?: {head_type?: string}};
    total_debit?: number;
    total_credit?: number;
  }) => {
    const head = getAccountHeadType(row.account);
    if (head !== "income" && head !== "expense") {
      return;
    }

    const totalDebit = Number(row.total_debit || 0);
    const totalCredit = Number(row.total_credit || 0);
    const amount = head === "income"
      ? totalCredit - totalDebit
      : totalDebit - totalCredit;

    const item: ProfitLossAccountRow = {
      code: String(row.account?.code || ""),
      name: String(row.account?.name || ""),
      amount,
      totalDebit,
      totalCredit,
    };

    if (head === "income") {
      income.push(item);
    } else {
      expenses.push(item);
    }
  });

  const totalIncome = income.reduce((sum, row) => sum + row.amount, 0);
  const totalExpense = expenses.reduce((sum, row) => sum + row.amount, 0);

  return {
    income,
    expenses,
    totalIncome,
    totalExpense,
    netProfit: totalIncome - totalExpense,
    dateRange,
  };
};
