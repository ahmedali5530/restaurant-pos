/**
 * AI Multi-Location Performance Benchmarking — scores each location, identifies
 * top/underperformers, transfers best practices.
 *
 * 97th POSR-exclusive differentiator — multi-location restaurants lose
 * $2,000-10,000/mo per underperforming location.
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
  faBuilding, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faArrowTrendDown, faDollarSign, faUsers,
  faStar, faUtensils, faLightbulb as faPractice, faArrowTrendUp, faHandshake,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runBenchEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readBenchConfig, DEFAULT_BENCH_CONFIG,
  type BenchAlert,
} from "@/lib/multi-location-benchmark.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  revenue_gap:               { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowTrendDown,  label: 'REVENUE GAP' },
  cost_overrun:              { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faDollarSign,      label: 'COST OVERRUN' },
  staff_efficiency_gap:      { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faUsers,           label: 'EFFICIENCY GAP' },
  satisfaction_gap:          { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faStar,            label: 'SATISFACTION GAP' },
  quality_gap:               { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUtensils,        label: 'QUALITY GAP' },
  best_practice_opportunity: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faPractice,        label: 'BEST PRACTICE' },
  underperformer_drag:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTriangleExclamation, label: 'UNDERPERFORMER' },
  cross_training_needed:     { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faHandshake,       label: 'CROSS-TRAIN' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

const scoreColor = (score: number): string => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  if (score >= 50) return 'text-orange-600';
  return 'text-rose-600';
};

export function MultiLocationBenchmarkScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<BenchAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalUplift: 0, totalSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_BENCH_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readBenchConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[bench-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runBenchEngine(db, config);
      toast.success(`Generated ${result.generated} benchmark alerts`);
      await reload();
    } catch (err) {
      console.error('[bench-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[bench-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_revenue_uplift + b.est_cost_savings) - (a.est_revenue_uplift + a.est_cost_savings);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Multi-Location Benchmark", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBuilding} className="text-sky-600" />
              AI Multi-Location Performance Benchmarking
            </h1>
            <p className="text-sm text-neutral-500">
              Scores each location — identifies top/underperformers, transfers best practices
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Benchmarking…' : 'Run benchmark'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Critical (underperformers)" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faBuilding} label="Open alerts" value={String(summary.totalAlerts)} color="text-sky-600" />
          <SummaryCard icon={faArrowTrendUp} label="Revenue uplift potential" value={fmt$(summary.totalUplift)} color="text-emerald-600" />
          <SummaryCard icon={faDollarSign} label="Cost savings potential" value={fmt$(summary.totalSavings)} color="text-emerald-600" />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBuilding} spin className="text-4xl mb-3" />
            <p>Loading benchmark alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No benchmark alerts</p>
            <p className="text-sm mt-1">Run benchmark to compare locations.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faBuilding, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.location_name}</span>
                          {alert.performance_score != null && (
                            <span className={`text-xs font-medium ${scoreColor(alert.performance_score)}`}>
                              Score: {alert.performance_score}/100
                            </span>
                          )}
                          {alert.benchmark_location && (
                            <span className="text-xs text-neutral-400">vs {alert.benchmark_location}</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.revenue_monthly != null && <span>Revenue: <span className="font-medium text-neutral-700">{fmt$(alert.revenue_monthly)}/mo</span></span>}
                          {alert.cost_pct != null && <span>Cost: {alert.cost_pct}%</span>}
                          {alert.covers_per_hour != null && <span>Covers/hr: {alert.covers_per_hour}</span>}
                          {alert.satisfaction_score != null && <span>Satisfaction: {alert.satisfaction_score}/5</span>}
                          {alert.food_cost_pct != null && <span>Food cost: {alert.food_cost_pct}%</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {alert.est_revenue_uplift > 0 && (
                        <>
                          <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_revenue_uplift)}</div>
                          <div className="text-xs text-neutral-400">uplift/mo</div>
                        </>
                      )}
                      {alert.est_cost_savings > 0 && (
                        <>
                          <div className="text-sm font-bold text-emerald-600 mt-1">{fmt$(alert.est_cost_savings)}</div>
                          <div className="text-xs text-neutral-400">savings/mo</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Resolved
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> In progress
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

        {/* Config footer */}
        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Min locations: {config.minLocations}</span>
          <span>Underperformer threshold: &lt;{config.performanceThreshold}/100</span>
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

export default MultiLocationBenchmarkScreen;
