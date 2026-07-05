import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getScheduledVsActual} from '@/api/reports/labor';
import type {ScheduledVsActualRow} from '@/api/reports/labor/shared/types.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';

export const LaborScheduledVsActualReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [rows, setRows] = useState<ScheduledVsActualRow[]>([]);
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
        const data = await getScheduledVsActual(
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

  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  return (
    <ReportsLayout title={t('titles.scheduledVsActual')} subtitle={subtitle}>
      {loading ? <div className="py-12 text-center text-neutral-500">{t('loading.chart')}</div> : null}
      {error ? <div className="py-12 text-center text-danger-500">{error}</div> : null}
      {!loading && !error ? (
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-neutral-600">Date</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-neutral-600">{t('columns.name')}</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Scheduled hrs</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Actual hrs</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Variance</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Scheduled cost</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Actual cost</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Cost var.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-neutral-500">No schedule variance data</td></tr>
              ) : rows.map(row => (
                <tr key={`${row.employeeId}-${row.date}`}>
                  <td className="px-4 py-2 text-sm text-neutral-800">{row.date}</td>
                  <td className="px-4 py-2 text-sm text-neutral-800">{row.employeeName}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.scheduledHours)}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.actualHours)}</td>
                  <td className={`px-4 py-2 text-sm text-right font-medium ${row.varianceHours > 0 ? 'text-warning-700' : row.varianceHours < 0 ? 'text-info-700' : ''}`}>
                    {formatNumber(row.varianceHours)} ({formatNumber(row.variancePercent)}%)
                  </td>
                  <td className="px-4 py-2 text-sm text-right">{withCurrency(row.scheduledCost)}</td>
                  <td className="px-4 py-2 text-sm text-right">{withCurrency(row.actualCost)}</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{withCurrency(row.costVariance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ReportsLayout>
  );
};
