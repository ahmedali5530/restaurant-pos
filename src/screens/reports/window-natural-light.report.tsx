/**
 * AI Window Treatment & Natural Light Optimizer — predicts how window
 * treatments and natural light (window size, curtain/blind type, sunlight
 * control, glare management, view quality, UV protection, natural light
 * optimization, window cleanliness, seasonal light adjustment) impacts
 * customer satisfaction, perceived spaciousness, energy savings, and dwell
 * time.
 *
 * 168th POSR-exclusive differentiator.
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
  faSun, faRotate, faDroplet, faMagnifyingGlass,
  faWindowMaximize, faCloudSun, faEye, faWandSparkles,
  faLightbulb, faBrush, faTree, faTemperatureArrowUp,
  faCouch, faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runWindowNaturalLightEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readWindowNaturalLightConfig, DEFAULT_WINDOW_NATURAL_LIGHT_CONFIG,
  type WindowNaturalLightAlert,
} from "@/lib/window-natural-light.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  glare_uncontrolled:                   { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faSun,              label: 'GLARE UNCONTROLLED' },
  natural_light_underutilized:          { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faLightbulb,        label: 'LIGHT UNDERUSED' },
  window_seats_not_optimized:           { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faWindowMaximize,   label: 'SEATS NOT OPTIMIZED' },
  window_cleanliness_poor:              { bg: 'bg-stone-50',    text: 'text-stone-700',    icon: faBrush,            label: 'DIRTY WINDOWS' },
  uv_damage_risk:                       { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faTemperatureArrowUp, label: 'UV DAMAGE RISK' },
  view_quality_poor:                    { bg: 'bg-slate-50',    text: 'text-slate-700',    icon: faEye,              label: 'POOR VIEW' },
  seasonal_light_adjustment_missing:    { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faCloudSun,         label: 'NO SEASONAL SWAP' },
  window_treatment_brand_mismatch:      { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faCouch,            label: 'BRAND MISMATCH' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function WindowNaturalLightScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<WindowNaturalLightAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, locationsAtRisk: 0, glareRiskZones: 0, unoptimizedWindowSeatsZones: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_WINDOW_NATURAL_LIGHT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWindowNaturalLightConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[window-natural-light-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runWindowNaturalLightEngine(db, config);
      toast.success(`Analyzed ${result.generated} window + natural light signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[window-natural-light-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[window-natural-light-report] status failed', err);
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
      <DocumentTitle parts={["AI Window Treatment & Natural Light Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faSun} className="text-amber-500" />
              AI Window Treatment &amp; Natural Light Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how window treatments + natural light (window size, curtain/blind type, glare control, view quality, UV protection, cleanliness, seasonal adjustment, smart blinds) impact customer satisfaction + perceived spaciousness + dwell + energy savings — natural light increases satisfaction 20-25% (Cornell CHR); glare reduces dwell 12%; window seats are #1 requested (58%, OpenTable); dirty windows reduce perceived cleanliness 30%; UV damage costs $500-2,000/yr; smart blinds save 15-20% HVAC
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faSun} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze windows'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faSun} label="Glare risk zones" value={String(summary.glareRiskZones)} color={summary.glareRiskZones > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faWindowMaximize} label="Window seats unoptimized" value={String(summary.unoptimizedWindowSeatsZones)} color={summary.unoptimizedWindowSeatsZones > 0 ? 'text-sky-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Locations at risk" value={String(summary.locationsAtRisk)} color={summary.locationsAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faSun} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faSun} spin className="text-4xl mb-3" />
            <p>Analyzing window treatment + natural light opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No window/natural light alerts</p>
            <p className="text-sm mt-1">Glare managed, natural light utilized, window seats optimized, windows clean, UV protection installed, view quality acceptable, seasonal adjustment present, treatment matches brand tier.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faSun, label: alert.rule_id.toUpperCase() };
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
                          {alert.window_count != null && alert.window_count > 0 && (
                            <span className="text-xs text-neutral-600 font-medium">{alert.window_count} windows</span>
                          )}
                          {alert.window_size && (
                            <span className="text-xs text-neutral-500">{alert.window_size}</span>
                          )}
                          {alert.window_treatment_type && (
                            <span className={`text-xs ${alert.window_treatment_type === 'none' ? 'text-rose-600 font-medium' : 'text-neutral-600 font-medium'}`}>{alert.window_treatment_type === 'none' ? 'no treatment' : alert.window_treatment_type}</span>
                          )}
                          {alert.treatment_brand_match != null && !alert.treatment_brand_match && (
                            <span className="text-xs text-rose-600 font-medium">brand mismatch</span>
                          )}
                          {alert.smart_blinds_installed != null && (
                            <span className={`text-xs ${alert.smart_blinds_installed ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.smart_blinds_installed ? 'smart blinds' : 'manual'}</span>
                          )}
                          {alert.glare_management_score != null && alert.glare_management_score > 0 && (
                            <span className={`text-xs ${alert.glare_management_score < 40 ? 'text-rose-600 font-medium' : alert.glare_management_score < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.glare_management_score}/100 glare</span>
                          )}
                          {alert.natural_light_utilization_score != null && alert.natural_light_utilization_score > 0 && (
                            <span className={`text-xs ${alert.natural_light_utilization_score < 35 ? 'text-rose-600 font-medium' : alert.natural_light_utilization_score < 65 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.natural_light_utilization_score}/100 light</span>
                          )}
                          {alert.natural_light_hours_per_day != null && (
                            <span className={`text-xs ${alert.natural_light_hours_per_day === 0 ? 'text-rose-600 font-medium' : alert.natural_light_hours_per_day < 4 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.natural_light_hours_per_day}h/day</span>
                          )}
                          {alert.view_quality && (
                            <span className={`text-xs ${alert.view_quality === 'unpleasant' || alert.view_quality === 'blocked' ? 'text-rose-600 font-medium' : alert.view_quality === 'excellent' || alert.view_quality === 'pleasant' ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.view_quality} view</span>
                          )}
                          {alert.view_quality_score != null && alert.view_quality_score > 0 && (
                            <span className={`text-xs ${alert.view_quality_score < 35 ? 'text-rose-600 font-medium' : alert.view_quality_score < 60 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.view_quality_score}/100</span>
                          )}
                          {alert.uv_protection_present != null && (
                            <span className={`text-xs ${!alert.uv_protection_present ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>UV {alert.uv_protection_present ? `${alert.uv_protection_score ?? 0}/100` : 'missing'}</span>
                          )}
                          {alert.window_seats_count != null && alert.window_seats_count > 0 && (
                            <span className="text-xs text-neutral-600 font-medium">{alert.window_seats_count} win seats</span>
                          )}
                          {alert.window_seats_optimized != null && !alert.window_seats_optimized && (
                            <span className="text-xs text-amber-600 font-medium">not optimized</span>
                          )}
                          {alert.window_cleanliness_score != null && alert.window_cleanliness_score > 0 && (
                            <span className={`text-xs ${alert.window_cleanliness_score < 50 ? 'text-rose-600 font-medium' : alert.window_cleanliness_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.window_cleanliness_score}/100 clean</span>
                          )}
                          {alert.seasonal_adjustment_present != null && !alert.seasonal_adjustment_present && (
                            <span className="text-xs text-amber-600 font-medium">no seasonal swap</span>
                          )}
                          {alert.hvac_savings_potential_pct != null && alert.hvac_savings_potential_pct > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.hvac_savings_potential_pct}% HVAC save</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.customer_satisfaction_change != null && alert.customer_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.customer_satisfaction_change}% satisfaction</span>
                          )}
                          {alert.perceived_spaciousness_change != null && alert.perceived_spaciousness_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_spaciousness_change}% spaciousness</span>
                          )}
                          {alert.predicted_dwell_change != null && alert.predicted_dwell_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_dwell_change}% dwell</span>
                          )}
                          {alert.energy_savings_change != null && alert.energy_savings_change < 0 && (
                            <span className="text-rose-600">{alert.energy_savings_change}% energy</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faMagnifyingGlass} className="mt-0.5 shrink-0" />
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
          <span>Min glare management: {config.minGlareManagementScore}/100</span>
          <span>Min light utilization: {config.minNaturalLightUtilizationScore}/100</span>
          <span>Min light hours/day: {config.minNaturalLightHoursPerDay}</span>
          <span>Window seats optimized: <span className={config.requireWindowSeatsOptimized ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireWindowSeatsOptimized ? 'required' : 'optional'}</span></span>
          <span>Min window seats: {config.minWindowSeatsCount}</span>
          <span>Min window cleanliness: {config.minWindowCleanlinessScore}/100</span>
          <span>UV protection: <span className={config.requireUvProtection ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireUvProtection ? 'required' : 'optional'}</span></span>
          <span>Min UV score: {config.minUvProtectionScore}/100</span>
          <span>Min view quality: {config.minViewQualityScore}/100</span>
          <span>Seasonal adjustment: <span className={config.requireSeasonalAdjustment ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireSeasonalAdjustment ? 'required' : 'optional'}</span></span>
          <span>Brand match: <span className={config.requireTreatmentBrandMatch ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireTreatmentBrandMatch ? 'required' : 'optional'}</span></span>
          <span>Smart blinds (large windows): <span className={config.requireSmartBlindsForLargeWindows ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireSmartBlindsForLargeWindows ? 'required' : 'optional'}</span></span>
          <span className="text-neutral-400">168th POSR-exclusive differentiator</span>
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

export default WindowNaturalLightScreen;
