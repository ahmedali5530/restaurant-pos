import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {DayClosing} from "@/api/model/day_closing.ts";
import {withCurrency} from "@/lib/utils.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("date") || params.get("start") || params.get("start") || "";
};

const toRecordString = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    return value.toString();
  }
  return String(value);
};

export const CashClosingReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [closing, setClosing] = useState<DayClosing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedDate = useMemo(parseFilters, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [rows] = await queryRef.current(
          `
            SELECT * FROM ${Tables.closings}
            WHERE time::format(date_from, "${import.meta.env.VITE_DB_DATABASE_DATE_FORMAT}") = $selectedDate
            ORDER BY created_at DESC
            LIMIT 1
            FETCH closed_by, opened_by
          `,
          {selectedDate}
        );

        setClosing((rows?.[0] || null) as DayClosing | null);
      } catch (err) {
        console.error("Failed to load cash closing report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [selectedDate]);

  const subtitle = selectedDate || "Selected day";
  const openingBalance = Number(closing?.opening_balance || 0);
  const totalCash = Number((closing?.terminal_cash || []).reduce((sum, item: any) => sum + Number(item?.cash_amount || 0), 0));
  const totalOtherPayments = Number((closing?.payments_data || [])
    .filter((item: any) => String(item?.payment_type?.type || "").toLowerCase() !== "cash")
    .reduce((sum, item: any) => sum + Number(item?.amount || 0), 0));
  const totalExpenses = Number(closing?.expenses || 0);
  const closingBalance = Number(closing?.closing_balance || 0);

  if (loading) {
    return (
      <ReportsLayout title={t('titles.cashClosing')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.cashClosing')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('titles.cashClosing')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  if (!closing) {
    return (
      <ReportsLayout title={t('titles.cashClosing')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">No cash closing found for selected date.</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('titles.cashClosing')} subtitle={subtitle}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="border rounded-lg p-4 bg-neutral-50">
            <div className="text-sm text-neutral-500">Opening balance</div>
            <div className="text-xl font-semibold">{withCurrency(openingBalance)}</div>
          </div>
          <div className="border rounded-lg p-4 bg-neutral-50">
            <div className="text-sm text-neutral-500">Total cash</div>
            <div className="text-xl font-semibold">{withCurrency(totalCash)}</div>
          </div>
          <div className="border rounded-lg p-4 bg-neutral-50">
            <div className="text-sm text-neutral-500">Other payments</div>
            <div className="text-xl font-semibold">{withCurrency(totalOtherPayments)}</div>
          </div>
          <div className="border rounded-lg p-4 bg-neutral-50">
            <div className="text-sm text-neutral-500">{t('labels.cashAdded')}</div>
            <div className="text-xl font-semibold">{withCurrency(Number(closing.cash_added || 0))}</div>
          </div>
          <div className="border rounded-lg p-4 bg-neutral-50">
            <div className="text-sm text-neutral-500">{t('columns.expenses')}</div>
            <div className="text-xl font-semibold">{withCurrency(totalExpenses)}</div>
          </div>
          <div className="border rounded-lg p-4 bg-neutral-50">
            <div className="text-sm text-neutral-500">{t('labels.closingBalance')}</div>
            <div className="text-xl font-semibold">{withCurrency(closingBalance)}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <tbody className="divide-y divide-neutral-100 bg-white">
              <tr>
                <td className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-700">{t('filters.status')}</td>
                <td className="py-3 pr-6 text-sm text-neutral-900 capitalize">{closing.status || "-"}</td>
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-700">Window</td>
                <td className="py-3 pr-6 text-sm text-neutral-900">
                  {toLuxonDateTime(closing.date_from).toFormat("yyyy-LL-dd HH:mm")} - {toLuxonDateTime(closing.date_to).toFormat("yyyy-LL-dd HH:mm")}
                </td>
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-700">Created at</td>
                <td className="py-3 pr-6 text-sm text-neutral-900">
                  {toLuxonDateTime(closing.created_at).toFormat("yyyy-LL-dd HH:mm")}
                </td>
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-700">Closed at</td>
                <td className="py-3 pr-6 text-sm text-neutral-900">
                  {closing.closed_at ? toLuxonDateTime(closing.closed_at).toFormat("yyyy-LL-dd HH:mm") : "-"}
                </td>
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-700">Notes</td>
                <td className="py-3 pr-6 text-sm text-neutral-900">{closing.notes || "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Terminal cash</h3>
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">Terminal</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {(closing.terminal_cash || []).length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-sm text-neutral-500">No terminal cash data</td>
                </tr>
              ) : (
                (closing.terminal_cash || []).map((terminal: any, index) => (
                  <tr key={toRecordString(terminal?.terminal_id) || String(index)}>
                    <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{terminal?.terminal_name || "Terminal"}</td>
                    <td className="py-3 px-3 text-right text-sm text-neutral-900">{withCurrency(Number(terminal?.cash_amount || 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">Payment summary</h3>
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">Payment type</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {(closing.payments_data || []).length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-sm text-neutral-500">No payment summary data</td>
                </tr>
              ) : (
                (closing.payments_data || []).map((payment: any, index) => (
                  <tr key={`${toRecordString(payment?.payment_type?.id || payment?.payment_type)}_${index}`}>
                    <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">
                      {payment?.payment_type?.name || toRecordString(payment?.payment_type) || "Unknown"}
                    </td>
                    <td className="py-3 px-3 text-right text-sm text-neutral-900">{withCurrency(Number(payment?.amount || 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <h3 className="bg-neutral-100 px-6 py-3 text-sm font-semibold text-neutral-700">{t('columns.expenses')}</h3>
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700">{t('columns.description')}</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">{t('columns.category')}</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">{t('columns.amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {(closing.expenses_data || []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-sm text-neutral-500">No expense records</td>
                </tr>
              ) : (
                (closing.expenses_data || []).map((expense: any, index) => (
                  <tr key={toRecordString(expense?.id) || String(index)}>
                    <td className="py-3 pl-6 pr-3 text-sm text-neutral-900">{expense?.description || "-"}</td>
                    <td className="py-3 px-3 text-sm text-neutral-700">{expense?.category || "-"}</td>
                    <td className="py-3 px-3 text-right text-sm text-neutral-900">{withCurrency(Number(expense?.amount || 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
            {(closing.expenses_data || []).length > 0 && (
              <tfoot className="bg-neutral-50">
                <tr>
                  <td colSpan={2} className="py-3 pl-6 pr-3 text-sm font-semibold text-neutral-900">Total expenses</td>
                  <td className="py-3 px-3 text-right text-sm font-bold text-neutral-900">{withCurrency(totalExpenses)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </ReportsLayout>
  );
};