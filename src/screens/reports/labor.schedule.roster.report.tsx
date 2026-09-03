import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {DateTime} from 'luxon';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getScheduleRoster} from '@/api/reports/labor';
import type {ScheduleRosterResult} from '@/api/reports/labor/shared/types.ts';

export const LaborScheduleRosterReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [roster, setRoster] = useState<ScheduleRosterResult>({weeks: []});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      ...parseDateRangeFromParams(params),
      scheduleId: params.get('schedule') || undefined,
    };
  }, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getScheduleRoster(
          {query: queryRef.current.bind(db)},
          {
            startDate: filters.startDate,
            endDate: filters.endDate,
            scheduleId: filters.scheduleId,
          },
        );
        setRoster(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [filters.startDate, filters.endDate, filters.scheduleId]);

  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;
  const dateFormat = (import.meta.env.VITE_DATE_FORMAT as string | undefined) || 'dd MMM yyyy';

  return (
    <ReportsLayout title={t('titles.scheduleRoster')} subtitle={subtitle}>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>
      {loading ? <div className="py-12 text-center text-neutral-500">{t('loading.chart')}</div> : null}
      {error ? <div className="py-12 text-center text-danger-500">{error}</div> : null}
      {!loading && !error && roster.weeks.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">{t('empty.noScheduleRoster')}</div>
      ) : null}
      {!loading && !error && roster.weeks.length > 0 ? (
        <div className="space-y-6 print:overflow-visible">
          {roster.weeks.map(week => (
            <div key={week.weekStart} className="overflow-x-auto border rounded-lg break-inside-avoid">
              <h2 className="px-4 py-2 text-sm font-semibold bg-neutral-50 border-b text-neutral-700">
                {t('weekOf', {date: DateTime.fromISO(week.weekStart).toFormat(dateFormat)})}
              </h2>
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-neutral-600">
                      {t('columns.employee')}
                    </th>
                    {week.days.map((day, index) => (
                      <th key={day} className="px-2 py-2 text-center text-xs font-semibold uppercase text-neutral-600">
                        <div>{t(`weekdays.${index + 1}`)}</div>
                        <div className="font-normal normal-case text-neutral-500">
                          {DateTime.fromISO(day).toFormat('dd MMM')}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {week.rows.map(row => (
                    <tr key={row.employeeId}>
                      <td className="px-3 py-2 text-sm text-neutral-800 whitespace-nowrap">
                        <div className="font-medium">{row.employeeName}</div>
                        {row.departmentName ? (
                          <div className="text-xs text-neutral-500">{row.departmentName}</div>
                        ) : null}
                      </td>
                      {week.days.map(day => (
                        <td key={day} className="px-2 py-2 text-center text-xs text-neutral-800 align-top">
                          {(row.days[day] ?? []).map(shift => (
                            <div key={`${shift.start}-${shift.end}`}>
                              {shift.start}–{shift.end}
                            </div>
                          ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}
    </ReportsLayout>
  );
};
