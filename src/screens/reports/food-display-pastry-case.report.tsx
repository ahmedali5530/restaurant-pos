/**
 * AI Food Display & Pastry Case Optimizer — predicts how food display cases
 * and pastry displays (visibility, lighting, temperature control, arrangement,
 * freshness rotation, display case size, glass cleanliness, product placement
 * psychology, impulse purchase placement) impact dessert/beverage sales and
 * perceived food quality.
 *
 * 178th POSR-exclusive differentiator.
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
  faCakeCandles, faRotate, faStore, faLightbulb, faEye, faCookie,
  faBreadSlice, faTemperatureHalf, faUtensils, faIceCream,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runFoodDisplayEngine, getActiveFoodDisplayAlerts, getFoodDisplaySummary,
  updateFoodDisplayAlertStatus, readFoodDisplayConfig, DEFAULT_FOOD_DISPLAY_CONFIG,
  type FoodDisplayAlert,
} from "@/lib/food-display-pastry-case.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  display_case_absent:            { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faStore,           label: 'NO DISPLAY CASE' },
  display_lighting_poor:          { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faLightbulb,       label: 'POOR LIGHTING' },
  display_placement_suboptimal:   { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faEye,             label: 'POOR PLACEMENT' },
  display_glass_dirty_foggy:      { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faCookie,          label: 'DIRTY/FOGGY GLASS' },
  stale_items_in_display:         { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faBreadSlice,      label: 'STALE ITEMS' },
  temperature_control_failure:    { bg: 'bg-red-50',      text: 'text-red-700',      icon: faTemperatureHalf, label: 'TEMP FAILURE' },
  display_arrangement_weak:       { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faUtensils,        label: 'WEAK ARRANGEMENT' },
  display_size_insufficient:      { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faIceCream,        label: 'UNDERSIZED' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function FoodDisplayPastryCaseScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<FoodDisplayAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noDisplayCount: 0, poorLightingCount: 0, dirtyGlassCount: 0, tempFailureCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_FOOD_DISPLAY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readFoodDisplayConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveFoodDisplayAlerts(db), getFoodDisplaySummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[food-display-pastry-case-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runFoodDisplayEngine(db, config);
      toast.success(`Analyzed ${result.generated} food display + pastry case signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[food-display-pastry-case-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateFoodDisplayAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[food-display-pastry-case-report] status failed', err);
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
      <DocumentTitle parts={["AI Food Display & Pastry Case Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCakeCandles} className="text-pink-600" />
              AI Food Display &amp; Pastry Case Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how food display cases + pastry displays (visibility, lighting, temperature control, arrangement, freshness rotation, display case size, glass cleanliness, product placement psychology, impulse purchase placement) impact dessert/beverage sales + perceived food quality — visible food displays increase impulse dessert purchases 35-50% (NRA); 68% of dessert orders are impulse (Cornell CHR); cases near exit capture 25% more; poor lighting reduces sales 20-30%; dirty glass reduces appeal 40%; eye-level placement increases conversion 30-40%
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faCakeCandles} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze display'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faStore} label="No display case" value={String(summary.noDisplayCount)} color={summary.noDisplayCount > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLightbulb} label="Poor lighting" value={String(summary.poorLightingCount)} color={summary.poorLightingCount > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faCookie} label="Dirty/foggy glass" value={String(summary.dirtyGlassCount)} color={summary.dirtyGlassCount > 0 ? 'text-sky-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTemperatureHalf} label="Temperature failures" value={String(summary.tempFailureCount)} color={summary.tempFailureCount > 0 ? 'text-red-600' : 'text-emerald-600'} />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCakeCandles} spin className="text-4xl mb-3" />
            <p>Analyzing food display + pastry case opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No food display / pastry case alerts</p>
            <p className="text-sm mt-1">Display case present + visible from seating, lit at 300-500 lux warm white, glass clean + clear, items fresh (FIFO enforced, avg age under 24h), temperature controlled (under 41F, monitored), strong arrangement (eye-level top items, impulse items at counter, cross-sell pairings), adequate size (12+ items variety).</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faCakeCandles, label: alert.rule_id.toUpperCase() };
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
                          {alert.market_setting && (
                            <span className="text-xs text-neutral-500">{alert.market_setting}</span>
                          )}
                          {alert.has_display_case != null && (
                            <span className={`text-xs ${alert.has_display_case ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_display_case ? 'has case' : 'NO case'}</span>
                          )}
                          {alert.display_case_count != null && alert.display_case_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.display_case_count} case(s)</span>
                          )}
                          {alert.display_case_type && alert.display_case_type !== 'none' && (
                            <span className="text-xs text-neutral-500">{alert.display_case_type}</span>
                          )}
                          {alert.display_case_sqft != null && alert.display_case_sqft > 0 && (
                            <span className={`text-xs ${alert.display_case_sqft < 4 ? 'text-rose-600 font-medium' : alert.display_case_sqft < 8 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.display_case_sqft} sqft</span>
                          )}
                          {alert.display_location_zone && (
                            <span className={`text-xs ${alert.display_location_zone === 'back' ? 'text-rose-600 font-medium' : alert.display_location_zone === 'counter' || alert.display_location_zone === 'entrance' || alert.display_location_zone === 'exit' ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.display_location_zone}</span>
                          )}
                          {alert.distance_from_entrance_ft != null && alert.distance_from_entrance_ft > 0 && (
                            <span className={`text-xs ${alert.distance_from_entrance_ft > 30 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.distance_from_entrance_ft} ft from door</span>
                          )}
                          {alert.distance_from_payment_counter_ft != null && alert.distance_from_payment_counter_ft > 0 && (
                            <span className={`text-xs ${alert.distance_from_payment_counter_ft > 15 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.distance_from_payment_counter_ft} ft from counter</span>
                          )}
                          {alert.eye_level_placement != null && (
                            <span className={`text-xs ${alert.eye_level_placement ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.eye_level_placement ? 'eye level' : 'NOT eye level'}</span>
                          )}
                          {alert.visible_from_seating != null && (
                            <span className={`text-xs ${alert.visible_from_seating ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.visible_from_seating ? 'visible' : 'NOT visible from seats'}</span>
                          )}
                          {alert.display_lighting_lux != null && alert.display_lighting_lux > 0 && (
                            <span className={`text-xs ${alert.display_lighting_lux < 100 ? 'text-rose-600 font-medium' : alert.display_lighting_lux < 200 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.display_lighting_lux} lux</span>
                          )}
                          {alert.display_lighting_color_temp_k != null && alert.display_lighting_color_temp_k > 0 && (
                            <span className="text-xs text-neutral-500">{alert.display_lighting_color_temp_k}K</span>
                          )}
                          {alert.glass_cleanliness_score != null && alert.glass_cleanliness_score > 0 && (
                            <span className={`text-xs ${alert.glass_cleanliness_score < 50 ? 'text-rose-600 font-medium' : alert.glass_cleanliness_score < 75 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.glass_cleanliness_score}/100 glass</span>
                          )}
                          {alert.glass_foggy != null && alert.glass_foggy && (
                            <span className="text-xs text-rose-600 font-medium">foggy</span>
                          )}
                          {alert.glass_smudged != null && alert.glass_smudged && (
                            <span className="text-xs text-rose-600 font-medium">smudged</span>
                          )}
                          {alert.glass_last_cleaned_hours != null && alert.glass_last_cleaned_hours > 0 && (
                            <span className={`text-xs ${alert.glass_last_cleaned_hours > 4 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>cleaned {alert.glass_last_cleaned_hours}h ago</span>
                          )}
                          {alert.case_temperature_f != null && alert.case_temperature_f > 0 && (
                            <span className={`text-xs ${alert.case_temperature_f > 41 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.case_temperature_f}F</span>
                          )}
                          {alert.target_temperature_f != null && alert.target_temperature_f > 0 && (
                            <span className="text-xs text-neutral-500">target {alert.target_temperature_f}F</span>
                          )}
                          {alert.temperature_variance_f != null && alert.temperature_variance_f > 0 && (
                            <span className={`text-xs ${alert.temperature_variance_f > 3 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>±{alert.temperature_variance_f}F</span>
                          )}
                          {alert.temperature_monitoring_active != null && (
                            <span className={`text-xs ${alert.temperature_monitoring_active ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.temperature_monitoring_active ? 'monitoring' : 'NO monitoring'}</span>
                          )}
                          {alert.avg_item_age_hours != null && alert.avg_item_age_hours > 0 && (
                            <span className={`text-xs ${alert.avg_item_age_hours > 24 ? 'text-rose-600 font-medium' : alert.avg_item_age_hours > 18 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.avg_item_age_hours}h avg age</span>
                          )}
                          {alert.max_item_age_hours != null && alert.max_item_age_hours > 0 && (
                            <span className="text-xs text-neutral-500">{alert.max_item_age_hours}h max</span>
                          )}
                          {alert.freshness_rotation_policy != null && (
                            <span className={`text-xs ${alert.freshness_rotation_policy ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.freshness_rotation_policy ? 'FIFO' : 'NO FIFO'}</span>
                          )}
                          {alert.stale_items_visible != null && alert.stale_items_visible && (
                            <span className="text-xs text-rose-600 font-medium">STALE visible</span>
                          )}
                          {alert.items_discarded_today != null && alert.items_discarded_today > 0 && (
                            <span className="text-xs text-amber-600 font-medium">{alert.items_discarded_today} discarded</span>
                          )}
                          {alert.arrangement_score != null && alert.arrangement_score > 0 && (
                            <span className={`text-xs ${alert.arrangement_score < 50 ? 'text-rose-600 font-medium' : alert.arrangement_score < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.arrangement_score}/100 arrange</span>
                          )}
                          {alert.eye_level_items_count != null && alert.eye_level_items_count > 0 && (
                            <span className={`text-xs ${alert.eye_level_items_count < 6 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.eye_level_items_count} eye-level</span>
                          )}
                          {alert.impulse_items_at_counter != null && (
                            <span className={`text-xs ${alert.impulse_items_at_counter ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.impulse_items_at_counter ? 'impulse @ counter' : 'NO impulse @ counter'}</span>
                          )}
                          {alert.cross_sell_pairing != null && (
                            <span className={`text-xs ${alert.cross_sell_pairing ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.cross_sell_pairing ? 'cross-sell' : 'no cross-sell'}</span>
                          )}
                          {alert.variety_items_count != null && alert.variety_items_count > 0 && (
                            <span className={`text-xs ${alert.variety_items_count < 8 ? 'text-rose-600 font-medium' : alert.variety_items_count < 12 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.variety_items_count} items</span>
                          )}
                          {alert.dessert_revenue_monthly != null && alert.dessert_revenue_monthly > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.dessert_revenue_monthly}/mo desserts</span>
                          )}
                          {alert.dessert_revenue_pct != null && alert.dessert_revenue_pct > 0 && (
                            <span className="text-xs text-neutral-500">{alert.dessert_revenue_pct}% of total</span>
                          )}
                          {alert.impulse_purchase_rate_pct != null && alert.impulse_purchase_rate_pct > 0 && (
                            <span className={`text-xs ${alert.impulse_purchase_rate_pct < 10 ? 'text-rose-600 font-medium' : alert.impulse_purchase_rate_pct < 20 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.impulse_purchase_rate_pct}% impulse</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.sales_lift_pct != null && alert.sales_lift_pct > 0 && (
                            <span className="text-emerald-600">+{alert.sales_lift_pct}% sales lift (target)</span>
                          )}
                          {alert.conversion_change != null && alert.conversion_change > 0 && (
                            <span className="text-emerald-600">+{alert.conversion_change}% conversion</span>
                          )}
                          {alert.dessert_revenue_change != null && alert.dessert_revenue_change > 0 && (
                            <span className="text-emerald-600">+${alert.dessert_revenue_change}/mo desserts</span>
                          )}
                          {alert.waste_reduction != null && alert.waste_reduction > 0 && (
                            <span className="text-emerald-600">-${alert.waste_reduction}/mo waste</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faCakeCandles} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo opportunity</div>
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
          <span>Display case: <span className={config.requireDisplayCase ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireDisplayCase ? 'required' : 'optional'}</span></span>
          <span>Min lighting: {config.minDisplayLightingLux} lux</span>
          <span>Max glass clean hours: {config.maxGlassLastCleanedHours}h</span>
          <span>Min glass score: {config.minGlassCleanlinessScore}/100</span>
          <span>Temp monitoring: <span className={config.requireTemperatureMonitoring ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireTemperatureMonitoring ? 'required' : 'optional'}</span></span>
          <span>Max temp variance: ±{config.maxTemperatureVarianceF}F</span>
          <span>Max item age: {config.maxAvgItemAgeHours}h</span>
          <span>FIFO rotation: <span className={config.requireFreshnessRotation ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireFreshnessRotation ? 'required' : 'optional'}</span></span>
          <span>Eye level: <span className={config.requireEyeLevelPlacement ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireEyeLevelPlacement ? 'required' : 'optional'}</span></span>
          <span>Impulse @ counter: <span className={config.requireImpulseAtCounter ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireImpulseAtCounter ? 'required' : 'optional'}</span></span>
          <span>Min arrangement: {config.minArrangementScore}/100</span>
          <span>Min case size: {config.minDisplayCaseSizeSqft} sqft</span>
          <span>Min variety: {config.minVarietyItemsCount} items</span>
          <span className="text-neutral-400">178th POSR-exclusive differentiator</span>
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

export default FoodDisplayPastryCaseScreen;
