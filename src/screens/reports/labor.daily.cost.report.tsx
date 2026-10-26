import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getDailyLaborCost} from '@/api/reports/labor';
import type {LaborCostResult} from '@/api/reports/labor/shared/types.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';
import {useReportBranchScope} from '@/hooks/useReportBranchScope.ts';
import {BranchBreakdown} from '@/components/reports/branch.breakdown.tsx';

type BranchMarker = {branch_id?: string | null; rows: LaborCostResult[]};

const DailyCostSection = ({rows}: {rows: LaborCostResult[]}) => {
  const totals = rows.reduce(
    (acc, row) => ({
      totalCost: acc.totalCost + row.totalCost,
      totalHours: acc.totalHours + row.totalHours,
      overtimeHours: acc.overtimeHours + row.overtimeHours,
    }),
    {totalCost: 0, totalHours: 0, overtimeHours: 0},
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-primary/10 border border-primary/40 rounded-lg p-4">
          <p className="text-sm text-primary-700">Total cost</p>
          <p className="text-xl font-bold text-primary-900">{withCurrency(totals.totalCost)}</p>
        </div>
        <div className="bg-info/10 border border-info-200 rounded-lg p-4">
          <p className="text-sm text-info-700">Total hours</p>
          <p className="text-xl font-bold text-info-900">{formatNumber(totals.totalHours)}</p>
        </div>
        <div className="bg-warning/10 border border-warning/40 rounded-lg p-4">
          <p className="text-sm text-warning-700">Overtime hours</p>
          <p className="text-xl font-bold text-warning-900">{formatNumber(totals.overtimeHours)}</p>
        </div>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-surface">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted">Date</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">Hours</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">OT Hours</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">Employees</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-muted">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map(row => (
              <tr key={row.period}>
                <td className="px-4 py-2 text-sm text-foreground">{row.period}</td>
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
  );
};

export const LaborDailyCostReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const branchScope = useReportBranchScope();
  const queryRef = useRef(db.query);
  const [markers, setMarkers] = useState<BranchMarker[]>([]);
  const [totalRows, setTotalRows] = useState<LaborCostResult[]>([]);
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
            rows: await getDailyLaborCost(client, {...base, branchIds: [id]}),
          })));
          setMarkers(perBranch);
          setTotalRows(await getDailyLaborCost(client, base));
        } else {
          const data = await getDailyLaborCost(client, base);
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
    <ReportsLayout title={t('titles.dailyLaborCost')} subtitle={subtitle}>
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
            return <DailyCostSection key={key} rows={rows} />;
          }}
        />
      ) : null}
    </ReportsLayout>
  );
};
