/**
 * AI Scent Marketing Optimizer — predicts optimal ambient scent per zone +
 * time-of-day to maximize customer mood, dwell, and spend.
 *
 * 152nd POSR-exclusive differentiator.
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
  faSprayCanSparkles, faRotate, faUtensils, faClock, faGaugeHigh,
  faGaugeLow, faLayerGroup, faAllergies, faCalendarAlt, faChartLine,
  faCheckCircle, faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runScentEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readScentConfig, DEFAULT_SCENT_CONFIG,
  type ScentAlert,
} from "@/lib/scent-marketing-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  cuisine_scent_mismatch:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUtensils,           label: 'CUISINE MISMATCH' },
  time_of_day_rotation_needed:    { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faClock,              label: 'TIME ROTATION' },
  intensity_too_strong:           { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faGaugeHigh,          label: 'TOO STRONG' },
  intensity_too_weak:             { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faGaugeLow,           label: 'TOO WEAK' },
  zone_scent_conflict:            { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faLayerGroup,         label: 'ZONE CONFLICT' },
  allergy_sensitive_alternative:  { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faAllergies,          label: 'ALLERGEN' },
  seasonal_scent_shift:           { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCalendarAlt,        label: 'SEASONAL' },
  scent_dwell_correlation:        { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faChartLine,          label: 'POSITIVE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function ScentMarketingOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ScentAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgNoticeRate: 0, avgNegativeRate: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SCENT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readScentConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[scent-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runScentEngine(db, config);
      toast.success(`Analyzed ${result.generated} scent signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[scent-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[scent-report] status failed', err);
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
      <DocumentTitle parts={["AI Scent Marketing", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faSprayCanSparkles} className="text-fuchsia-500" />
              AI Scent Marketing Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts optimal ambient scent per zone + time-of-day — scent increases dwell 15-40% + spend 11-21%
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faSprayCanSparkles} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze scent'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faLayerGroup} label="Zones at risk" value={String(summary.zonesAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faChartLine} label="Avg notice rate" value={`${summary.avgNoticeRate.toFixed(0)}%`} color={summary.avgNoticeRate >= 15 ? 'text-emerald-600' : 'text-amber-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Avg negative rate" value={`${summary.avgNegativeRate.toFixed(0)}%`} color={summary.avgNegativeRate >= 5 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faSprayCanSparkles} spin className="text-4xl mb-3" />
            <p>Analyzing scent marketing opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No scent alerts</p>
            <p className="text-sm mt-1">Scent marketing optimized across all zones.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faSprayCanSparkles, label: alert.rule_id.toUpperCase() };
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
                          {alert.zone && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.zone}</span>
                          )}
                          {alert.current_scent && (
                            <span className="text-xs">
                              <span className="text-rose-600">{alert.current_scent}</span>
                              {alert.recommended_scent && (
                                <>
                                  <span className="text-neutral-400 mx-1">→</span>
                                  <span className="text-emerald-600 font-medium">{alert.recommended_scent}</span>
                                </>
                              )}
                            </span>
                          )}
                          {alert.cuisine_type && (
                            <span className="text-xs text-amber-600 uppercase">{alert.cuisine_type}</span>
                          )}
                          {alert.time_of_day && alert.time_of_day !== 'all' && (
                            <span className="text-xs text-violet-600">@ {alert.time_of_day}</span>
                          )}
                          {alert.current_season && (
                            <span className="text-xs text-emerald-600 uppercase">{alert.current_season}</span>
                          )}
                          {alert.current_intensity_pct != null && alert.current_intensity_pct > 0 && (
                            <span className={`text-xs ${alert.current_intensity_pct >= 60 ? 'text-rose-600 font-medium' : alert.current_intensity_pct < 20 ? 'text-sky-600 font-medium' : 'text-neutral-500'}`}>{alert.current_intensity_pct}% intensity</span>
                          )}
                          {alert.customer_notice_rate_pct != null && alert.customer_notice_rate_pct > 0 && (
                            <span className="text-xs text-neutral-500">{alert.customer_notice_rate_pct}% notice</span>
                          )}
                          {alert.negative_reaction_rate_pct != null && alert.negative_reaction_rate_pct > 0 && (
                            <span className={`text-xs ${alert.negative_reaction_rate_pct >= 5 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.negative_reaction_rate_pct}% negative</span>
                          )}
                          {alert.has_common_allergens && (
                            <span className="text-xs text-yellow-700 font-medium">allergen</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_dwell_change_min != null && alert.predicted_dwell_change_min > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_dwell_change_min}min dwell</span>
                          )}
                          {alert.predicted_spend_change_pct != null && alert.predicted_spend_change_pct > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_spend_change_pct}% spend</span>
                          )}
                          {alert.target_intensity_pct != null && (
                            <span>target: <span className="text-emerald-600 font-medium">{alert.target_intensity_pct}%</span></span>
                          )}
                          {alert.hypoallergenic_alternative && (
                            <span className="text-emerald-600">hypoallergenic: {alert.hypoallergenic_alternative}</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-fuchsia-50 border border-fuchsia-200 rounded px-3 py-2 text-xs text-fuchsia-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo at risk</div>
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
          <span>Min notice: {config.minNoticeRatePct}%</span>
          <span>Max negative: {config.maxNegativeReactionPct}%</span>
          <span>Default intensity: {config.defaultIntensityPct}%</span>
          <span className="text-neutral-400">152nd POSR-exclusive differentiator</span>
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

export default ScentMarketingOptimizerScreen;
