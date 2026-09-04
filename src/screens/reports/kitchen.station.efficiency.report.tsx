/**
 * AI Kitchen Station Efficiency Benchmark — benchmarks kitchen stations
 * against each other in real-time for efficiency, error rate, idle time,
 * and throughput.
 *
 * 114th POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from kitchen station efficiency gaps. No POS benchmarks stations
 * against each other.
 */

import { useState, useCallback, useMemo } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { Layout } from "@/screens/partials/layout.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGaugeHigh, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faStopwatch, faArrowTrendDown, faArrowTrendUp,
  faCircleExclamation, faChair, faTrophy, faScrewdriverWrench, faUsers, faScaleBalanced,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runStationEffEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readStationEffConfig, DEFAULT_STATIONEFF_CONFIG,
  type StationEffAlert,
} from "@/lib/kitchen-station-efficiency.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  slowest_station:        { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faStopwatch,          label: 'SLOWEST STATION' },
  efficiency_decline:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown,     label: 'EFFICIENCY DECLINE' },
  high_error_station:     { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faCircleExclamation,  label: 'HIGH ERRORS' },
  idle_time_excessive:    { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faChair,              label: 'IDLE EXCESSIVE' },
  best_performer:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTrophy,             label: 'BEST PERFORMER' },
  equipment_bottleneck:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faScrewdriverWrench,  label: 'EQUIPMENT BOTTLENECK' },
  staffing_mismatch:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUsers,              label: 'STAFFING MISMATCH' },
  cross_station_gap:      { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faScaleBalanced,      label: 'CROSS-STATION GAP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const TREND_ICON: Record<string, any> = {
  improving: faArrowTrendUp,
  declining: faArrowTrendDown,
  stable: faGaugeHigh,
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function KitchenStationEfficiencyScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<StationEffAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgEfficiency: 0, worstStation: '—' });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_STATIONEFF_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readStationEffConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[stationeff-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runStationEffEngine(db, config);
      toast.success(`Benchmarked ${result.generated} stations — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[stationeff-report] analyze failed', err);
      toast.error('Benchmark failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[stationeff-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_opportunity ?? 0) - (a.est_monthly_opportunity ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Station Efficiency", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faGaugeHigh} className="text-amber-600" />
              AI Kitchen Station Efficiency Benchmark
            </h1>
            <p className="text-sm text-neutral-500">
              Benchmarks kitchen stations against each other — efficiency, errors, idle time, throughput
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Benchmarking…' : 'Benchmark stations'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faGaugeHigh} label="Avg efficiency" value={`${summary.avgEfficiency.toFixed(0)}/100`} color="text-amber-600" />
          <SummaryCard icon={faStopwatch} label="Worst station" value={summary.worstStation} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faGaugeHigh} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faGaugeHigh} spin className="text-4xl mb-3" />
            <p>Benchmarking kitchen stations…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No efficiency alerts</p>
            <p className="text-sm mt-1">All stations performing at benchmark — no gaps detected.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faGaugeHigh, label: alert.rule_id.toUpperCase() };
              return (
                <div key={alert.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-neutral-800 uppercase">{alert.station}</span>
                          {alert.efficiency_score != null && (
                            <span className={`text-xs font-bold ${alert.efficiency_score >= 75 ? 'text-emerald-600' : alert.efficiency_score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {alert.efficiency_score}/100
                            </span>
                          )}
                          {alert.peer_avg_efficiency != null && (
                            <span className="text-xs text-neutral-500">peer avg {alert.peer_avg_efficiency}</span>
                          )}
                          {alert.efficiency_trend && alert.efficiency_trend !== 'stable' && (
                            <span className={`text-xs font-medium ${alert.efficiency_trend === 'improving' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              <FontAwesomeIcon icon={TREND_ICON[alert.efficiency_trend]} className="mr-1" />
                              {alert.efficiency_trend}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.avg_prep_time != null && <span>{alert.avg_prep_time} min/item</span>}
                          {alert.peer_avg_prep_time != null && <span className="text-neutral-400">peer {alert.peer_avg_prep_time} min</span>}
                          {alert.idle_time_pct != null && <span className={alert.idle_time_pct >= 40 ? 'text-sky-600' : ''}>{alert.idle_time_pct}% idle</span>}
                          {alert.error_rate_pct != null && <span className={alert.error_rate_pct >= 8 ? 'text-rose-600 font-medium' : ''}>{alert.error_rate_pct}% errors</span>}
                          {alert.throughput_per_hour != null && <span>{alert.throughput_per_hour}/hr</span>}
                          {alert.staff_count != null && alert.optimal_staff_count != null && (
                            <span className={alert.staff_count !== alert.optimal_staff_count ? 'text-amber-600 font-medium' : ''}>
                              staff {alert.staff_count}/{alert.optimal_staff_count}
                            </span>
                          )}
                          {alert.items_today != null && <span className="text-neutral-400">{alert.items_today} items today</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">opportunity/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Acted
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Improving
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => alert.id && handleStatus(alert.id, 'rejected')}>
                      Skip
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Slow threshold: +{config.slowThreshold}%</span>
          <span>Error threshold: {config.errorThreshold}%</span>
          <span>Idle threshold: {config.idleThreshold}%</span>
          <span>Decline drop: {config.declineDrop}%</span>
        </div>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center gap-3">
      <FontAwesomeIcon icon={icon} className={`text-2xl ${color}`} />
      <div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export default KitchenStationEfficiencyScreen;
