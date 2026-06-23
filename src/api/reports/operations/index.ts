import {Tables} from "@/api/db/tables.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {safeNumber} from "@/lib/utils.ts";
import {recordToString} from "@/api/reports/shared/records.ts";

export const getExpenses = async (db: DbClient, options: DateRangeFilter) => {
  const conditions: string[] = [];
  const params: Record<string, string> = {};
  const dbFormat = import.meta.env.VITE_DB_DATABASE_FORMAT as string;

  if (options.startDate) {
    conditions.push(`time::format(date_from, "${dbFormat}") >= $startDate`);
    params.startDate = options.startDate;
  }
  if (options.endDate) {
    conditions.push(`time::format(date_from, "${dbFormat}") <= $endDate`);
    params.endDate = options.endDate;
  }

  const query = `
    SELECT * FROM ${Tables.closings}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY date_from DESC
    LIMIT 50
  `;

  const closings = unwrapQueryResult<{
    id: string;
    expenses_data?: Array<{description?: string; category?: string; amount?: number}>;
  }>(await db.query(query, params));

  const byCategory = new Map<string, number>();
  const expenses = closings.flatMap(closing =>
    (closing.expenses_data || []).map(expense => {
      const category = expense.category || "Uncategorized";
      byCategory.set(category, (byCategory.get(category) || 0) + safeNumber(expense.amount));
      return {
        description: expense.description || "-",
        category,
        amount: safeNumber(expense.amount),
        closingId: closing.id,
      };
    }),
  );

  return {
    totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
    expenseCount: expenses.length,
    byCategory: Array.from(byCategory.entries()).map(([category, amount]) => ({category, amount})),
    expenses: expenses.slice(0, 50),
  };
};

export const getActivityLog = async (db: DbClient, options: DateRangeFilter & {limit?: number}) => {
  const {limit = 50, ...dateRange} = options;
  const {conditions, params} = buildCreatedAtDateConditions(dateRange);

  const query = `
    SELECT * FROM ${Tables.tracking}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  const rows = unwrapQueryResult<{
    id: unknown;
    created_at?: unknown;
    module?: string;
    page?: string;
    user_name?: string;
    auth_method?: string;
  }>(await db.query(query, params));

  return {
    count: rows.length,
    entries: rows.map(row => ({
      id: recordToString(row.id),
      createdAt: row.created_at,
      module: row.module,
      page: row.page,
      userName: row.user_name,
      authMethod: row.auth_method,
    })),
  };
};

export const getCashClosing = async (db: DbClient, options: {date?: string}) => {
  const dbDateFormat = import.meta.env.VITE_DB_DATABASE_DATE_FORMAT as string;
  const selectedDate = options.date;

  const query = selectedDate
    ? `
      SELECT * FROM ${Tables.closings}
      WHERE time::format(date_from, "${dbDateFormat}") = $selectedDate
      ORDER BY created_at DESC
      LIMIT 1
      FETCH closed_by, opened_by
    `
    : `
      SELECT * FROM ${Tables.closings}
      ORDER BY created_at DESC
      LIMIT 1
      FETCH closed_by, opened_by
    `;

  const rows = unwrapQueryResult<{
    opening_balance?: number;
    closing_balance?: number;
    expenses?: number;
    terminal_cash?: Array<{cash_amount?: number}>;
    payments_data?: Array<{amount?: number; payment_type?: {type?: string}}>;
    date_from?: unknown;
    date_to?: unknown;
  }>(await db.query(query, selectedDate ? {selectedDate} : {}));

  const closing = rows[0];
  if (!closing) {
    return {found: false};
  }

  const totalCash = (closing.terminal_cash || []).reduce(
    (sum, item) => sum + safeNumber(item?.cash_amount),
    0,
  );
  const totalOtherPayments = (closing.payments_data || [])
    .filter(item => String(item?.payment_type?.type || "").toLowerCase() !== "cash")
    .reduce((sum, item) => sum + safeNumber(item?.amount), 0);

  return {
    found: true,
    openingBalance: safeNumber(closing.opening_balance),
    closingBalance: safeNumber(closing.closing_balance),
    totalCash,
    totalOtherPayments,
    totalExpenses: safeNumber(closing.expenses),
    variance: safeNumber(closing.closing_balance) - safeNumber(closing.opening_balance) - totalCash + safeNumber(closing.expenses),
    dateFrom: closing.date_from,
    dateTo: closing.date_to,
  };
};

export const getOrderLifecycleStats = async (db: DbClient, options: DateRangeFilter) => {
  const {conditions, params} = buildCreatedAtDateConditions(options);

  const [mergeRows, splitRows] = await Promise.all([
    db.query(
      `SELECT count() AS total FROM ${Tables.order_merge} ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} GROUP ALL`,
      params,
    ),
    db.query(
      `SELECT count() AS total FROM ${Tables.order_split} ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} GROUP ALL`,
      params,
    ),
  ]);

  const mergeCount = safeNumber((mergeRows as [Array<{total?: number}>])?.[0]?.[0]?.total);
  const splitCount = safeNumber((splitRows as [Array<{total?: number}>])?.[0]?.[0]?.total);

  return {
    mergedOrders: mergeCount,
    splitOrders: splitCount,
  };
};
