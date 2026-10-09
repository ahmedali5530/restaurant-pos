import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getOvertimeReport} from '@/api/reports/labor';
import type {OvertimeReportRow} from '@/api/reports/labor/shared/types.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';
import {useReportBranchScope} from '@/hooks/useReportBranchScope.ts';
import {BranchBreakdown} from '@/components/reports/branch.breakdown.tsx';

type BranchMarker = {branch_id?: string | null; rows: OvertimeReportRow[]};

const OvertimeTable = ({rows}: {rows: OvertimeReportRow[]}) => {
  const {t} = useTranslation('reports');
  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full divide-y divide-neutral-200">
        <thead className="bg-surface">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted">{t('columns.name')}</th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted">Department</th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">Regular</th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">OT</th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">Double</th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">OT Pay</th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">{t('columns.total')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No overtime records</td></tr>
          ) : rows.map(row => (
            <tr key={row.employeeId}>
              <td className="px-4 py-2 text-sm text-foreground">{row.employeeName}</td>
              <td className="px-4 py-2 text-sm text-muted">{row.departmentName || '-'}</td>
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
  );
};

export const LaborOvertimeReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const branchScope = useReportBranchScope();
  const queryRef = useRef(db.query);
  const [markers, setMarkers] = useState<BranchMarker[]>([]);
  const [totalRows, setTotalRows] = useState<OvertimeReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = useMemo(() => parseDateRangeFromParams(new URLSearchParams(window.location.search)), []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    if (!branchScope.ready) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const client = {query: queryRef.current.bind(db)};
        const base = {startDate: filters.startDate, endDate: filters.endDate, branchIds: branchScope.branchIds};

        if (branchScope.isByBranch) {
          const ids = (branchScope.branchIds?.length ? branchScope.branchIds : branchScope.branchOrder);
          const perBranch = await Promise.all(ids.map(async (id) => ({
            branch_id: id,
            rows: await getOvertimeReport(client, {...base, branchIds: [id]}),
          })));
          setMarkers(perBranch);
          setTotalRows(await getOvertimeReport(client, base));
        } else {
          const data = await getOvertimeReport(client, base);
          setMarkers([{branch_id: undefined, rows: data}]);
          setTotalRows(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [branchScope.ready, branchScope.branchIds, branchScope.isByBranch, branchScope.branchOrder, filters.startDate, filters.endDate]);

  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;
  const dataByBranch = useMemo(
    () => new Map(markers.map((m) => [String(m.branch_id ?? ''), m.rows])),
    [markers],
  );

  return (
    <ReportsLayout title={t('titles.overtimeReport')} subtitle={subtitle}>
      {loading || !branchScope.ready ? <div className="py-12 text-center text-muted">{t('loading.chart')}</div> : null}
      {error ? <div className="py-12 text-center text-danger-500">{error}</div> : null}
      {!loading && branchScope.ready && !error ? (
        <BranchBreakdown
          enabled={branchScope.isByBranch}
          rows={markers}
          labels={branchScope.branchLabels}
          branchOrder={branchScope.branchOrder}
          renderSection={({key}) => {
            const rows =
              key === 'total' || key === 'combined'
                ? totalRows
                : (dataByBranch.get(key) ?? []);
            return <OvertimeTable key={key} rows={rows} />;
          }}
        />
      ) : null}
    </ReportsLayout>
  );
};
