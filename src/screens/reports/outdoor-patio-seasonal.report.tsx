/**
 * AI Outdoor Patio & Seasonal Space Optimizer — predicts how outdoor patio
 * and seasonal space utilization (weather readiness, seasonal timing,
 * heating/cooling, shade, rain protection, lighting, pest control, street
 * noise, furniture durability) impacts revenue capture, customer
 * satisfaction, operational efficiency.
 *
 * 162nd POSR-exclusive differentiator.
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
  faUmbrellaBeach, faRotate, faSun, faFire, faCloudRain,
  faLightbulb, faBug, faVolumeHigh, faChair,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runOutdoorPatioEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readOutdoorPatioConfig, DEFAULT_OUTDOOR_PATIO_CONFIG,
  type OutdoorPatioAlert,
} from "@/lib/outdoor-patio-seasonal.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  patio_season_close_too_early:    { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faSun,            label: 'CLOSED EARLY' },
  heating_infrastructure_missing:  { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faFire,           label: 'NO HEATERS' },
  shade_infrastructure_missing:    { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faUmbrellaBeach,  label: 'NO SHADE' },
  rain_protection_absent:          { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faCloudRain,      label: 'NO RAIN COVER' },
  patio_lighting_inadequate:       { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faLightbulb,      label: 'POOR LIGHTING' },
  pest_control_gap:                { bg: 'bg-lime-50',     text: 'text-lime-700',     icon: faBug,            label: 'PEST ISSUES' },
  street_noise_high:               { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faVolumeHigh,     label: 'STREET NOISE' },
  furniture_weather_damage:        { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faChair,          label: 'FURNITURE DAMAGE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthName = (m?: number): string => (m && m > 0 && m <= 12) ? MONTH_NAMES[m - 1] : '—';

export function OutdoorPatioSeasonalScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<OutdoorPatioAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, unheatedZones: 0, earlyCloseZones: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_OUTDOOR_PATIO_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readOutdoorPatioConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[outdoor-patio-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runOutdoorPatioEngine(db, config);
      toast.success(`Analyzed ${result.generated} outdoor patio signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[outdoor-patio-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[outdoor-patio-report] status failed', err);
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
      <DocumentTitle parts={["AI Outdoor Patio & Seasonal Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUmbrellaBeach} className="text-sky-500" />
              AI Outdoor Patio &amp; Seasonal Space Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how patio &amp; seasonal space utilization impacts revenue + satisfaction — patios generate 30-40% more revenue/sqft than indoor (NRA); 60% prefer outdoor seating (OpenTable)
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faUmbrellaBeach} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze patio'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faSun} label="Zones closed early" value={String(summary.earlyCloseZones)} color={summary.earlyCloseZones > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faFire} label="Unheated zones" value={String(summary.unheatedZones)} color={summary.unheatedZones > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Zones at risk" value={String(summary.zonesAtRisk)} color={summary.zonesAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faUmbrellaBeach} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUmbrellaBeach} spin className="text-4xl mb-3" />
            <p>Analyzing outdoor patio &amp; seasonal space opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No outdoor patio alerts</p>
            <p className="text-sm mt-1">Patio season optimized, heaters + shade + rain cover + lighting all in place, pests controlled, noise managed, outdoor-rated furniture.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faUmbrellaBeach, label: alert.rule_id.toUpperCase() };
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
                          {alert.season_close_month != null && alert.season_close_month > 0 && (
                            <span className={`text-xs ${alert.weeks_lost_early && alert.weeks_lost_early > 6 ? 'text-rose-600 font-medium' : 'text-amber-600 font-medium'}`}>closes {monthName(alert.season_close_month)}</span>
                          )}
                          {alert.target_close_month != null && alert.target_close_month > 0 && (
                            <span className="text-xs text-neutral-400">target {monthName(alert.target_close_month)}</span>
                          )}
                          {alert.weeks_lost_early != null && alert.weeks_lost_early > 0 && (
                            <span className="text-xs text-rose-600 font-medium">{alert.weeks_lost_early} wks lost</span>
                          )}
                          {alert.heater_count != null && (
                            <span className={`text-xs ${alert.heater_count === 0 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.heater_count} heaters</span>
                          )}
                          {alert.shade_coverage_pct != null && (
                            <span className={`text-xs ${alert.shade_coverage_pct < 30 ? 'text-rose-600 font-medium' : alert.shade_coverage_pct < 60 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.shade_coverage_pct}% shade</span>
                          )}
                          {alert.rain_protection_pct != null && (
                            <span className={`text-xs ${alert.rain_protection_pct === 0 ? 'text-rose-600 font-medium' : alert.rain_protection_pct < 50 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.rain_protection_pct}% rain cover</span>
                          )}
                          {alert.lighting_score != null && alert.lighting_score > 0 && (
                            <span className={`text-xs ${alert.lighting_score < 40 ? 'text-rose-600 font-medium' : alert.lighting_score < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.lighting_score}/100 lighting</span>
                          )}
                          {alert.pest_incidents_per_week != null && alert.pest_incidents_per_week > 0 && (
                            <span className={`text-xs ${alert.pest_incidents_per_week > 5 ? 'text-rose-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.pest_incidents_per_week} pests/wk</span>
                          )}
                          {alert.street_noise_db != null && alert.street_noise_db > 0 && (
                            <span className={`text-xs ${alert.street_noise_db > 75 ? 'text-rose-600 font-medium' : alert.street_noise_db > 65 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.street_noise_db} dB</span>
                          )}
                          {alert.furniture_age_years != null && alert.furniture_age_years > 0 && (
                            <span className={`text-xs ${alert.furniture_age_years > 4 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.furniture_age_years}y furniture</span>
                          )}
                          {alert.has_heaters && (
                            <span className="text-xs text-emerald-600 font-medium">heated</span>
                          )}
                          {alert.has_shade && (
                            <span className="text-xs text-emerald-600 font-medium">shaded</span>
                          )}
                          {alert.has_rain_cover && (
                            <span className="text-xs text-emerald-600 font-medium">rain cover</span>
                          )}
                          {alert.has_sunset_lighting && (
                            <span className="text-xs text-emerald-600 font-medium">sunset lights</span>
                          )}
                          {alert.has_noise_barrier && (
                            <span className="text-xs text-emerald-600 font-medium">noise barrier</span>
                          )}
                          {alert.furniture_outdoor_rated && (
                            <span className="text-xs text-emerald-600 font-medium">outdoor-rated</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_satisfaction_change} satisfaction</span>
                          )}
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_satisfaction_change} satisfaction</span>
                          )}
                          {alert.predicted_dwell_change_pct != null && alert.predicted_dwell_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_dwell_change_pct}% dwell</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faUmbrellaBeach} className="mt-0.5 shrink-0" />
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
          <span>Min close month: {monthName(config.minSeasonCloseMonth)}</span>
          <span>Min heaters: {config.minHeaterCount}</span>
          <span>Min shade: {config.minShadeCoveragePct}%</span>
          <span>Min rain cover: {config.minRainProtectionPct}%</span>
          <span>Min lighting: {config.minLightingScore}/100</span>
          <span>Max pest/wk: {config.maxPestIncidentsPerWeek}</span>
          <span>Max noise: {config.maxStreetNoiseDb} dB</span>
          <span>Outdoor-rated furniture: <span className={config.requireOutdoorRatedFurniture ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireOutdoorRatedFurniture ? 'required' : 'optional'}</span></span>
          <span className="text-neutral-400">162nd POSR-exclusive differentiator</span>
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

export default OutdoorPatioSeasonalScreen;
