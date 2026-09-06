/**
 * AI Air Quality & Ventilation Optimizer — predicts how indoor air quality
 * (CO2 levels, ventilation rate, air filter condition, humidity, VOCs from
 * cooking, particulate matter, odor control, HEPA air purifier deployment)
 * impacts customer comfort, perceived cleanliness, dwell time, staff
 * productivity, and health compliance.
 *
 * 163rd POSR-exclusive differentiator.
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
  faWind, faRotate, faSmog, faFan, faFilter, faDroplet,
  faSprayCan, faLungs, faVirus,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runAirQualityEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readAirQualityConfig, DEFAULT_AIR_QUALITY_CONFIG,
  type AirQualityAlert,
} from "@/lib/air-quality-ventilation.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  co2_level_high:                  { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faSmog,      label: 'HIGH CO2' },
  ventilation_rate_insufficient:   { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faFan,       label: 'LOW ACH' },
  air_filter_overdue:              { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faFilter,    label: 'FILTER OVERDUE' },
  voc_from_kitchen_escaping:       { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faLungs,     label: 'KITCHEN VOC LEAK' },
  humidity_out_of_range:           { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faDroplet,   label: 'HUMIDITY OFF' },
  odor_control_gap:                { bg: 'bg-lime-50',     text: 'text-lime-700',     icon: faSprayCan,  label: 'ODOR GAP' },
  air_purifier_missing:            { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faVirus,     label: 'NO HEPA' },
  particulate_matter_high:         { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faWind,      label: 'HIGH PM2.5' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function AirQualityVentilationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<AirQualityAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, highCo2Zones: 0, noPurifierZones: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_AIR_QUALITY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readAirQualityConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[air-quality-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runAirQualityEngine(db, config);
      toast.success(`Analyzed ${result.generated} air quality signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[air-quality-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[air-quality-report] status failed', err);
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
      <DocumentTitle parts={["AI Air Quality & Ventilation Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWind} className="text-sky-500" />
              AI Air Quality &amp; Ventilation Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how indoor air quality (CO2, ACH, filter, humidity, VOCs, PM2.5, odor, HEPA) impacts comfort + dwell + cleanliness — poor IAQ reduces dwell 15-25% (EPA); 78% consider air quality post-COVID (McKinsey 2023)
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faWind} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze air'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faSmog} label="High CO2 zones" value={String(summary.highCo2Zones)} color={summary.highCo2Zones > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faVirus} label="No HEPA zones" value={String(summary.noPurifierZones)} color={summary.noPurifierZones > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Zones at risk" value={String(summary.zonesAtRisk)} color={summary.zonesAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faWind} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWind} spin className="text-4xl mb-3" />
            <p>Analyzing indoor air quality &amp; ventilation opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No air quality alerts</p>
            <p className="text-sm mt-1">CO2 below 1000ppm, ACH above 6, filters fresh, humidity 30-60%, no kitchen VOC leak, odors controlled, HEPA purifiers deployed, PM2.5 below 35.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faWind, label: alert.rule_id.toUpperCase() };
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
                          {alert.co2_ppm != null && alert.co2_ppm > 0 && (
                            <span className={`text-xs ${alert.co2_ppm > 1500 ? 'text-rose-600 font-medium' : alert.co2_ppm > 1000 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.co2_ppm} ppm CO2</span>
                          )}
                          {alert.air_changes_per_hour != null && alert.air_changes_per_hour > 0 && (
                            <span className={`text-xs ${alert.air_changes_per_hour < 3 ? 'text-rose-600 font-medium' : alert.air_changes_per_hour < 6 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.air_changes_per_hour} ACH</span>
                          )}
                          {alert.filter_age_months != null && alert.filter_age_months > 0 && (
                            <span className={`text-xs ${alert.filter_age_months > 6 ? 'text-rose-600 font-medium' : alert.filter_age_months > 3 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.filter_age_months}mo filter</span>
                          )}
                          {alert.voc_dining_ppb != null && alert.voc_dining_ppb > 0 && (
                            <span className={`text-xs ${alert.voc_dining_ppb > 400 ? 'text-rose-600 font-medium' : alert.voc_dining_ppb > 200 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.voc_dining_ppb} ppb VOC</span>
                          )}
                          {alert.humidity_pct != null && alert.humidity_pct > 0 && (
                            <span className={`text-xs ${alert.humidity_pct < 30 || alert.humidity_pct > 60 ? 'text-rose-600 font-medium' : alert.humidity_pct < 35 || alert.humidity_pct > 55 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.humidity_pct}% RH</span>
                          )}
                          {alert.odor_score != null && alert.odor_score > 0 && (
                            <span className={`text-xs ${alert.odor_score < 40 ? 'text-rose-600 font-medium' : alert.odor_score < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.odor_score}/100 odor</span>
                          )}
                          {alert.pm25_ug_m3 != null && alert.pm25_ug_m3 > 0 && (
                            <span className={`text-xs ${alert.pm25_ug_m3 > 55 ? 'text-rose-600 font-medium' : alert.pm25_ug_m3 > 35 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.pm25_ug_m3} PM2.5</span>
                          )}
                          {alert.filter_efficiency_loss_pct != null && alert.filter_efficiency_loss_pct > 0 && (
                            <span className="text-xs text-amber-600 font-medium">-{alert.filter_efficiency_loss_pct}% HVAC</span>
                          )}
                          {alert.has_hepa_purifier && (
                            <span className="text-xs text-emerald-600 font-medium">HEPA</span>
                          )}
                          {alert.has_odor_neutralizer && (
                            <span className="text-xs text-emerald-600 font-medium">odor ctrl</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_dwell_change_pct != null && alert.predicted_dwell_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_dwell_change_pct}% dwell</span>
                          )}
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_satisfaction_change} satisfaction</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLungs} className="mt-0.5 shrink-0" />
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
          <span>Max CO2: {config.maxCo2Ppm} ppm</span>
          <span>Min ACH: {config.minAirChangesPerHour}</span>
          <span>Max filter age: {config.maxFilterAgeMonths} mo</span>
          <span>Max VOC: {config.maxVocDiningPpb} ppb</span>
          <span>Humidity range: {config.minHumidityPct}-{config.maxHumidityPct}%</span>
          <span>Min odor score: {config.minOdorScore}/100</span>
          <span>Max PM2.5: {config.maxPm25UgM3} μg/m3</span>
          <span>HEPA purifier: <span className={config.requireHepaPurifier ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireHepaPurifier ? 'required' : 'optional'}</span></span>
          <span className="text-neutral-400">163rd POSR-exclusive differentiator</span>
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

export default AirQualityVentilationScreen;
