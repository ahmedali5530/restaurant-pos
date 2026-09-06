/**
 * AI Ceiling Design & Decor Feature Optimizer — predicts how ceiling DESIGN
 * elements (exposed beams, coffered ceilings, painted murals, pendant
 * lighting integration, ceiling fans, skylights, ceiling color, ceiling
 * texture) impact customer perception of spaciousness, restaurant quality,
 * brand positioning, and atmosphere.
 *
 * 174th POSR-exclusive differentiator.
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
  faUpLong, faRotate, faCompress, faVolumeHigh, faBorderStyle,
  faSun, faPalette, faLightbulb, faFan, faPaintbrush,
  faExpand, faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runCeilingDesignDecorEngine, getActiveCeilingDesignDecorAlerts, getCeilingDesignDecorSummary,
  updateCeilingDesignDecorAlertStatus, readCeilingDesignDecorConfig, DEFAULT_CEILING_DESIGN_DECOR_CONFIG,
  type CeilingDesignDecorAlert,
} from "@/lib/ceiling-design-decor.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  ceiling_design_flat_boring:          { bg: 'bg-neutral-100',   text: 'text-neutral-700',  icon: faCompress,         label: 'FLAT BORING' },
  exposed_ceiling_without_acoustic:    { bg: 'bg-rose-50',       text: 'text-rose-700',     icon: faVolumeHigh,       label: 'NO ACOUSTIC' },
  coffered_tray_ceiling_opportunity:   { bg: 'bg-amber-50',      text: 'text-amber-700',    icon: faBorderStyle,      label: 'NO COFFERED' },
  skylight_absent_daytime_venue:       { bg: 'bg-sky-50',        text: 'text-sky-700',      icon: faSun,              label: 'NO SKYLIGHT' },
  ceiling_color_wrong:                 { bg: 'bg-orange-50',     text: 'text-orange-700',   icon: faPalette,          label: 'WRONG COLOR' },
  pendant_lighting_not_integrated:     { bg: 'bg-violet-50',     text: 'text-violet-700',   icon: faLightbulb,        label: 'NOT INTEGRATED' },
  ceiling_fan_absent_hot_climate:      { bg: 'bg-red-50',        text: 'text-red-700',      icon: faFan,              label: 'NO FAN' },
  ceiling_mural_opportunity:           { bg: 'bg-emerald-50',    text: 'text-emerald-700',  icon: faPaintbrush,       label: 'NO MURAL' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function CeilingDesignDecorScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<CeilingDesignDecorAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, flatBoringCeilings: 0, exposedWithoutAcoustic: 0, muralOpportunities: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CEILING_DESIGN_DECOR_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCeilingDesignDecorConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveCeilingDesignDecorAlerts(db), getCeilingDesignDecorSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[ceiling-design-decor-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runCeilingDesignDecorEngine(db, config);
      toast.success(`Analyzed ${result.generated} ceiling design + decor signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[ceiling-design-decor-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateCeilingDesignDecorAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[ceiling-design-decor-report] status failed', err);
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
      <DocumentTitle parts={["AI Ceiling Design & Decor Feature Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUpLong} className="text-sky-600" />
              AI Ceiling Design &amp; Decor Feature Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how ceiling DESIGN features (exposed beams, coffered ceilings, painted murals, pendant lighting integration, ceiling fans, skylights, ceiling color, texture) impact spaciousness, quality, brand positioning, atmosphere — customers look up 15-20 times per visit (Cornell CHR); coffered ceilings +18-22% perceived quality; murals +25-35% Instagram photos; skylights +20-25% daytime satisfaction; ceiling fans -2-3C perceived temp; pendant integration +30% design intentionality; flat white ceilings perceived as unfinished
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faUpLong} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze ceiling'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faCompress} label="Flat boring ceilings" value={String(summary.flatBoringCeilings)} color={summary.flatBoringCeilings > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faVolumeHigh} label="Exposed w/o acoustic" value={String(summary.exposedWithoutAcoustic)} color={summary.exposedWithoutAcoustic > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faPaintbrush} label="Mural opportunities" value={String(summary.muralOpportunities)} color={summary.muralOpportunities > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faExpand} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUpLong} spin className="text-4xl mb-3" />
            <p>Analyzing ceiling design + decor feature opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No ceiling design/decor alerts</p>
            <p className="text-sm mt-1">Ceiling features present in upscale venues, exposed ceilings have acoustic treatment, coffered/tray in fine dining, skylights in daytime venues, ceiling color matches concept + height, pendant lighting integrated, ceiling fans in hot climate, painted murals for photo opportunities.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faUpLong, label: alert.rule_id.toUpperCase() };
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
                          {alert.location_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.location_id}</span>
                          )}
                          {alert.restaurant_tier && (
                            <span className="text-xs text-neutral-500">{alert.restaurant_tier}</span>
                          )}
                          {alert.climate_zone && (
                            <span className={`text-xs ${alert.climate_zone === 'cold' ? 'text-sky-600 font-medium' : alert.climate_zone === 'temperate' ? 'text-emerald-600 font-medium' : alert.climate_zone === 'warm' ? 'text-amber-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.climate_zone} climate</span>
                          )}
                          {alert.setting_type && (
                            <span className="text-xs text-neutral-500">{alert.setting_type}</span>
                          )}
                          {alert.concept_type && (
                            <span className="text-xs text-neutral-500">{alert.concept_type}</span>
                          )}
                          {alert.daytime_venue != null && alert.daytime_venue && (
                            <span className="text-xs text-amber-600 font-medium">daytime venue</span>
                          )}
                          {alert.ceiling_design_type && (
                            <span className={`text-xs ${alert.ceiling_design_type === 'flat' ? 'text-rose-600 font-medium' : ['exposed_ductwork', 'exposed_beams'].includes(alert.ceiling_design_type) ? 'text-amber-600 font-medium' : ['coffered', 'tray', 'vaulted', 'painted_mural'].includes(alert.ceiling_design_type) ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.ceiling_design_type}</span>
                          )}
                          {alert.ceiling_height_ft != null && alert.ceiling_height_ft > 0 && (
                            <span className={`text-xs ${alert.ceiling_height_ft < 9 ? 'text-rose-600 font-medium' : alert.ceiling_height_ft < 11 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.ceiling_height_ft}ft</span>
                          )}
                          {alert.ceiling_color && (
                            <span className={`text-xs ${['white'].includes(alert.ceiling_color) && alert.restaurant_tier === 'fine_dining' ? 'text-rose-600 font-medium' : ['dark'].includes(alert.ceiling_color) && alert.ceiling_height_ft != null && alert.ceiling_height_ft < 9 ? 'text-rose-600 font-medium' : ['warm', 'cool', 'mural'].includes(alert.ceiling_color) ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.ceiling_color}</span>
                          )}
                          {alert.has_exposed_beams != null && alert.has_exposed_beams && (
                            <span className={`text-xs ${!alert.acoustic_treatment ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>exposed beams{!alert.acoustic_treatment ? ' (no acoustic)' : ''}</span>
                          )}
                          {alert.has_exposed_ductwork != null && alert.has_exposed_ductwork && (
                            <span className={`text-xs ${!alert.acoustic_treatment ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>exposed ductwork{!alert.acoustic_treatment ? ' (no acoustic)' : ''}</span>
                          )}
                          {alert.has_coffered_ceiling != null && alert.has_coffered_ceiling && (
                            <span className="text-xs text-emerald-600 font-medium">coffered</span>
                          )}
                          {alert.has_tray_ceiling != null && alert.has_tray_ceiling && (
                            <span className="text-xs text-emerald-600 font-medium">tray</span>
                          )}
                          {alert.has_painted_mural != null && alert.has_painted_mural && (
                            <span className="text-xs text-emerald-600 font-medium">mural</span>
                          )}
                          {alert.has_skylight != null && alert.has_skylight && (
                            <span className="text-xs text-emerald-600 font-medium">skylight ({alert.skylight_count ?? 0})</span>
                          )}
                          {alert.has_ceiling_fan != null && alert.has_ceiling_fan && (
                            <span className="text-xs text-emerald-600 font-medium">fans ({alert.ceiling_fan_count ?? 0})</span>
                          )}
                          {alert.has_pendant_lighting != null && alert.has_pendant_lighting && (
                            <span className={`text-xs ${!alert.pendant_lighting_integrated ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>pendant{!alert.pendant_lighting_integrated ? ' (not integrated)' : ' (integrated)'}</span>
                          )}
                          {alert.noise_level_db != null && alert.noise_level_db > 0 && (
                            <span className={`text-xs ${alert.noise_level_db > 80 ? 'text-rose-600 font-medium' : alert.noise_level_db > 75 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.noise_level_db} dB</span>
                          )}
                          {alert.perceived_temp_c != null && alert.perceived_temp_c > 0 && (
                            <span className={`text-xs ${alert.perceived_temp_c > 28 ? 'text-rose-600 font-medium' : alert.perceived_temp_c > 25 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.perceived_temp_c}C</span>
                          )}
                          {alert.perceived_quality_score != null && alert.perceived_quality_score > 0 && (
                            <span className={`text-xs ${alert.perceived_quality_score < 50 ? 'text-rose-600 font-medium' : alert.perceived_quality_score < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.perceived_quality_score}/100 quality</span>
                          )}
                          {alert.instagram_photo_freq_per_week != null && alert.instagram_photo_freq_per_week > 0 && (
                            <span className={`text-xs ${alert.instagram_photo_freq_per_week < 10 ? 'text-rose-600 font-medium' : alert.instagram_photo_freq_per_week < 15 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.instagram_photo_freq_per_week} ig/wk</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.perceived_spaciousness_change != null && alert.perceived_spaciousness_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_spaciousness_change}% spaciousness</span>
                          )}
                          {alert.perceived_quality_change != null && alert.perceived_quality_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_quality_change}% quality</span>
                          )}
                          {alert.perceived_design_intentionality_change != null && alert.perceived_design_intentionality_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_design_intentionality_change}% intentionality</span>
                          )}
                          {alert.noise_level_change_pct != null && alert.noise_level_change_pct > 0 && (
                            <span className="text-rose-600">+{alert.noise_level_change_pct}% noise</span>
                          )}
                          {alert.perceived_temp_change_c != null && alert.perceived_temp_change_c > 0 && (
                            <span className="text-rose-600">-{alert.perceived_temp_change_c}C cooling missed</span>
                          )}
                          {alert.instagram_photo_change_pct != null && alert.instagram_photo_change_pct > 0 && (
                            <span className="text-rose-600">-{alert.instagram_photo_change_pct}% Instagram</span>
                          )}
                          {alert.customer_satisfaction_change != null && alert.customer_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.customer_satisfaction_change}% satisfaction</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
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
          <span>Non-flat ceiling upscale: <span className={config.requireNonFlatCeilingInUpscale ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireNonFlatCeilingInUpscale ? 'required' : 'optional'}</span> ({config.upscaleTiers.join(', ')})</span>
          <span>Acoustic if exposed: <span className={config.requireAcousticTreatmentIfExposed ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireAcousticTreatmentIfExposed ? 'required' : 'optional'}</span></span>
          <span>Coffered/tray fine dining: <span className={config.requireCofferedOrTrayInFineDining ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCofferedOrTrayInFineDining ? 'required' : 'optional'}</span></span>
          <span>Skylights daytime venue: <span className={config.requireSkylightsIfDaytimeVenue ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireSkylightsIfDaytimeVenue ? 'required' : 'optional'}</span> (threshold {config.daytimeRevenueThresholdPct}%)</span>
          <span>Max color mismatch: {config.maxCeilingColorMismatch}</span>
          <span>Pendant integration: <span className={config.requirePendantLightingIntegration ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePendantLightingIntegration ? 'required' : 'optional'}</span></span>
          <span>Ceiling fans hot climate: <span className={config.requireCeilingFansInHotClimate ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCeilingFansInHotClimate ? 'required' : 'optional'}</span> ({config.hotClimateThresholds.join(', ')})</span>
          <span>Mural photo op: <span className={config.requireMuralInPhotoOpportunityVenue ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMuralInPhotoOpportunityVenue ? 'required' : 'optional'}</span> (min {config.minInstagramPhotoFreqPerWeek} ig/wk)</span>
          <span>Min spaciousness: {config.minPerceivedSpaciousnessScore}/100</span>
          <span>Min quality: {config.minPerceivedQualityScore}/100</span>
          <span>Min intentionality: {config.minPerceivedDesignIntentionalityScore}/100</span>
          <span className="text-neutral-400">174th POSR-exclusive differentiator</span>
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

export default CeilingDesignDecorScreen;
