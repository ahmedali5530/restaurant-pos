import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getOvertimeReport} from '@/api/reports/labor';
import type {OvertimeReportRow} from '@/api/reports/labor/shared/types.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';

export const LaborOvertimeReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [rows, setRows] = useState<OvertimeReportRow[]>([]);
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
        const data = await getOvertimeReport(
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
    <ReportsLayout title={t('titles.overtimeReport')} subtitle={subtitle}>
      {loading ? <div className="py-12 text-center text-neutral-500">{t('loading.chart')}</div> : null}
      {error ? <div className="py-12 text-center text-danger-500">{error}</div> : null}
      {!loading && !error ? (
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-neutral-600">{t('columns.name')}</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-neutral-600">Department</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Regular</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">OT</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Double</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">OT Pay</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">{t('columns.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-500">No overtime records</td></tr>
              ) : rows.map(row => (
                <tr key={row.employeeId}>
                  <td className="px-4 py-2 text-sm text-neutral-800">{row.employeeName}</td>
                  <td className="px-4 py-2 text-sm text-neutral-600">{row.departmentName || '-'}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.regularHours)}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.overtimeHours)}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.doubleTimeHours)}</td>
                  <td className="px-4 py-2 text-sm text-right">{withCurrency(row.overtimePay)}</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{withCurrency(row.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ReportsLayout>
  );
};
