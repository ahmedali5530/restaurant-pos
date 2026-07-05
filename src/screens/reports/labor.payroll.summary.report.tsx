import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getPayrollSummary} from '@/api/reports/labor';
import type {PayrollSummaryResult} from '@/api/reports/labor/shared/types.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';

export const LaborPayrollSummaryReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [summary, setSummary] = useState<PayrollSummaryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = useMemo(() => parseDateRangeFromParams(new URLSearchParams(window.location.search)), []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getPayrollSummary(
          {query: queryRef.current.bind(db)},
          {startDate: filters.startDate, endDate: filters.endDate},
        );
        setSummary(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [filters.startDate, filters.endDate]);

  const subtitle = summary?.periodStart && summary?.periodEnd
    ? `${summary.periodStart} to ${summary.periodEnd}`
    : filters.startDate && filters.endDate
      ? `${filters.startDate} to ${filters.endDate}`
      : undefined;

  return (
    <ReportsLayout title={t('titles.payrollSummary')} subtitle={subtitle}>
      {loading ? <div className="py-12 text-center text-neutral-500">{t('loading.chart')}</div> : null}
      {error ? <div className="py-12 text-center text-danger-500">{error}</div> : null}
      {!loading && !error && summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border rounded-lg p-4"><p className="text-sm text-neutral-500">Employees</p><p className="text-xl font-bold">{formatNumber(summary.employeeCount)}</p></div>
            <div className="bg-white border rounded-lg p-4"><p className="text-sm text-neutral-500">Gross pay</p><p className="text-xl font-bold">{withCurrency(summary.totalGrossPay)}</p></div>
            <div className="bg-white border rounded-lg p-4"><p className="text-sm text-neutral-500">Net pay</p><p className="text-xl font-bold">{withCurrency(summary.totalNetPay)}</p></div>
            <div className="bg-white border rounded-lg p-4"><p className="text-sm text-neutral-500">OT hours</p><p className="text-xl font-bold">{formatNumber(summary.totalOvertimeHours)}</p></div>
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-neutral-600">{t('columns.name')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Regular hrs</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">OT hrs</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Gross</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Deductions</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {summary.rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-500">No payroll snapshots</td></tr>
                ) : summary.rows.map(row => (
                  <tr key={row.snapshotId}>
                    <td className="px-4 py-2 text-sm text-neutral-800">{row.employeeName}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.regularHours)}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.overtimeHours)}</td>
                    <td className="px-4 py-2 text-sm text-right">{withCurrency(row.grossPay)}</td>
                    <td className="px-4 py-2 text-sm text-right">{withCurrency(row.deductions)}</td>
                    <td className="px-4 py-2 text-sm text-right font-semibold">{withCurrency(row.netPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </ReportsLayout>
  );
};
