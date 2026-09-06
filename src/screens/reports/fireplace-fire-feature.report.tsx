/**
 * AI Fireplace & Fire Feature Impact Optimizer — predicts how fireplaces and
 * fire features (wood fireplace, gas fireplace, electric fireplace, outdoor
 * fire pit, tabletop fire bowls, decorative flame features) impact customer
 * attraction, dwell time, perceived warmth/coziness, seating premium, seasonal
 * revenue, and brand positioning.
 *
 * 173rd POSR-exclusive differentiator.
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
  faFire, faRotate, faFireBurner, faFireFlameSimple, faTags,
  faMountainSun, faWrench, faEye, faSnowflake,
  faLightbulb, faTemperatureHigh, faCampground,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runFireplaceFireFeatureEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readFireplaceFireFeatureConfig, DEFAULT_FIREPLACE_FIRE_FEATURE_CONFIG,
  type FireplaceFireFeatureAlert,
} from "@/lib/fireplace-fire-feature.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  fireplace_absent_cold_climate:        { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faSnowflake,           label: 'NO FIREPLACE' },
  fireplace_unused_during_peak:         { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faFireFlameSimple,     label: 'UNLIT PEAK' },
  fireplace_seating_not_premium:        { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faTags,                label: 'NO PREMIUM' },
  fireplace_type_wrong:                 { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faFireBurner,          label: 'WRONG TYPE' },
  outdoor_fire_pit_absent:              { bg: 'bg-stone-50',    text: 'text-stone-700',    icon: faCampground,          label: 'NO FIRE PIT' },
  fireplace_maintenance_overdue:        { bg: 'bg-red-50',      text: 'text-red-700',      icon: faWrench,              label: 'MAINT OVERDUE' },
  fireplace_visual_impact_poor:         { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faEye,                 label: 'POOR VISIBILITY' },
  fireplace_seasonal_underutilization:  { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faMountainSun,         label: 'SEASONAL GAP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function FireplaceFireFeatureScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<FireplaceFireFeatureAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, fireplacesAtRisk: 0, unlitPeakFireplaces: 0, noOutdoorFirePitPatios: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_FIREPLACE_FIRE_FEATURE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readFireplaceFireFeatureConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[fireplace-fire-feature-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runFireplaceFireFeatureEngine(db, config);
      toast.success(`Analyzed ${result.generated} fireplace + fire feature signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[fireplace-fire-feature-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[fireplace-fire-feature-report] status failed', err);
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
      <DocumentTitle parts={["AI Fireplace & Fire Feature Impact Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faFire} className="text-orange-600" />
              AI Fireplace &amp; Fire Feature Impact Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how fireplaces + fire features (wood, gas, electric, outdoor fire pit, tabletop bowls, decorative flame) impact customer attraction, dwell time, perceived warmth, seating premium, seasonal revenue, brand positioning — 68% say fireplace increases satisfaction (NRA); fireplace tables command 15-25% premium (OpenTable); fire features increase winter revenue 12-18%; outdoor fire pits extend patio season 6-8 weeks; 45% choose fireplace restaurants for special occasions; visible flames increase Instagram photos 30-40%
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faFire} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze fireplace'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faFire} label="Fireplaces at risk" value={String(summary.fireplacesAtRisk)} color={summary.fireplacesAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faFireFlameSimple} label="Unlit during peak" value={String(summary.unlitPeakFireplaces)} color={summary.unlitPeakFireplaces > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faCampground} label="Patio without fire pit" value={String(summary.noOutdoorFirePitPatios)} color={summary.noOutdoorFirePitPatios > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTemperatureHigh} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faFire} spin className="text-4xl mb-3" />
            <p>Analyzing fireplace + fire feature impact opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No fireplace/fire feature alerts</p>
            <p className="text-sm mt-1">Fireplace present in cold climates, lit during peak, premium-priced tables, correct type for setting, outdoor fire pit on patio, maintenance current, visible from most tables, used in all shoulder seasons.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faFire, label: alert.rule_id.toUpperCase() };
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
                            <span className={`text-xs ${alert.climate_zone === 'cold' ? 'text-sky-600 font-medium' : alert.climate_zone === 'temperate' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.climate_zone} climate</span>
                          )}
                          {alert.setting_type && (
                            <span className="text-xs text-neutral-500">{alert.setting_type}</span>
                          )}
                          {alert.has_fireplace != null && (
                            <span className={`text-xs ${alert.has_fireplace ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_fireplace ? 'has fireplace' : 'no fireplace'}</span>
                          )}
                          {alert.fireplace_type && alert.fireplace_type !== 'none' && (
                            <span className={`text-xs ${['wood'].includes(alert.fireplace_type) && alert.setting_type === 'urban' ? 'text-rose-600 font-medium' : ['electric'].includes(alert.fireplace_type) && alert.restaurant_tier === 'fine_dining' ? 'text-rose-600 font-medium' : ['gas'].includes(alert.fireplace_type) ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.fireplace_type}</span>
                          )}
                          {alert.fireplace_lit_during_peak != null && !alert.fireplace_lit_during_peak && alert.has_fireplace && (
                            <span className="text-xs text-rose-600 font-medium">not lit at peak</span>
                          )}
                          {alert.fireplace_lit_hours_per_day != null && alert.fireplace_lit_hours_per_day > 0 && (
                            <span className={`text-xs ${alert.fireplace_lit_hours_per_day < 4 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.fireplace_lit_hours_per_day} hr/day lit</span>
                          )}
                          {alert.fireplace_table_premium_pct != null && alert.fireplace_table_count && alert.fireplace_table_count > 0 && (
                            <span className={`text-xs ${alert.fireplace_table_premium_pct < 15 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.fireplace_table_premium_pct}% premium</span>
                          )}
                          {alert.fireplace_visibility_score != null && alert.fireplace_visibility_score > 0 && (
                            <span className={`text-xs ${alert.fireplace_visibility_score < 50 ? 'text-rose-600 font-medium' : alert.fireplace_visibility_score < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.fireplace_visibility_score}/100 visible</span>
                          )}
                          {alert.fireplace_maintenance_months_ago != null && alert.fireplace_maintenance_months_ago > 0 && (
                            <span className={`text-xs ${alert.fireplace_maintenance_months_ago > 18 ? 'text-rose-600 font-medium' : alert.fireplace_maintenance_months_ago > 12 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.fireplace_maintenance_months_ago} mo since service</span>
                          )}
                          {alert.has_outdoor_patio != null && alert.has_outdoor_patio && alert.has_outdoor_fire_pit != null && !alert.has_outdoor_fire_pit && (
                            <span className="text-xs text-amber-600 font-medium">patio, no fire pit</span>
                          )}
                          {alert.perceived_warmth_score != null && alert.perceived_warmth_score > 0 && (
                            <span className={`text-xs ${alert.perceived_warmth_score < 50 ? 'text-rose-600 font-medium' : alert.perceived_warmth_score < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.perceived_warmth_score}/100 warmth</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.perceived_warmth_change != null && alert.perceived_warmth_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_warmth_change}% perceived warmth</span>
                          )}
                          {alert.customer_satisfaction_change != null && alert.customer_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.customer_satisfaction_change}% satisfaction</span>
                          )}
                          {alert.return_likelihood_change != null && alert.return_likelihood_change < 0 && (
                            <span className="text-rose-600">{alert.return_likelihood_change}% return likelihood</span>
                          )}
                          {alert.seasonal_revenue_change_pct != null && alert.seasonal_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.seasonal_revenue_change_pct}% seasonal revenue</span>
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
          <span>Require fireplace cold climate: <span className={config.requireFireplaceInColdClimate ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireFireplaceInColdClimate ? 'yes' : 'no'}</span> ({config.coldClimateThresholds.join(', ')})</span>
          <span>Lit during peak: <span className={config.requireLitDuringPeak ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireLitDuringPeak ? 'required' : 'optional'}</span> (min {config.minFireplaceLitHoursPerDay} hr/day)</span>
          <span>Min fireplace table premium: {config.minFireplaceTablePremiumPct}%</span>
          <span>Premium pricing: <span className={config.requirePremiumPricingForFireplaceTables ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePremiumPricingForFireplaceTables ? 'required' : 'optional'}</span></span>
          <span>Wood in urban: <span className={config.allowWoodFireplaceInUrban ? 'text-amber-600 font-medium' : 'text-rose-600 font-medium'}>{config.allowWoodFireplaceInUrban ? 'allowed' : 'prohibited'}</span></span>
          <span>Electric in luxury: <span className={config.allowElectricFireplaceInLuxury ? 'text-amber-600 font-medium' : 'text-rose-600 font-medium'}>{config.allowElectricFireplaceInLuxury ? 'allowed' : 'prohibited'}</span></span>
          <span>Outdoor fire pit if patio: <span className={config.requireOutdoorFirePitIfPatio ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireOutdoorFirePitIfPatio ? 'required' : 'optional'}</span></span>
          <span>Max maintenance: {config.maxFireplaceMaintenanceMonths} mo</span>
          <span>Safety certified: <span className={config.requireFireplaceSafetyCertified ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireFireplaceSafetyCertified ? 'required' : 'optional'}</span></span>
          <span>Min visibility: {config.minFireplaceVisibilityScore}/100</span>
          <span>Fall/spring usage: <span className={config.requireFallSpringFireplaceUsage ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireFallSpringFireplaceUsage ? 'required' : 'optional'}</span> (min {config.minSeasonalUsagePct}%)</span>
          <span>Min perceived warmth: {config.minPerceivedWarmthScore}/100</span>
          <span className="text-neutral-400">173rd POSR-exclusive differentiator</span>
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

export default FireplaceFireFeatureScreen;
