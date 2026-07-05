import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getAttendanceReport} from '@/api/reports/labor';
import type {AttendanceReportRow} from '@/api/reports/labor/shared/types.ts';
import {formatNumber} from '@/lib/utils.ts';

export const LaborAttendanceReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [rows, setRows] = useState<AttendanceReportRow[]>([]);
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
        const data = await getAttendanceReport(
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
    <ReportsLayout title={t('titles.attendanceReport')} subtitle={subtitle}>
      {loading ? <div className="py-12 text-center text-neutral-500">{t('loading.chart')}</div> : null}
      {error ? <div className="py-12 text-center text-danger-500">{error}</div> : null}
      {!loading && !error ? (
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-neutral-600">{t('columns.name')}</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Scheduled</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Worked</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Late</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Absent</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">On time</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-neutral-600">Rate %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-500">No attendance data</td></tr>
              ) : rows.map(row => (
                <tr key={row.employeeId}>
                  <td className="px-4 py-2 text-sm text-neutral-800">{row.employeeName}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.scheduledShifts)}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.workedShifts)}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.lateCount)}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.absentCount)}</td>
                  <td className="px-4 py-2 text-sm text-right">{formatNumber(row.onTimeCount)}</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold">{formatNumber(row.attendanceRate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ReportsLayout>
  );
};
