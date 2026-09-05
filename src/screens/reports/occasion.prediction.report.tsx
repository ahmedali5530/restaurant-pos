/**
 * AI Customer Occasion Prediction Engine — predicts the occasion for each
 * customer's visit from order patterns, party size, and timing.
 *
 * 135th POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from not recognizing customer visit occasions.
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
  faCalendarDay, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faChampagneGlasses, faBriefcase, faHeart,
  faChildren, faArrowTrendUp, faArrowRightArrowLeft, faTags,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runOccasionEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readOccasionConfig, DEFAULT_OCCASION_CONFIG,
  type OccasionAlert,
} from "@/lib/occasion-prediction.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  occasion_predicted:           { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faCalendarDay,        label: 'OCCASION PREDICTED' },
  celebration_detected:         { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faChampagneGlasses,   label: 'CELEBRATION' },
  business_lunch_pattern:       { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faBriefcase,          label: 'BUSINESS LUNCH' },
  date_night_indicators:        { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faHeart,              label: 'DATE NIGHT' },
  family_dining_detected:       { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faChildren,           label: 'FAMILY' },
  occasion_spend_uplift:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,       label: 'SPEND UPLIFT' },
  occasion_shift:               { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowRightArrowLeft, label: 'OCCASION SHIFT' },
  occasion_upsell_opportunity:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTags,              label: 'UPSELL OPP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const OCCASION_COLOR: Record<string, string> = {
  business_lunch: 'text-sky-600',
  date_night: 'text-rose-600',
  family_dinner: 'text-amber-600',
  solo: 'text-neutral-600',
  celebration: 'text-violet-600',
  casual_catchup: 'text-emerald-600',
  business_dinner: 'text-sky-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function OccasionPredictionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<OccasionAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, highConfidencePredictions: 0, avgUpliftPct: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_OCCASION_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readOccasionConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[occasion-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runOccasionEngine(db, config);
      toast.success(`Predicted ${result.generated} occasions — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[occasion-report] analyze failed', err);
      toast.error('Prediction failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[occasion-report] status failed', err);
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
      <DocumentTitle parts={["AI Occasion Prediction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarDay} className="text-sky-600" />
              AI Customer Occasion Prediction Engine
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts visit occasion (business/date/family/celebration) from order patterns — enables occasion-appropriate service
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Predicting…' : 'Predict occasions'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faCalendarDay} label="High-confidence" value={String(summary.highConfidencePredictions)} color="text-sky-600" />
          <SummaryCard icon={faChampagneGlasses} label="Celebrations" value={String(summary.criticalCount)} color="text-violet-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faCalendarDay} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-sky-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCalendarDay} spin className="text-4xl mb-3" />
            <p>Predicting customer occasions…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No occasion alerts</p>
            <p className="text-sm mt-1">No active occasion predictions to display.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faCalendarDay, label: alert.rule_id.toUpperCase() };
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
                          {alert.predicted_occasion && (
                            <span className={`text-xs font-medium uppercase ${OCCASION_COLOR[alert.predicted_occasion] ?? 'text-neutral-500'}`}>
                              {alert.predicted_occasion.replace('_', ' ')}
                            </span>
                          )}
                          {alert.confidence_pct != null && (
                            <span className={`text-xs font-bold ${alert.confidence_pct >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {alert.confidence_pct}% conf
                            </span>
                          )}
                          {alert.party_size != null && <span className="text-xs text-neutral-500">party of {alert.party_size}</span>}
                          {alert.time_of_day && <span className="text-xs text-neutral-500">{alert.time_of_day}</span>}
                          {alert.day_of_week && <span className="text-xs text-neutral-500">{alert.day_of_week}</span>}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.recommended_service_style && (
                            <span className="text-sky-600 font-medium">→ {alert.recommended_service_style.replace('_', ' ')}</span>
                          )}
                          {alert.recommended_upsell && (
                            <span className="text-emerald-600 font-medium">upsell: {alert.recommended_upsell}</span>
                          )}
                          {alert.avg_occasion_spend != null && alert.avg_non_occasion_spend != null && (
                            <span>{fmt$(alert.avg_occasion_spend)} vs {fmt$(alert.avg_non_occasion_spend)}</span>
                          )}
                          {alert.occasion_signals && <span className="text-neutral-400">{alert.occasion_signals}</span>}
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Applied
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Serving
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
          <span>Confidence threshold: {config.confidenceThreshold}%</span>
          <span>Spend uplift threshold: {config.spendUpliftThreshold}%</span>
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

export default OccasionPredictionScreen;
