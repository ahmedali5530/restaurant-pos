/**
 * AI Biophilic Design & Indoor Plant Optimizer — predicts how indoor plants
 * and biophilic design (living walls, potted plants, hanging greenery,
 * natural materials, water features) impacts customer satisfaction, stress
 * reduction, perceived air quality, dwell time, and spend.
 *
 * 160th POSR-exclusive differentiator.
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
  faLeaf, faRotate, faSeedling, faEye, faTree,
  faCalendarXmark, faSun, faWater, faDroplet,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runBiophilicEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readBiophilicConfig, DEFAULT_BIOPHILIC_CONFIG,
  type BiophilicAlert,
} from "@/lib/biophilic-design-plant.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  plant_health_declining:           { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faTriangleExclamation, label: 'PLANT HEALTH' },
  insufficient_greenery:             { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faSeedling,           label: 'LOW GREENERY' },
  plant_placement_suboptimal:        { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faEye,                label: 'POOR PLACEMENT' },
  living_wall_opportunity:           { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faTree,               label: 'LIVING WALL' },
  seasonal_plant_rotation_missing:   { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faCalendarXmark,      label: 'STALE ROTATION' },
  plant_species_mismatch:            { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faSun,                label: 'SPECIES MISMATCH' },
  natural_material_gap:              { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faLeaf,               label: 'MATERIAL GAP' },
  water_feature_absent:              { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faWater,              label: 'NO WATER FEATURE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function BiophilicDesignPlantScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<BiophilicAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, decliningPlants: 0, avgHealthScore: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_BIOPHILIC_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readBiophilicConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[biophilic-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runBiophilicEngine(db, config);
      toast.success(`Analyzed ${result.generated} biophilic signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[biophilic-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[biophilic-report] status failed', err);
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
      <DocumentTitle parts={["AI Biophilic Design & Plants", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLeaf} className="text-emerald-500" />
              AI Biophilic Design &amp; Indoor Plant Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how plants + biophilic design impact satisfaction, stress, and dwell — biophilic design reduces stress 15-20% (Terrapin Bright Green)
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLeaf} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze biophilic'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Declining plants" value={String(summary.decliningPlants)} color={summary.decliningPlants > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLeaf} label="Avg plant health" value={`${summary.avgHealthScore.toFixed(0)}/100`} color={summary.avgHealthScore < 70 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Zones at risk" value={String(summary.zonesAtRisk)} color={summary.zonesAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTree} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLeaf} spin className="text-4xl mb-3" />
            <p>Analyzing biophilic design &amp; indoor plant opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No biophilic alerts</p>
            <p className="text-sm mt-1">Indoor plants + biophilic design optimized across all zones.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faLeaf, label: alert.rule_id.toUpperCase() };
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
                          {alert.plant_count != null && alert.plant_count > 0 && (
                            <span className="text-xs">
                              <span className="text-rose-600">{alert.plant_count} plants</span>
                              {alert.recommended_plant_count != null && alert.recommended_plant_count > 0 && alert.plant_count < alert.recommended_plant_count && (
                                <>
                                  <span className="text-neutral-400 mx-1">/</span>
                                  <span className="text-emerald-600 font-medium">{alert.recommended_plant_count} recommended</span>
                                </>
                              )}
                            </span>
                          )}
                          {alert.current_season && (
                            <span className="text-xs text-emerald-600 uppercase">{alert.current_season}</span>
                          )}
                          {alert.plant_health_score != null && alert.plant_health_score > 0 && (
                            <span className={`text-xs ${alert.plant_health_score < 40 ? 'text-rose-600 font-medium' : alert.plant_health_score < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.plant_health_score}/100 health</span>
                          )}
                          {alert.species_match_score != null && alert.species_match_score > 0 && (
                            <span className={`text-xs ${alert.species_match_score < 65 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.species_match_score}/100 species match</span>
                          )}
                          {alert.visibility_pct != null && alert.visibility_pct > 0 && (
                            <span className={`text-xs ${alert.visibility_pct < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.visibility_pct}% visible</span>
                          )}
                          {alert.natural_light_lux != null && alert.natural_light_lux > 0 && (
                            <span className={`text-xs ${alert.natural_light_lux < 150 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.natural_light_lux} lux</span>
                          )}
                          {alert.seasonal_rotation_age_days != null && alert.seasonal_rotation_age_days > 0 && (
                            <span className="text-xs text-amber-600 font-medium">{alert.seasonal_rotation_age_days}d stale</span>
                          )}
                          {alert.has_living_wall && (
                            <span className="text-xs text-emerald-600 font-medium">living wall</span>
                          )}
                          {alert.has_hanging_greenery && (
                            <span className="text-xs text-emerald-600 font-medium">hanging</span>
                          )}
                          {alert.has_water_feature && (
                            <span className="text-xs text-sky-600 font-medium">water feature</span>
                          )}
                          {alert.has_natural_materials && (
                            <span className="text-xs text-emerald-600 font-medium">natural materials</span>
                          )}
                          {alert.space_sqft != null && alert.space_sqft > 0 && (
                            <span className="text-xs text-neutral-500">{alert.space_sqft} sqft</span>
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
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_satisfaction_change} satisfaction</span>
                          )}
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_satisfaction_change} satisfaction</span>
                          )}
                          {alert.predicted_stress_reduction_pct != null && alert.predicted_stress_reduction_pct > 0 && (
                            <span className="text-emerald-600">-{alert.predicted_stress_reduction_pct}% stress</span>
                          )}
                          {alert.predicted_stress_reduction_pct != null && alert.predicted_stress_reduction_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_stress_reduction_pct}% stress (worse)</span>
                          )}
                          {alert.target_natural_light_lux != null && alert.natural_light_lux != null && alert.natural_light_lux < alert.target_natural_light_lux && (
                            <span>target: <span className="text-emerald-600 font-medium">{alert.target_natural_light_lux} lux</span></span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLeaf} className="mt-0.5 shrink-0" />
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
          <span>Min plant health: {config.minPlantHealthScore}/100</span>
          <span>Min plants/1000sqft: {config.minPlantsPer1000sqft}</span>
          <span>Min visibility: {config.minVisibilityPct}%</span>
          <span>Min species match: {config.minSpeciesMatchScore}/100</span>
          <span>Min natural light: {config.minNaturalLightLux} lux</span>
          <span>Max seasonal age: {config.maxSeasonalRotationDays}d</span>
          <span className="text-neutral-400">160th POSR-exclusive differentiator</span>
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

export default BiophilicDesignPlantScreen;
