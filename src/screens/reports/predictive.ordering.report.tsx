/**
 * AI Predictive Ordering for Regular Customers — predicts what regulars
 * will order, triggers pre-prep, generates "the usual?" prompt.
 *
 * 95th POSR-exclusive differentiator — 60-70% of revenue from repeat
 * customers. Regulars order same thing 65-80% of time. Predicting saves
 * 3-5 min, increases throughput 20-30%.
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
  faWandMagicSparkles, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faUtensils, faClock, faFire,
  faShuffle, faArrowTrendUp, faSeedling, faUserMinus, faArrowsRotate,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPredictEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readPredictConfig, DEFAULT_PREDICT_CONFIG,
  type PredictAlert,
} from "@/lib/predictive-ordering.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  usual_order_prediction:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faUtensils,        label: 'USUAL ORDER' },
  visit_timing_prediction:    { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faClock,           label: 'ARRIVAL PRED' },
  pre_prep_trigger:           { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faFire,            label: 'PRE-PREP' },
  order_variance_high:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faShuffle,         label: 'HIGH VARIANCE' },
  loyalty_upsell_opportunity: { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faArrowTrendUp,    label: 'UPSELL OPP' },
  first_time_pattern:         { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: faSeedling,        label: 'NEW REGULAR' },
  abandonment_risk:           { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faUserMinus,       label: 'ABANDON RISK' },
  preference_drift:           { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faArrowsRotate,    label: 'PREF DRIFT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

const confidenceColor = (score: number): string => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  if (score >= 50) return 'text-orange-600';
  return 'text-rose-600';
};

const parseItems = (json?: string): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
};

export function PredictiveOrderingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<PredictAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, highConfidenceCount: 0, totalRevenueUplift: 0, totalTimeSavedMin: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PREDICT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPredictConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[predict-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPredictEngine(db, config);
      toast.success(`Generated ${result.generated} predictive order alerts`);
      await reload();
    } catch (err) {
      console.error('[predict-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[predict-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Predictive Ordering", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="text-violet-600" />
              AI Predictive Ordering for Regulars
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts what regulars will order — triggers pre-prep, generates "the usual?" prompt
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Predicting…' : 'Run predictions'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faWandMagicSparkles}
            label="High-confidence"
            value={String(summary.highConfidenceCount)}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faWandMagicSparkles}
            label="Open predictions"
            value={String(summary.totalAlerts)}
            color="text-violet-600"
          />
          <SummaryCard
            icon={faArrowTrendUp}
            label="Revenue uplift"
            value={fmt$(summary.totalRevenueUplift)}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faClock}
            label="Time saved /mo"
            value={`${summary.totalTimeSavedMin} min`}
            color="text-sky-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWandMagicSparkles} spin className="text-4xl mb-3" />
            <p>Loading predictive order alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No predictive order alerts</p>
            <p className="text-sm mt-1">Run predictions to analyze regular customers.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faWandMagicSparkles, label: alert.rule_id.toUpperCase() };
              const items = parseItems(alert.predicted_items);
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
                          <span className="font-semibold text-neutral-800">{alert.customer_name}</span>
                          {alert.confidence_score != null && (
                            <span className={`text-xs font-medium ${confidenceColor(alert.confidence_score)}`}>
                              {alert.confidence_score}% confidence
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          {alert.predicted_arrival && (
                            <span className="text-xs text-sky-600">
                              <FontAwesomeIcon icon={faClock} className="mr-1" />
                              {alert.predicted_arrival}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {items.length > 0 && (
                            <div className="flex items-center gap-1">
                              <FontAwesomeIcon icon={faUtensils} />
                              {items.map((item, i) => (
                                <span key={i} className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{item}</span>
                              ))}
                            </div>
                          )}
                          {alert.total_visits != null && <span>Visits: {alert.total_visits}/90d</span>}
                          {alert.order_consistency_pct != null && <span>Consistency: {alert.order_consistency_pct}%</span>}
                          {alert.avg_order_value != null && <span>Avg: {fmt$(alert.avg_order_value)}</span>}
                          {alert.est_time_saved_min != null && alert.est_time_saved_min > 0 && (
                            <span className="text-sky-600 font-medium">Saves: {alert.est_time_saved_min} min</span>
                          )}
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
                          <div className="text-xs text-neutral-400">uplift/visit</div>
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
          <span>Min visits: {config.minVisits}/90d</span>
          <span>Confidence threshold: {config.confidenceThreshold}%</span>
          <span>Consistency threshold: {config.consistencyThreshold}%</span>
          <span>Lookback: {config.lookbackDays}d</span>
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

export default PredictiveOrderingScreen;
