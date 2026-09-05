/**
 * AI First-Visit Conversion Predictor — predicts whether a first-time customer
 * will return within 30/60/90 days based on first-visit signals.
 *
 * 143rd POSR-exclusive differentiator.
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
  faUserPlus, faRotate, faArrowUp, faArrowDown, faClock,
  faHandshake, faUtensils, faCreditCard, faAddressCard,
  faMountain, faCheckCircle, faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runFirstConvEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readFirstConvConfig, DEFAULT_FIRSTCONV_CONFIG,
  type FirstConvAlert,
} from "@/lib/first-visit-conversion.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  high_conversion_probability:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowUp,        label: 'HIGH CONV' },
  at_risk_first_visit:                { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowDown,      label: 'AT RISK' },
  long_greeting_wait:                 { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,          label: 'GREETING WAIT' },
  server_rapport_signal:              { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faHandshake,      label: 'SERVER RAPPORT' },
  food_delight_signal:                { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faUtensils,       label: 'FOOD DELIGHT' },
  payment_friction_first_visit:       { bg: 'bg-red-50',     text: 'text-red-700',     icon: faCreditCard,     label: 'PAYMENT FRICTION' },
  milestone_capture_missed:           { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faAddressCard,    label: 'CAPTURE MISSED' },
  peak_end_signal:                    { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faMountain,       label: 'PEAK-END' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function FirstVisitConversionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<FirstConvAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, highConvCount: 0, atRiskCount: 0, avgConversionPct: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_FIRSTCONV_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readFirstConvConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[firstconv-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runFirstConvEngine(db, config);
      toast.success(`Analyzed ${result.generated} first-visit signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[firstconv-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[firstconv-report] status failed', err);
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
      <DocumentTitle parts={["AI First-Visit Conversion", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUserPlus} className="text-emerald-500" />
              AI First-Visit Conversion Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts whether first-time customers will return — enables real-time intervention during the visit
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faUserPlus} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze first visits'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faArrowUp} label="High-conv prospects" value={String(summary.highConvCount)} color="text-emerald-600" />
          <SummaryCard icon={faArrowDown} label="At-risk first visits" value={String(summary.atRiskCount)} color="text-rose-600" />
          <SummaryCard icon={faCheckCircle} label="Avg conversion %" value={`${summary.avgConversionPct.toFixed(0)}%`} color={summary.avgConversionPct >= 50 ? 'text-emerald-600' : 'text-amber-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUserPlus} spin className="text-4xl mb-3" />
            <p>Analyzing first-visit conversion signals…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No first-visit alerts</p>
            <p className="text-sm mt-1">All first-time visitors converting well.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faUserPlus, label: alert.rule_id.toUpperCase() };
              const isPositive = alert.rule_id === 'high_conversion_probability' || alert.rule_id === 'server_rapport_signal' || alert.rule_id === 'food_delight_signal';
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
                          {alert.customer_name && (
                            <span className="text-sm font-semibold text-neutral-800">{alert.customer_name}</span>
                          )}
                          {alert.visit_time && (
                            <span className="text-xs text-neutral-500">@ {alert.visit_time}</span>
                          )}
                          {alert.party_size != null && (
                            <span className="text-xs text-neutral-500">party of {alert.party_size}</span>
                          )}
                          {alert.conversion_probability_pct != null && (
                            <span className={`text-xs font-bold ${alert.conversion_probability_pct >= 75 ? 'text-emerald-600' : alert.conversion_probability_pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {alert.conversion_probability_pct.toFixed(0)}% conv
                            </span>
                          )}
                          {alert.conversion_horizon_days != null && alert.conversion_horizon_days > 0 && (
                            <span className="text-xs text-neutral-500">~{alert.conversion_horizon_days}d to return</span>
                          )}
                          {alert.contact_captured != null && (
                            <span className={`text-xs ${alert.contact_captured ? 'text-emerald-600' : 'text-rose-600 font-medium'}`}>
                              {alert.contact_captured ? `✓ ${alert.contact_method}` : '✗ no contact'}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.greeting_wait_minutes != null && (
                            <span>greeting: <span className={alert.greeting_wait_minutes >= 3 ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.greeting_wait_minutes}min</span></span>
                          )}
                          {alert.server_rapport_score != null && (
                            <span>rapport: <span className={alert.server_rapport_score >= 75 ? 'text-emerald-600 font-medium' : alert.server_rapport_score < 50 ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.server_rapport_score}/100</span></span>
                          )}
                          {alert.food_satisfaction_signal != null && (
                            <span>food: <span className={alert.food_satisfaction_signal >= 85 ? 'text-emerald-600 font-medium' : alert.food_satisfaction_signal < 60 ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.food_satisfaction_signal}/100</span></span>
                          )}
                          {alert.payment_duration_minutes != null && (
                            <span>pay: <span className={alert.payment_duration_minutes >= 5 ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.payment_duration_minutes}min</span></span>
                          )}
                          {alert.peak_experience_score != null && (
                            <span>peak: <span className="text-neutral-700">{alert.peak_experience_score}/100</span></span>
                          )}
                          {alert.departure_experience_score != null && (
                            <span>end: <span className="text-neutral-700">{alert.departure_experience_score}/100</span></span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className={`mt-2 border rounded px-3 py-2 text-xs flex items-start gap-2 ${isPositive ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.predicted_clv_if_convert != null && alert.predicted_clv_if_convert > 0 && (
                      <div className="text-right shrink-0">
                        <div className={`text-lg font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmt$(alert.predicted_clv_if_convert)}
                        </div>
                        <div className="text-xs text-neutral-400">potential CLV</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Action taken
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

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>High conv threshold: ≥{config.highConversionThreshold}%</span>
          <span>At-risk threshold: &lt;{config.atRiskThreshold}%</span>
          <span>Greeting wait: ≥{config.greetingWaitThreshold}min</span>
          <span>Payment friction: ≥{config.paymentFrictionThreshold}min</span>
          <span className="text-neutral-400">143rd POSR-exclusive differentiator</span>
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

export default FirstVisitConversionScreen;
