/**
 * AI Customer Order Frequency Predictor — predicts frequency trajectory
 * (increasing/stable/declining/dormant) and triggers proactive outreach.
 *
 * 121st POSR-exclusive differentiator — restaurants lose $400-1,500/mo per
 * location from declining customer order frequency going undetected.
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
  faWaveSquare, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faArrowTrendDown, faArrowTrendUp, faMinus,
  faBed, faHeart, faCalendarDays, faGaugeHigh, faBolt,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runOrderFreqEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readOrderFreqConfig, DEFAULT_ORDFREQ_CONFIG,
  type OrderFreqAlert,
} from "@/lib/order-frequency-predictor.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  frequency_declining:        { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowTrendDown, label: 'DECLINING' },
  frequency_increased:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,   label: 'INCREASED' },
  frequency_stable_high:      { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faHeart,          label: 'STABLE HIGH' },
  dormant_customer:           { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faBed,            label: 'DORMANT' },
  frequency_recovery_needed:  { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTriangleExclamation, label: 'RECOVERY NEEDED' },
  seasonal_frequency_shift:   { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: faCalendarDays,  label: 'SEASONAL SHIFT' },
  frequency_baseline_drop:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGaugeHigh,      label: 'BASELINE DROP' },
  frequency_momentum:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faBolt,           label: 'MOMENTUM' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const TREND_ICON: Record<string, any> = {
  increasing: faArrowTrendUp,
  declining: faArrowTrendDown,
  stable: faMinus,
  dormant: faBed,
};

const VALUE_COLOR: Record<string, string> = {
  high_value: 'text-emerald-600',
  medium_value: 'text-amber-600',
  low_value: 'text-neutral-500',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function OrderFrequencyPredictorScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<OrderFreqAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, decliningCount: 0, dormantCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ORDFREQ_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readOrderFreqConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[ordfreq-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runOrderFreqEngine(db, config);
      toast.success(`Predicted ${result.generated} frequency trajectories — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[ordfreq-report] analyze failed', err);
      toast.error('Prediction failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[ordfreq-report] status failed', err);
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
      <DocumentTitle parts={["AI Order Frequency Predictor", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWaveSquare} className="text-sky-600" />
              AI Customer Order Frequency Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts frequency trajectory (increasing/stable/declining) — proactive outreach before churn
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Predicting…' : 'Predict frequency'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faArrowTrendDown} label="Declining" value={String(summary.decliningCount)} color="text-rose-600" />
          <SummaryCard icon={faBed} label="Dormant" value={String(summary.dormantCount)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faWaveSquare} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-sky-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWaveSquare} spin className="text-4xl mb-3" />
            <p>Predicting order frequency trajectories…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No frequency alerts</p>
            <p className="text-sm mt-1">All customers at healthy frequency — no decline detected.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faWaveSquare, label: alert.rule_id.toUpperCase() };
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
                          {alert.customer_value && (
                            <span className={`text-xs font-medium uppercase ${VALUE_COLOR[alert.customer_value] ?? 'text-neutral-500'}`}>
                              {alert.customer_value.replace('_', ' ')}
                            </span>
                          )}
                          {alert.frequency_trend && (
                            <span className={`text-xs font-medium ${alert.frequency_trend === 'increasing' ? 'text-emerald-600' : alert.frequency_trend === 'declining' ? 'text-rose-600' : 'text-neutral-500'}`}>
                              <FontAwesomeIcon icon={TREND_ICON[alert.frequency_trend] ?? faMinus} className="mr-1" />
                              {alert.frequency_trend}
                            </span>
                          )}
                          {alert.frequency_change_pct != null && (
                            <span className={`text-xs font-bold ${alert.frequency_change_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {alert.frequency_change_pct >= 0 ? '+' : ''}{alert.frequency_change_pct}%
                            </span>
                          )}
                          {alert.predicted_churn_weeks != null && alert.predicted_churn_weeks < 12 && (
                            <span className="text-xs font-bold text-rose-600">churn in {alert.predicted_churn_weeks}wk</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.baseline_frequency != null && <span>baseline: {alert.baseline_frequency.toFixed(1)}/wk</span>}
                          {alert.current_frequency != null && <span>current: {alert.current_frequency.toFixed(1)}/wk</span>}
                          {alert.weeks_since_last_order != null && <span>last: {alert.weeks_since_last_order}wk ago</span>}
                          {alert.total_orders != null && <span>{alert.total_orders} total orders</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Reached out
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Engaging
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
          <span>Decline threshold: -{config.declineThreshold}%</span>
          <span>Dormant weeks: {config.dormantWeeks}</span>
          <span>Churn window: {config.churnWindow} weeks</span>
          <span>Seasonal filter: {config.seasonalFilter ? 'on' : 'off'}</span>
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

export default OrderFrequencyPredictorScreen;
