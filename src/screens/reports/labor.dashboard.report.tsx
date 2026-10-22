import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getLaborDashboardSnapshot, getLaborDashboardTrend} from '@/api/reports/labor/dashboard.ts';
import type {LaborDashboardSnapshot, LaborCostResult} from '@/api/reports/labor/shared/types.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';
import {ResponsiveLine} from '@nivo/line';
import {useNivoTheme} from '@/lib/nivo-theme.ts';
import {cssVarRgb} from '@/lib/theme.ts';
import {useReportBranchScope} from '@/hooks/useReportBranchScope.ts';
import {BranchBreakdown} from '@/components/reports/branch.breakdown.tsx';

const MetricCard = ({label, value, subtitle}: {label: string; value: string; subtitle?: string}) => (
  <div className="bg-surface-elevated border rounded-lg p-4 shadow-sm">
    <p className="text-sm text-muted">{label}</p>
    <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    {subtitle ? <p className="text-xs text-muted mt-1">{subtitle}</p> : null}
  </div>
);

type BranchMarker = {
  branch_id?: string | null;
  snapshot: LaborDashboardSnapshot;
  trend: LaborCostResult[];
};

const DashboardSection = ({
  snapshot,
  trend,
}: {
  snapshot: LaborDashboardSnapshot;
  trend: LaborCostResult[];
}) => {
  const {t} = useTranslation('reports');
  const nivoTheme = useNivoTheme();
  const primary = cssVarRgb('--primary', '0 70 254');
  const chartData = useMemo(() => [{
    id: 'Labor cost',
    data: trend.map(point => ({x: point.period, y: point.totalCost})),
  }], [trend]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <MetricCard label={t('hr:dashboard.clockedIn')} value={formatNumber(snapshot.clockedInCount)} />
        <MetricCard label={t('hr:dashboard.onBreak')} value={formatNumber(snapshot.onBreakCount)} />
        <MetricCard label={t('hr:dashboard.scheduledToday')} value={formatNumber(snapshot.scheduledTodayCount)} />
        <MetricCard label={t('hr:dashboard.missing')} value={formatNumber(snapshot.missingCount)} />
        <MetricCard label={t('hr:dashboard.lateToday')} value={formatNumber(snapshot.lateTodayCount)} />
        <MetricCard label={t('hr:dashboard.pendingApprovals')} value={formatNumber(snapshot.pendingApprovals)} />
        <MetricCard label={t('hr:dashboard.laborCostToday')} value={withCurrency(snapshot.laborCostToday)} />
        <MetricCard label={t('hr:dashboard.projectedCost')} value={withCurrency(snapshot.projectedEodCost)} />
        <MetricCard label={t('hr:dashboard.laborPercent')} value={`${formatNumber(snapshot.laborPercent)}%`} />
        <MetricCard label={t('hr:dashboard.salesToday')} value={withCurrency(snapshot.salesToday)} />
        <MetricCard label={t('hr:dashboard.salesPerLaborHour')} value={withCurrency(snapshot.salesPerLaborHour)} />
        <MetricCard label={t('hr:dashboard.avgHourlyCost')} value={withCurrency(snapshot.avgHourlyCost)} />
      </div>

      <div className="bg-surface-elevated border rounded-lg p-5 shadow-sm h-[320px]">
        <h2 className="text-lg font-semibold text-foreground mb-4">{t('hr:dashboard.laborTrend')}</h2>
        {chartData[0].data.length > 0 ? (
          <ResponsiveLine
            data={chartData}
            margin={{top: 20, right: 20, bottom: 50, left: 70}}
            xScale={{type: 'point'}}
            yScale={{type: 'linear', min: 0}}
            axisBottom={{tickRotation: -35}}
            axisLeft={{format: value => withCurrency(value).replace(/\.00$/, '')}}
            colors={[primary]}
            pointSize={8}
            useMesh
            theme={nivoTheme}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted">No trend data</div>
        )}
      </div>
    </div>
  );
};

export const LaborDashboardReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const branchScope = useReportBranchScope();
  const queryRef = useRef(db.query);
  const [markers, setMarkers] = useState<BranchMarker[]>([]);
  const [totalSnapshot, setTotalSnapshot] = useState<LaborDashboardSnapshot | null>(null);
  const [totalTrend, setTotalTrend] = useState<LaborCostResult[]>([]);
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
        const base = {branchIds: branchScope.branchIds};

        if (branchScope.isByBranch) {
          const ids = (branchScope.branchIds?.length ? branchScope.branchIds : branchScope.branchOrder);
          const perBranch = await Promise.all(ids.map(async (id) => {
            const opts = {branchIds: [id]};
            const [snapshot, trend] = await Promise.all([
              getLaborDashboardSnapshot(client, opts),
              getLaborDashboardTrend(client, opts),
            ]);
            return {branch_id: id, snapshot, trend};
          }));
          setMarkers(perBranch);
          const [dashboard, trendData] = await Promise.all([
            getLaborDashboardSnapshot(client, base),
            getLaborDashboardTrend(client, base),
          ]);
          setTotalSnapshot(dashboard);
          setTotalTrend(trendData);
        } else {
          const [dashboard, trendData] = await Promise.all([
            getLaborDashboardSnapshot(client, base),
            getLaborDashboardTrend(client, base),
          ]);
          setMarkers([{branch_id: undefined, snapshot: dashboard, trend: trendData}]);
          setTotalSnapshot(dashboard);
          setTotalTrend(trendData);
        }
      } catch (err) {
        console.error('Failed to load labor dashboard', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [branchScope.ready, branchScope.branchIds, branchScope.isByBranch, branchScope.branchOrder, filters.startDate, filters.endDate]);

  const dataByBranch = useMemo(
    () => new Map(markers.map((m) => [String(m.branch_id ?? ''), m])),
    [markers],
  );

  if (loading || !branchScope.ready) {
    return <ReportsLayout title={t('titles.laborDashboard')}><div className="py-12 text-center text-muted">{t('loading.chart')}</div></ReportsLayout>;
  }

  if (error || !totalSnapshot) {
    return <ReportsLayout title={t('titles.laborDashboard')}><div className="py-12 text-center text-danger-500">{error}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout title={t('titles.laborDashboard')} subtitle={totalSnapshot.asOf}>
      <BranchBreakdown
        enabled={branchScope.isByBranch}
        rows={markers}
        labels={branchScope.branchLabels}
        branchOrder={branchScope.branchOrder}
        renderSection={({key}) => {
          const section =
            key === 'total' || key === 'combined'
              ? {snapshot: totalSnapshot, trend: totalTrend}
              : dataByBranch.get(key);
          if (!section) return null;
          return <DashboardSection key={key} snapshot={section.snapshot} trend={section.trend} />;
        }}
      />
    </ReportsLayout>
  );
};
