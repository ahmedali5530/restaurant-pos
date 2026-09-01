import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";

type ExpenseItem = {
  id?: string;
  description?: string;
  category?: string;
  amount?: number;
};

type ClosingExpenseRow = {
  id: string;
  date_from?: unknown;
  date_to?: unknown;
  expenses_data?: ExpenseItem[];
};

type FlattenedExpense = {
  closingId: string;
  dateFrom?: unknown;
  dateTo?: unknown;
  description: string;
  category: string;
  amount: number;
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  return {startDate, endDate};
};

export const ExpenseReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [rows, setRows] = useState<FlattenedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions: string[] = [];
        const params: Record<string, string> = {};

        if (filters.startDate) {
          conditions.push(`time::format(date_from, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }
        if (filters.endDate) {
          conditions.push(`time::format(date_from, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        const query = `
          SELECT * FROM ${Tables.closings}
          ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY date_from DESC
        `;
        const [result] = await queryRef.current(query, params);
        const closings = (result || []) as ClosingExpenseRow[];

        const flatRows = closings.flatMap((closing) => {
          const expenses = closing.expenses_data || [];
          return expenses.map((expense) => ({
            closingId: closing.id,
            dateFrom: closing.date_from,
            dateTo: closing.date_to,
            description: expense.description || "-",
            category: expense.category || "-",
            amount: Number(expense.amount || 0),
          }));
        });
        setRows(flatRows);
      } catch (err) {
        console.error("Failed to load expense report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [filters.endDate, filters.startDate]);

  const totalExpenses = useMemo(() => rows.reduce((sum, row) => sum + row.amount, 0), [rows]);

  if (loading) {
    return <ReportsLayout title={t('titles.expense')} subtitle={subtitle}><div className="py-12 text-center text-neutral-500">{t('loading.expense')}</div></ReportsLayout>;
  }
  if (error) {
    return <ReportsLayout title={t('titles.expense')} subtitle={subtitle}><div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout title={t('titles.expense')} subtitle={subtitle}>
      <div className="space-y-4">
        <div className="border rounded-lg p-4 bg-neutral-50">
          <div className="text-sm text-neutral-500">{t('labels.expenseRows')}</div>
          <div className="text-xl font-semibold">{formatNumber(rows.length)}</div>
          <div className="text-sm text-neutral-500 mt-2">Total expenses</div>
          <div className="text-xl font-semibold">{withCurrency(totalExpenses)}</div>
        </div>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
            <tr>
              <th className="py-3 pl-6 pr-3 text-left text-sm font-semibold text-neutral-700">{t('metrics.dateWindow')}</th>
              <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">{t('columns.description')}</th>
              <th className="py-3 px-3 text-left text-sm font-semibold text-neutral-700">{t('columns.category')}</th>
              <th className="py-3 pr-6 text-right text-sm font-semibold text-neutral-700">{t('columns.amount')}</th>
            </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">No expenses found for selected range.</td>
              </tr>
            ) : rows.map((row, index) => (
              <tr key={`${row.closingId}-${index}`}>
                <td className="py-3 pl-6 pr-3 text-sm text-neutral-700">
                  {`${toLuxonDateTime(row.dateFrom as any).toFormat("yyyy-LL-dd HH:mm")} - ${toLuxonDateTime(row.dateTo as any).toFormat("yyyy-LL-dd HH:mm")}`}
                </td>
                <td className="py-3 px-3 text-sm text-neutral-700">{row.description}</td>
                <td className="py-3 px-3 text-sm text-neutral-700">{row.category}</td>
                <td className="py-3 pr-6 text-right text-sm font-semibold text-neutral-900">{withCurrency(row.amount)}</td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportsLayout>
  );
};
