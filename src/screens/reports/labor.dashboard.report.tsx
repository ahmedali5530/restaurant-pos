import {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ReportsLayout} from '@/screens/partials/reports.layout.tsx';
import {useDB} from '@/api/db/db.ts';
import {parseDateRangeFromParams} from '@/api/reports/shared/filters.ts';
import {getLaborDashboardSnapshot, getLaborDashboardTrend} from '@/api/reports/labor/dashboard.ts';
import type {LaborDashboardSnapshot, LaborCostResult} from '@/api/reports/labor/shared/types.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';
import {ResponsiveLine} from '@nivo/line';

const MetricCard = ({label, value, subtitle}: {label: string; value: string; subtitle?: string}) => (
  <div className="bg-white border rounded-lg p-4 shadow-sm">
    <p className="text-sm text-neutral-500">{label}</p>
    <p className="text-2xl font-bold text-neutral-900 mt-1">{value}</p>
    {subtitle ? <p className="text-xs text-neutral-400 mt-1">{subtitle}</p> : null}
  </div>
);

export const LaborDashboardReport = () => {
  const {t} = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [snapshot, setSnapshot] = useState<LaborDashboardSnapshot | null>(null);
  const [trend, setTrend] = useState<LaborCostResult[]>([]);
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
        const client = {query: queryRef.current.bind(db)};
        const [dashboard, trendData] = await Promise.all([
          getLaborDashboardSnapshot(client),
          getLaborDashboardTrend(client),
        ]);
        setSnapshot(dashboard);
        setTrend(trendData);
      } catch (err) {
        console.error('Failed to load labor dashboard', err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [filters.startDate, filters.endDate]);

  const chartData = useMemo(() => [{
    id: 'Labor cost',
    data: trend.map(point => ({x: point.period, y: point.totalCost})),
  }], [trend]);

  if (loading) {
    return <ReportsLayout title={t('titles.laborDashboard')}><div className="py-12 text-center text-neutral-500">{t('loading.chart')}</div></ReportsLayout>;
  }

  if (error || !snapshot) {
    return <ReportsLayout title={t('titles.laborDashboard')}><div className="py-12 text-center text-danger-500">{error}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout title={t('titles.laborDashboard')} subtitle={snapshot.asOf}>
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

        <div className="bg-white border rounded-lg p-5 shadow-sm h-[320px]">
          <h2 className="text-lg font-semibold text-neutral-700 mb-4">{t('hr:dashboard.laborTrend')}</h2>
          {chartData[0].data.length > 0 ? (
            <ResponsiveLine
              data={chartData}
              margin={{top: 20, right: 20, bottom: 50, left: 70}}
              xScale={{type: 'point'}}
              yScale={{type: 'linear', min: 0}}
              axisBottom={{tickRotation: -35}}
              axisLeft={{format: value => withCurrency(value).replace(/\.00$/, '')}}
              colors={['#0046FE']}
              pointSize={8}
              useMesh
            />
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-500">No trend data</div>
          )}
        </div>
      </div>
    </ReportsLayout>
  );
};
