import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getDailyLaborCost} from '@/api/reports/labor';
import type {LaborCostResult} from '@/api/reports/labor/shared/types.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';

export const LaborDailyCostReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [rows, setRows] = useState<LaborCostResult[]>([]);
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
        const data = await getDailyLaborCost(
          {query: queryRef.current.bind(db)},
          {startDate: filters.startDate, endDate: filters.endDate},
        );
        setRows(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [filters.startDate, filters.endDate]);

  const totals = useMemo(() => rows.reduce(
    (acc, row) => ({
      totalCost: acc.totalCost + row.totalCost,
      totalHours: acc.totalHours + row.totalHours,
      overtimeHours: acc.overtimeHours + row.overtimeHours,
    }),
    {totalCost: 0, totalHours: 0, overtimeHours: 0},
  ), [rows]);

  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  return (
    <ReportsLayout title={t('titles.dailyLaborCost')} subtitle={subtitle}>
      {loading ? <div className="py-12 text-center text-neutral-500">{t('loading.chart')}</div> : null}
      {error ? <div className="py-12 text-center text-danger-500">{error}</div> : null}
      {!loading && !error ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <p className="text-sm text-primary-700">Total cost</p>
              <p className="text-xl font-bold text-primary-900">{withCurrency(totals.totalCost)}</p>
            </div>
            <div className="bg-info-50 border border-info-200 rounded-lg p-4">
              <p className="text-sm text-info-700">Total hours</p>
              <p className="text-xl font-bold text-info-900">{formatNumber(totals.totalHours)}</p>
            </div>
            <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
              <p className="text-sm text-warning-700">Overtime hours</p>
              <p className="text-xl font-bold text-warning-900">{formatNumber(totals.overtimeHours)}</p>
            </div>
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-neutral-600">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Hours</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">OT Hours</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Employees</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map(row => (
                  <tr key={row.period}>
                    <td className="px-4 py-2 text-sm text-neutral-800">{row.period}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.totalHours)}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.overtimeHours)}</td>
                    <td className="px-4 py-2 text-sm text-right">{formatNumber(row.employeeCount)}</td>
                    <td className="px-4 py-2 text-sm text-right font-semibold">{withCurrency(row.totalCost)}</td>
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
