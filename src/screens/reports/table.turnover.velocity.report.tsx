/**
 * AI Table Turnover Velocity Optimizer — decomposes table turnover into phases
 * (seat→order→eat→pay→clear), identifies bottleneck phase, recommends interventions.
 *
 * 119th POSR-exclusive differentiator — restaurants lose $400-1,500/mo per
 * location from slow table turnover caused by unidentified phase bottlenecks.
 * No POS decomposes turnover into phases.
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
  faTriangleExclamation, faCreditCard, faBookOpen, faBroom,
  faUtensils, faChair, faArrowTrendDown, faBolt, faClock,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runTurnoverVelEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readTurnoverVelConfig, DEFAULT_TURNOVERVEL_CONFIG,
  type TurnoverVelAlert,
} from "@/lib/table-turnover-velocity.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  bottleneck_phase:          { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGaugeHigh,        label: 'BOTTLENECK' },
  payment_phase_slow:        { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faCreditCard,       label: 'PAYMENT SLOW' },
  ordering_phase_slow:       { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBookOpen,         label: 'ORDERING SLOW' },
  clearing_phase_slow:       { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faBroom,            label: 'CLEARING SLOW' },
  eating_phase_slow:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUtensils,         label: 'EATING SLOW' },
  seating_phase_slow:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faChair,            label: 'SEATING SLOW' },
  phase_velocity_decline:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown,   label: 'VELOCITY DECLINE' },
  peak_hour_phase_blockage:  { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faBolt,             label: 'PEAK BLOCKAGE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const PHASE_COLOR: Record<string, string> = {
  seating: 'text-amber-600',
  ordering: 'text-amber-600',
  eating: 'text-amber-600',
  payment: 'text-rose-600',
  clearing: 'text-sky-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function TableTurnoverVelocityScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<TurnoverVelAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, topBottleneckPhase: '—', avgOverhead: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TURNOVERVEL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTurnoverVelConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[turnovervel-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTurnoverVelEngine(db, config);
      toast.success(`Analyzed ${result.generated} turnover phases — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[turnovervel-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[turnovervel-report] status failed', err);
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
      <DocumentTitle parts={["AI Table Turnover Velocity", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faGaugeHigh} className="text-amber-600" />
              AI Table Turnover Velocity Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Decomposes turnover into phases (seat→order→eat→pay→clear) — finds the bottleneck
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze phases'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faGaugeHigh} label="Top bottleneck" value={summary.topBottleneckPhase} color="text-rose-600" />
          <SummaryCard icon={faClock} label="Avg overhead" value={`${summary.avgOverhead.toFixed(0)} min`} color="text-amber-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faGaugeHigh} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faGaugeHigh} spin className="text-4xl mb-3" />
            <p>Analyzing turnover phases…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No turnover velocity alerts</p>
            <p className="text-sm mt-1">All phases at optimal duration — no bottlenecks.</p>
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
                          <span className="font-semibold text-neutral-800">{alert.table_id}</span>
                          {alert.bottleneck_phase && (
                            <span className={`text-xs font-medium uppercase ${PHASE_COLOR[alert.bottleneck_phase] ?? 'text-neutral-500'}`}>
                              {alert.bottleneck_phase}
                            </span>
                          )}
                          {alert.phase_duration_minutes != null && alert.optimal_phase_minutes != null && (
                            <span className="text-xs">
                              <span className="text-rose-600 font-medium">{alert.phase_duration_minutes} min</span>
                              <span className="mx-1 text-neutral-400">/ {alert.optimal_phase_minutes} optimal</span>
                            </span>
                          )}
                          {alert.phase_overhead_minutes != null && (
                            <span className="text-xs font-bold text-rose-600">+{alert.phase_overhead_minutes} min overhead</span>
                          )}
                          {alert.is_peak_hour && (
                            <span className="text-xs font-medium text-rose-600">PEAK</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.total_turnover_minutes != null && <span>total: {alert.total_turnover_minutes} min</span>}
                          {alert.party_size != null && <span>party of {alert.party_size}</span>}
                          {alert.time_of_day && <span>{alert.time_of_day}</span>}
                          {alert.day_of_week && <span>{alert.day_of_week}</span>}
                          {alert.est_revenue_recovered != null && alert.est_revenue_recovered > 0 && (
                            <span className="text-emerald-600 font-medium">recover {fmt$(alert.est_revenue_recovered)}/table</span>
                          )}
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Fixed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Optimizing
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
          <span>Overhead threshold: {config.overheadThreshold} min</span>
          <span>Peak multiplier: {config.peakMultiplier}x</span>
          <span>Optimal: seat {config.optimalSeating}m · order {config.optimalOrdering}m · eat {config.optimalEating}m · pay {config.optimalPayment}m · clear {config.optimalClearing}m</span>
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

export default TableTurnoverVelocityScreen;
