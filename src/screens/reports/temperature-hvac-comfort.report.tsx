/**
 * AI Temperature & HVAC Comfort Optimizer — predicts optimal temperature per
 * zone + time-of-day, detects HVAC inefficiencies (cold spots, hot spots,
 * drafts, humidity imbalance).
 *
 * 151st POSR-exclusive differentiator.
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
  faTemperatureHalf, faRotate, faLayerGroup, faDroplet, faWind,
  faGaugeHigh, faCalendarAlt, faFire, faSnowflake, faCheckCircle,
  faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runTempEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readTempConfig, DEFAULT_TEMP_CONFIG,
  type TempAlert,
} from "@/lib/temperature-hvac-comfort.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  zone_temperature_mismatch:        { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTemperatureHalf,  label: 'ZONE MISMATCH' },
  humidity_out_of_range:            { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faDroplet,          label: 'HUMIDITY' },
  draft_detected:                   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faWind,             label: 'DRAFT' },
  hvac_oversized_cycling:           { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faGaugeHigh,        label: 'OVERSIZED' },
  seasonal_adjustment_needed:       { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faCalendarAlt,      label: 'SEASONAL' },
  thermostat_schedule_missing:      { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faCalendarAlt,      label: 'SCHEDULE' },
  kitchen_heat_bleed:               { bg: 'bg-red-50',     text: 'text-red-700',     icon: faFire,             label: 'KITCHEN BLEED' },
  peak_load_anticipation:           { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faSnowflake,        label: 'PEAK LOAD' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function TemperatureHvacComfortScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<TempAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgTempDeviationC: 0, avgHumidityPct: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TEMP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTempConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[temp-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTempEngine(db, config);
      toast.success(`Analyzed ${result.generated} temperature signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[temp-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[temp-report] status failed', err);
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
      <DocumentTitle parts={["AI Temperature HVAC", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTemperatureHalf} className="text-orange-500" />
              AI Temperature & HVAC Comfort Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts optimal temp per zone, detects HVAC inefficiencies, drafts, humidity, kitchen heat bleed
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faTemperatureHalf} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze temperature'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faLayerGroup} label="Zones at risk" value={String(summary.zonesAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faTemperatureHalf} label="Avg temp deviation" value={`${summary.avgTempDeviationC.toFixed(1)}°C`} color={summary.avgTempDeviationC >= 3 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faDroplet} label="Avg humidity" value={`${summary.avgHumidityPct.toFixed(0)}%`} color={summary.avgHumidityPct < 30 || summary.avgHumidityPct > 60 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTemperatureHalf} spin className="text-4xl mb-3" />
            <p>Analyzing temperature & HVAC comfort patterns…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No temperature alerts</p>
            <p className="text-sm mt-1">Temperature optimal across all zones.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faTemperatureHalf, label: alert.rule_id.toUpperCase() };
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
                          {alert.current_temp_c != null && alert.target_temp_c != null && (
                            <span className="text-xs">
                              <span className={alert.temp_deviation_c && alert.temp_deviation_c >= 4 ? 'text-rose-600 font-bold' : 'text-amber-600 font-medium'}>{alert.current_temp_c}°C</span>
                              <span className="text-neutral-400 mx-1">→</span>
                              <span className="text-emerald-600 font-medium">{alert.target_temp_c}°C</span>
                            </span>
                          )}
                          {alert.temp_deviation_c != null && alert.temp_deviation_c > 0 && (
                            <span className={`text-xs font-bold ${alert.temp_deviation_c >= 4 ? 'text-rose-600' : 'text-amber-600'}`}>±{alert.temp_deviation_c.toFixed(1)}°C</span>
                          )}
                          {alert.current_humidity_pct != null && (
                            <span className={`text-xs ${alert.current_humidity_pct < 30 || alert.current_humidity_pct > 60 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.current_humidity_pct}% humidity</span>
                          )}
                          {alert.hvac_cycle_count_per_hour != null && alert.hvac_cycle_count_per_hour > 0 && (
                            <span className={`text-xs ${alert.hvac_cycle_count_per_hour > 4 ? 'text-violet-600 font-medium' : 'text-neutral-500'}`}>{alert.hvac_cycle_count_per_hour} cycles/hr</span>
                          )}
                          {alert.draft_detected && (
                            <span className="text-xs text-amber-600 font-medium">draft from {alert.draft_source}</span>
                          )}
                          {alert.current_season && (
                            <span className="text-xs text-orange-600 uppercase">{alert.current_season}</span>
                          )}
                          {alert.kitchen_temp_c != null && alert.dining_temp_c != null && alert.kitchen_temp_c > 0 && (
                            <span className="text-xs text-red-600">kitchen {alert.kitchen_temp_c}°C → dining {alert.dining_temp_c}°C</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_dwell_change_min != null && alert.predicted_dwell_change_min > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_dwell_change_min}min dwell potential</span>
                          )}
                          {alert.predicted_spend_change_pct != null && alert.predicted_spend_change_pct > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_spend_change_pct}% spend</span>
                          )}
                          {alert.predicted_load_btuh != null && alert.hvac_capacity_btuh != null && alert.predicted_load_btuh > 0 && (
                            <span>load: <span className="text-amber-600 font-medium">{alert.predicted_load_btuh}/{alert.hvac_capacity_btuh} BTU/h</span></span>
                          )}
                          {alert.predicted_outdoor_temp_c != null && (
                            <span>outdoor: <span className="text-neutral-700">{alert.predicted_outdoor_temp_c}°C</span></span>
                          )}
                          {alert.predicted_occupancy != null && alert.predicted_occupancy > 0 && (
                            <span>occupancy: <span className="text-neutral-700">{alert.predicted_occupancy}</span></span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-orange-50 border border-orange-200 rounded px-3 py-2 text-xs text-orange-800 flex items-start gap-2">
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
          <span>Summer target: {config.summerTargetC}°C</span>
          <span>Winter target: {config.winterTargetC}°C</span>
          <span>Humidity: {config.minHumidityPct}-{config.maxHumidityPct}%</span>
          <span>Max cycles: {config.maxCyclesPerHour}/hr</span>
          <span>Peak load: ≥{config.peakLoadThresholdPct}%</span>
          <span className="text-neutral-400">151st POSR-exclusive differentiator</span>
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

export default TemperatureHvacComfortScreen;
