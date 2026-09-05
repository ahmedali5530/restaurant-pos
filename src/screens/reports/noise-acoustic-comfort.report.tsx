/**
 * AI Noise Source & Acoustic Comfort Optimizer — deep-dive into restaurant
 * noise sources, zone mapping, and acoustic treatment ROI.
 *
 * 149th POSR-exclusive differentiator.
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
  faVolumeHigh, faRotate, faWind, faUtensils, faBlender,
  faMapLocationDot, faUsers, faWaveSquare, faEarDeaf,
  faCheckCircle, faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runNoiseEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readNoiseConfig, DEFAULT_NOISE_CONFIG,
  type NoiseAlert,
} from "@/lib/noise-acoustic-comfort.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  conversation_overlap_critical:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faVolumeHigh,        label: 'CONVERSATION' },
  hvac_noise_excessive:             { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faWind,              label: 'HVAC' },
  kitchen_noise_bleed:              { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faUtensils,          label: 'KITCHEN BLEED' },
  bar_blender_peak_noise:           { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faBlender,           label: 'BLENDER' },
  zone_noise_hotspot:               { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faMapLocationDot,    label: 'HOTSPOT' },
  segment_noise_sensitivity:        { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faUsers,             label: 'SEGMENT' },
  acoustic_treatment_roi:           { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faWaveSquare,        label: 'TREATMENT ROI' },
  hearing_accessibility_gap:        { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faEarDeaf,           label: 'HEARING ACCESS' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function NoiseAcousticComfortScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<NoiseAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgNoiseDb: 0, totalHearingImpairedVisits: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_NOISE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readNoiseConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[noise-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runNoiseEngine(db, config);
      toast.success(`Analyzed ${result.generated} noise signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[noise-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[noise-report] status failed', err);
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
      <DocumentTitle parts={["AI Noise Acoustic Comfort", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faVolumeHigh} className="text-rose-500" />
              AI Noise Source & Acoustic Comfort Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Identifies noise sources (HVAC, kitchen, bar, conversation overlap), maps zones, predicts treatment ROI
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faVolumeHigh} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze noise'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faMapLocationDot} label="Zones at risk" value={String(summary.zonesAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faVolumeHigh} label="Avg noise" value={`${summary.avgNoiseDb.toFixed(0)} dB`} color={summary.avgNoiseDb >= 75 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faEarDeaf} label="Hearing-impaired visits" value={String(summary.totalHearingImpairedVisits)} color="text-yellow-600" />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faVolumeHigh} spin className="text-4xl mb-3" />
            <p>Analyzing noise sources + acoustic comfort impact…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No noise alerts</p>
            <p className="text-sm mt-1">Acoustic comfort healthy across all zones.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faVolumeHigh, label: alert.rule_id.toUpperCase() };
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
                          {alert.customer_segment && alert.customer_segment !== 'all' && (
                            <span className="text-xs font-medium text-fuchsia-600 uppercase">{alert.customer_segment}</span>
                          )}
                          {alert.avg_noise_db != null && (
                            <span className={`text-xs font-bold ${alert.avg_noise_db >= 80 ? 'text-rose-600' : alert.avg_noise_db >= 72 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {alert.avg_noise_db.toFixed(0)} dB avg
                            </span>
                          )}
                          {alert.peak_noise_db != null && (
                            <span className="text-xs text-neutral-500">peak {alert.peak_noise_db} dB</span>
                          )}
                          {alert.hvac_background_db != null && alert.hvac_background_db > 0 && (
                            <span className={`text-xs ${alert.hvac_background_db >= 55 ? 'text-sky-600 font-medium' : 'text-neutral-500'}`}>HVAC {alert.hvac_background_db} dB</span>
                          )}
                          {alert.kitchen_bleed_db != null && alert.kitchen_bleed_db > 0 && (
                            <span className={`text-xs ${alert.kitchen_bleed_db >= 60 ? 'text-orange-600 font-medium' : 'text-neutral-500'}`}>kitchen {alert.kitchen_bleed_db} dB</span>
                          )}
                          {alert.bar_blender_peak_db != null && alert.bar_blender_peak_db > 0 && (
                            <span className={`text-xs ${alert.bar_blender_peak_db >= 85 ? 'text-violet-600 font-medium' : 'text-neutral-500'}`}>blender {alert.bar_blender_peak_db} dB</span>
                          )}
                          {alert.treatment_roi_months != null && (
                            <span className="text-xs text-emerald-600 font-medium">ROI {alert.treatment_roi_months}mo</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_dwell_drop_min != null && alert.predicted_dwell_drop_min > 0 && (
                            <span className="text-rose-600">−{alert.predicted_dwell_drop_min}min dwell</span>
                          )}
                          {alert.predicted_spend_drop_pct != null && alert.predicted_spend_drop_pct > 0 && (
                            <span className="text-rose-600">−{alert.predicted_spend_drop_pct}% spend</span>
                          )}
                          {alert.predicted_satisfaction_drop != null && alert.predicted_satisfaction_drop > 0 && (
                            <span className="text-rose-600">−{alert.predicted_satisfaction_drop}pts sat</span>
                          )}
                          {alert.treatment_cost != null && alert.treatment_cost > 0 && (
                            <span>treatment: <span className="text-neutral-700 font-medium">{fmt$(alert.treatment_cost)}</span></span>
                          )}
                          {alert.predicted_db_reduction != null && alert.predicted_db_reduction > 0 && (
                            <span className="text-emerald-600">−{alert.predicted_db_reduction} dB predicted</span>
                          )}
                          {alert.predicted_revenue_recovery != null && alert.predicted_revenue_recovery > 0 && (
                            <span className="text-emerald-600 font-medium">+{fmt$(alert.predicted_revenue_recovery)}/mo recovery</span>
                          )}
                          {alert.hearing_impaired_visits_monthly != null && alert.hearing_impaired_visits_monthly > 0 && (
                            <span className="text-yellow-700">{alert.hearing_impaired_visits_monthly} hearing-impaired visits/mo</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-xs text-rose-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_monthly_opportunity)}</div>
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
          <span>Conversation threshold: {config.conversationThresholdDb} dB</span>
          <span>HVAC: ≥{config.hvacBackgroundThresholdDb} dB</span>
          <span>Kitchen bleed: ≥{config.kitchenBleedThresholdDb} dB</span>
          <span>Blender peak: ≥{config.blenderPeakThresholdDb} dB</span>
          <span>Segment sensitivity: ≥{config.segmentSensitivityThresholdDb} dB</span>
          <span className="text-neutral-400">149th POSR-exclusive differentiator</span>
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

export default NoiseAcousticComfortScreen;
