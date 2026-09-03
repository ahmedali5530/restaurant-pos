/**
 * AI Real-Time Table Turnover Predictor — predicts when occupied tables will
 * free up, tracks course stages, optimizes clearing + waitlist quoting.
 *
 * 88th POSR-exclusive differentiator — restaurants lose $300-1,000/mo per
 * location from poor table turnover prediction.
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
  faStopwatch, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faChair, faUtensils, faBroom,
  faListCheck, faUsers, faCreditCard, faIceCream, faGaugeHigh,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runTurnoverEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readTurnoverConfig, DEFAULT_TURNOVER_CONFIG,
  type TurnoverAlert,
} from "@/lib/table-turnover-predictor.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  long_sitting_anomaly:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faStopwatch,      label: 'LONG SITTING' },
  rush_stage_late:        { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faUtensils,       label: 'KITCHEN DELAY' },
  clear_opportunity:      { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faBroom,          label: 'CLEAR NOW' },
  waitlist_adjustment:    { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faListCheck,      label: 'WAITLIST' },
  party_size_mismatch:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUsers,          label: 'SIZE MISMATCH' },
  payment_delay:          { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCreditCard,     label: 'PAYMENT DELAY' },
  dessert_upsell_window:  { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faIceCream,       label: 'DESSERT UPSELL' },
  peak_urgency:           { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faGaugeHigh,      label: 'PEAK URGENT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const STAGE_COLOR: Record<string, string> = {
  seated: 'text-neutral-500',
  ordering: 'text-sky-600',
  appetizer: 'text-amber-600',
  main: 'text-orange-600',
  dessert: 'text-violet-600',
  coffee: 'text-blue-600',
  payment: 'text-emerald-600',
  leaving: 'text-rose-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function TableTurnoverPredictorScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<TurnoverAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalRevenueAtRisk: 0, totalRevenueOpportunity: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TURNOVER_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTurnoverConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[turnover-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTurnoverEngine(db, config);
      toast.success(`Generated ${result.generated} turnover alerts`);
      await reload();
    } catch (err) {
      console.error('[turnover-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[turnover-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_revenue_at_risk + b.est_revenue_opportunity) - (a.est_revenue_at_risk + a.est_revenue_opportunity);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Table Turnover Predictor", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faStopwatch} className="text-amber-600" />
              AI Real-Time Table Turnover Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts when occupied tables free up — optimizes clearing, waitlist quoting, upsell windows
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Scanning…' : 'Run turnover scan'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical (peak urgent)"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faStopwatch}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-amber-600"
          />
          <SummaryCard
            icon={faTriangleExclamation}
            label="Revenue at risk"
            value={fmt$(summary.totalRevenueAtRisk)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faLightbulb}
            label="Revenue opportunity"
            value={fmt$(summary.totalRevenueOpportunity)}
            color="text-emerald-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faStopwatch} spin className="text-4xl mb-3" />
            <p>Loading turnover alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No turnover alerts</p>
            <p className="text-sm mt-1">Run turnover scan to check all occupied tables.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faStopwatch, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">Table {alert.table_number}</span>
                          {alert.party_size != null && (
                            <span className="text-xs text-neutral-500">
                              <FontAwesomeIcon icon={faUsers} className="mr-1" />
                              {alert.party_size}-top
                            </span>
                          )}
                          {alert.current_stage && (
                            <span className={`text-xs font-medium ${STAGE_COLOR[alert.current_stage] ?? 'text-neutral-500'}`}>
                              {alert.current_stage}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.minutes_seated != null && (
                            <span>Seated: <span className="font-medium text-neutral-700">{alert.minutes_seated} min</span></span>
                          )}
                          {alert.avg_turnover_min != null && (
                            <span>Avg: {alert.avg_turnover_min} min</span>
                          )}
                          {alert.minutes_until_free != null && alert.minutes_until_free > 0 && (
                            <span className="font-medium text-emerald-600">
                              Free in ~{alert.minutes_until_free} min
                            </span>
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
                      {alert.est_revenue_at_risk > 0 && (
                        <>
                          <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_revenue_at_risk)}</div>
                          <div className="text-xs text-neutral-400">at risk</div>
                        </>
                      )}
                      {alert.est_revenue_opportunity > 0 && (
                        <>
                          <div className="text-sm font-bold text-emerald-600 mt-1">{fmt$(alert.est_revenue_opportunity)}</div>
                          <div className="text-xs text-neutral-400">opportunity</div>
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
          <span>Avg 2-top: {config.avg2topMin} min</span>
          <span>Avg 4-top: {config.avg4topMin} min</span>
          <span>Avg 6-top: {config.avg6topMin} min</span>
          <span>Anomaly: {config.anomalyPct}% of avg</span>
          <span>Peak threshold: {config.peakHourThreshold}% occupancy</span>
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

export default TableTurnoverPredictorScreen;
