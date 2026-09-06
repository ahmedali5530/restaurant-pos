/**
 * AI Floor & Ceiling Surface Quality Optimizer — predicts how floor and
 * ceiling surfaces (flooring material, carpet condition, tile grout, slip
 * resistance, ceiling height, ceiling design, acoustic treatment, ceiling
 * tile condition, brand tier matching) impacts customer perception of
 * cleanliness, acoustic comfort, spatial perception, safety, overall quality.
 *
 * 165th POSR-exclusive differentiator.
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
  faLayerGroup, faRotate, faBroom, faMagnifyingGlass,
  faUpRightAndDownLeftFromCenter, faVolumeHigh, faBuilding,
  faRuler, faGripLines, faBrush, faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runFloorCeilingEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readFloorCeilingConfig, DEFAULT_FLOOR_CEILING_CONFIG,
  type FloorCeilingAlert,
} from "@/lib/floor-ceiling-surface.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  floor_stain_wear_detected:            { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faBroom,                                label: 'FLOOR STAINS' },
  tile_grout_dirty_cracked:             { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faGripLines,                            label: 'DIRTY GROUT' },
  carpet_not_cleaned_regularly:         { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faBrush,                                label: 'CARPET OVERDUE' },
  slip_resistance_inadequate:           { bg: 'bg-red-50',      text: 'text-red-700',      icon: faGripLines,                            label: 'SLIP RISK' },
  ceiling_height_too_low:               { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faUpRightAndDownLeftFromCenter,         label: 'LOW CEILING' },
  ceiling_acoustic_treatment_missing:   { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faVolumeHigh,                           label: 'NO ACOUSTIC' },
  ceiling_tile_stained_damaged:         { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faBuilding,                             label: 'STAINED CEILING' },
  flooring_brand_tier_mismatch:         { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faLayerGroup,                           label: 'TIER MISMATCH' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function FloorCeilingSurfaceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<FloorCeilingAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, dirtyFloorZones: 0, lowCeilingZones: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_FLOOR_CEILING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readFloorCeilingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[floor-ceiling-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runFloorCeilingEngine(db, config);
      toast.success(`Analyzed ${result.generated} floor/ceiling signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[floor-ceiling-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[floor-ceiling-report] status failed', err);
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
      <DocumentTitle parts={["AI Floor & Ceiling Surface Quality Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLayerGroup} className="text-rose-500" />
              AI Floor &amp; Ceiling Surface Quality Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how floor + ceiling surfaces (flooring type, carpet condition, tile grout, slip resistance, ceiling height, acoustic treatment, ceiling tile condition, brand tier match) impact cleanliness perception + acoustic comfort + spatial perception + safety — 55% judge quality by floor cleanliness in 30 seconds (Cornell CHR); dirty grout = #1 FDA floor violation; slip-resistant flooring reduces falls 70% (OSHA); low ceilings feel claustrophobic
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLayerGroup} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze surfaces'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faBroom} label="Dirty floor zones" value={String(summary.dirtyFloorZones)} color={summary.dirtyFloorZones > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faUpRightAndDownLeftFromCenter} label="Low ceiling zones" value={String(summary.lowCeilingZones)} color={summary.lowCeilingZones > 0 ? 'text-violet-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Zones at risk" value={String(summary.zonesAtRisk)} color={summary.zonesAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLayerGroup} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLayerGroup} spin className="text-4xl mb-3" />
            <p>Analyzing floor &amp; ceiling surface quality opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No floor/ceiling surface alerts</p>
            <p className="text-sm mt-1">Floor cleanliness above 80, stain/wear above 75, tile grout above 75, carpet cleaned within 30 days, slip COF above 0.5, ceiling above 9 ft, acoustic treatment on hard ceilings, ceiling tiles above 80, flooring matches brand tier.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faLayerGroup, label: alert.rule_id.toUpperCase() };
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
                          {alert.zone_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.zone_id}</span>
                          )}
                          {alert.flooring_type && (
                            <span className="text-xs text-neutral-500 font-medium">{alert.flooring_type}</span>
                          )}
                          {alert.floor_cleanliness_score != null && alert.floor_cleanliness_score > 0 && (
                            <span className={`text-xs ${alert.floor_cleanliness_score < 55 ? 'text-rose-600 font-medium' : alert.floor_cleanliness_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.floor_cleanliness_score}/100 clean</span>
                          )}
                          {alert.floor_stain_wear_score != null && alert.floor_stain_wear_score > 0 && (
                            <span className={`text-xs ${alert.floor_stain_wear_score < 45 ? 'text-rose-600 font-medium' : alert.floor_stain_wear_score < 75 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.floor_stain_wear_score}/100 stain</span>
                          )}
                          {alert.tile_grout_condition_score != null && alert.tile_grout_condition_score > 0 && (
                            <span className={`text-xs ${alert.tile_grout_condition_score < 40 ? 'text-rose-600 font-medium' : alert.tile_grout_condition_score < 75 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.tile_grout_condition_score}/100 grout</span>
                          )}
                          {alert.carpet_days_since_deep_clean != null && alert.carpet_days_since_deep_clean > 0 && (
                            <span className={`text-xs ${alert.carpet_days_since_deep_clean > 60 ? 'text-rose-600 font-medium' : alert.carpet_days_since_deep_clean > 30 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.carpet_days_since_deep_clean}d carpet</span>
                          )}
                          {alert.slip_resistance_cof != null && alert.slip_resistance_cof > 0 && (
                            <span className={`text-xs ${alert.slip_resistance_cof < 0.4 ? 'text-rose-600 font-medium' : alert.slip_resistance_cof < 0.5 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>COF {alert.slip_resistance_cof.toFixed(2)}</span>
                          )}
                          {alert.is_spill_prone_zone && (
                            <span className="text-xs text-rose-600 font-medium">spill-prone</span>
                          )}
                          {alert.ceiling_height_ft != null && alert.ceiling_height_ft > 0 && (
                            <span className={`text-xs ${alert.ceiling_height_ft < 8 ? 'text-rose-600 font-medium' : alert.ceiling_height_ft < 9 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.ceiling_height_ft} ft ceiling</span>
                          )}
                          {alert.ceiling_type && (
                            <span className="text-xs text-neutral-500 font-medium">{alert.ceiling_type} ceiling</span>
                          )}
                          {alert.has_acoustic_treatment && (
                            <span className="text-xs text-emerald-600 font-medium">acoustic</span>
                          )}
                          {!alert.has_acoustic_treatment && alert.ceiling_type && (alert.ceiling_type === 'exposed' || alert.ceiling_type === 'hard') && (
                            <span className="text-xs text-amber-600 font-medium">no acoustic</span>
                          )}
                          {alert.ceiling_tile_condition_score != null && alert.ceiling_tile_condition_score > 0 && (
                            <span className={`text-xs ${alert.ceiling_tile_condition_score < 50 ? 'text-rose-600 font-medium' : alert.ceiling_tile_condition_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.ceiling_tile_condition_score}/100 tile</span>
                          )}
                          {alert.brand_tier != null && alert.brand_tier > 0 && (
                            <span className={`text-xs ${!alert.flooring_tier_match ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>tier {alert.brand_tier} {alert.flooring_tier_match ? 'match' : 'mismatch'}</span>
                          )}
                          {alert.slip_fall_risk_level && (
                            <span className={`text-xs font-medium ${alert.slip_fall_risk_level === 'critical' ? 'text-rose-600' : alert.slip_fall_risk_level === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>{alert.slip_fall_risk_level} risk</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.perceived_cleanliness_change != null && alert.perceived_cleanliness_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_cleanliness_change}% perceived cleanliness</span>
                          )}
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_satisfaction_change}% satisfaction</span>
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
          <span>Min floor cleanliness: {config.minFloorCleanlinessScore}/100</span>
          <span>Min stain/wear: {config.minFloorStainWearScore}/100</span>
          <span>Min tile grout: {config.minTileGroutConditionScore}/100</span>
          <span>Max carpet clean days: {config.maxCarpetDaysSinceDeepClean}</span>
          <span>Min slip COF: {config.minSlipResistanceCof}</span>
          <span>Min ceiling height: {config.minCeilingHeightFt} ft</span>
          <span>Acoustic treatment: <span className={config.requireAcousticTreatment ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireAcousticTreatment ? 'required' : 'optional'}</span></span>
          <span>Min ceiling tile: {config.minCeilingTileConditionScore}/100</span>
          <span>Tier match: <span className={config.requireFlooringTierMatch ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireFlooringTierMatch ? 'required' : 'optional'}</span></span>
          <span className="text-neutral-400">165th POSR-exclusive differentiator</span>
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

export default FloorCeilingSurfaceScreen;
