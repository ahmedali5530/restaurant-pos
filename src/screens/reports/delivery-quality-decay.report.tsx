/**
 * AI Delivery Hot-Food Quality Decay Predictor — predicts whether delivered
 * food arrives at acceptable quality (temp, texture, integrity) and recommends
 * pre-emptive packaging / pickup / recipe actions.
 *
 * 144th POSR-exclusive differentiator.
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
  faTruckFast, faRotate, faTemperatureHalf, faDroplet, faBowlRice,
  faRoute, faClock, faFire, faSnowflake, faBox, faCheckCircle,
  faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runDelivDecayEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readDelivDecayConfig, DEFAULT_DELIVDECAY_CONFIG,
  type DelivDecayAlert,
} from "@/lib/delivery-quality-decay.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  temperature_decay_critical:    { bg: 'bg-rose-50',    text: 'text-rose-700',   icon: faTemperatureHalf, label: 'TEMP DECAY' },
  sogginess_predicted:            { bg: 'bg-amber-50',   text: 'text-amber-700',  icon: faDroplet,         label: 'SOGGY' },
  structural_failure_predicted:   { bg: 'bg-red-50',     text: 'text-red-700',    icon: faBowlRice,        label: 'STRUCTURAL' },
  delivery_distance_excessive:    { bg: 'bg-violet-50',  text: 'text-violet-700', icon: faRoute,           label: 'DISTANCE' },
  prep_to_pickup_delay:           { bg: 'bg-yellow-50',  text: 'text-yellow-700', icon: faClock,           label: 'PICKUP DELAY' },
  ambient_heat_risk:              { bg: 'bg-orange-50',  text: 'text-orange-700', icon: faFire,            label: 'HEAT RISK' },
  cold_ambient_sensitivity:       { bg: 'bg-sky-50',     text: 'text-sky-700',    icon: faSnowflake,       label: 'COLD AMBIENT' },
  packaging_quality_mismatch:     { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700',icon: faBox,             label: 'PACKAGING' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function DeliveryQualityDecayScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<DelivDecayAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, dishesAtRisk: 0, avgQualityScore: 0, avgComplaintRate: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_DELIVDECAY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readDelivDecayConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[delivdecay-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runDelivDecayEngine(db, config);
      toast.success(`Analyzed ${result.generated} delivery quality signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[delivdecay-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[delivdecay-report] status failed', err);
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
      <DocumentTitle parts={["AI Delivery Quality Decay", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTruckFast} className="text-rose-500" />
              AI Delivery Hot-Food Quality Decay Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts whether delivered food arrives at acceptable quality — temp, texture, structural integrity
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faTruckFast} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze quality'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faBowlRice} label="Dishes at risk" value={String(summary.dishesAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faTemperatureHalf} label="Avg quality score" value={`${summary.avgQualityScore.toFixed(0)}/100`} color={summary.avgQualityScore >= 60 ? 'text-emerald-600' : 'text-rose-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Avg complaint rate" value={`${summary.avgComplaintRate.toFixed(0)}%`} color={summary.avgComplaintRate >= 15 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTruckFast} spin className="text-4xl mb-3" />
            <p>Analyzing delivery quality decay patterns…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No delivery quality alerts</p>
            <p className="text-sm mt-1">All dishes predicted to arrive at acceptable quality.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faTruckFast, label: alert.rule_id.toUpperCase() };
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
                          {alert.dish_name && (
                            <span className="text-sm font-semibold text-neutral-800">{alert.dish_name}</span>
                          )}
                          {alert.dish_category && (
                            <span className="text-xs text-neutral-500 uppercase">{alert.dish_category}</span>
                          )}
                          {alert.platform && (
                            <span className="text-xs text-neutral-400">via {alert.platform}</span>
                          )}
                          {alert.predicted_arrival_temp_c != null && (
                            <span className={`text-xs font-bold ${alert.predicted_arrival_temp_c < 50 ? 'text-rose-600' : alert.predicted_arrival_temp_c < 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {alert.predicted_arrival_temp_c.toFixed(0)}°C arrival
                            </span>
                          )}
                          {alert.quality_score_predicted != null && (
                            <span className={`text-xs font-bold ${alert.quality_score_predicted < 40 ? 'text-rose-600' : alert.quality_score_predicted < 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {alert.quality_score_predicted.toFixed(0)}/100 quality
                            </span>
                          )}
                          {alert.current_complaint_rate_pct != null && alert.current_complaint_rate_pct > 0 && (
                            <span className="text-xs text-rose-600">{alert.current_complaint_rate_pct.toFixed(0)}% complaints</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.delivery_distance_km != null && (
                            <span>distance: <span className={alert.delivery_distance_km >= 8 ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.delivery_distance_km}km</span></span>
                          )}
                          {alert.predicted_travel_time_min != null && (
                            <span>travel: <span className="text-neutral-700">{alert.predicted_travel_time_min}min</span></span>
                          )}
                          {alert.ambient_temp_c != null && (
                            <span>ambient: <span className={alert.ambient_temp_c >= 30 ? 'text-rose-600 font-medium' : alert.ambient_temp_c <= 5 ? 'text-sky-600 font-medium' : 'text-neutral-700'}>{alert.ambient_temp_c}°C</span></span>
                          )}
                          {alert.prep_to_pickup_minutes != null && (
                            <span>prep→pickup: <span className={alert.prep_to_pickup_minutes >= 10 ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.prep_to_pickup_minutes}min</span></span>
                          )}
                          {alert.current_packaging_type && alert.recommended_packaging && alert.current_packaging_type !== alert.recommended_packaging && (
                            <span>
                              packaging: <span className="text-rose-600">{alert.current_packaging_type}</span>
                              <span className="text-neutral-400 mx-1">→</span>
                              <span className="text-emerald-600 font-medium">{alert.recommended_packaging}</span>
                            </span>
                          )}
                          {alert.monthly_orders != null && (
                            <span>{alert.monthly_orders}/mo</span>
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
          <span>Critical temp: &lt;{config.criticalTempThreshold}°C</span>
          <span>Excessive distance: ≥{config.excessiveDistanceKm}km</span>
          <span>Pickup delay: ≥{config.prepToPickupDelayMin}min</span>
          <span>Heat risk: ≥{config.ambientHeatThreshold}°C</span>
          <span>Cold sensitivity: ≤{config.coldAmbientThreshold}°C</span>
          <span className="text-neutral-400">144th POSR-exclusive differentiator</span>
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

export default DeliveryQualityDecayScreen;
