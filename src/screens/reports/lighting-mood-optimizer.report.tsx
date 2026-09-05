/**
 * AI Lighting Mood Optimizer — predicts optimal lighting (lux, Kelvin, dimming
 * schedule) per zone based on time-of-day, weather, segment, occasion.
 *
 * 150th POSR-exclusive differentiator.
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
  faLightbulb, faRotate, faClock, faTemperatureHalf, faCamera,
  faEye, faLayerGroup, faCloudSun, faMoneyBill, faCalendarAlt,
  faCheckCircle, faTriangleExclamation, faSun,
} from "@fortawesome/free-solid-svg-icons";
import {
  runLightingEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readLightingConfig, DEFAULT_LIGHTING_CONFIG,
  type LightingAlert,
} from "@/lib/lighting-mood-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  time_of_day_mismatch:                { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,             label: 'TIME MISMATCH' },
  color_temperature_wrong:             { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faTemperatureHalf,   label: 'KELVIN' },
  insufficient_for_food_photography:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faCamera,            label: 'PHOTOGRAPHY' },
  glare_on_screens:                    { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faEye,               label: 'GLARE' },
  zone_lighting_mismatch:              { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faLayerGroup,        label: 'ZONE' },
  weather_compensation_needed:         { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: faCloudSun,          label: 'WEATHER' },
  led_upgrade_roi:                     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faMoneyBill,         label: 'LED ROI' },
  dimming_schedule_missing:            { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faCalendarAlt,       label: 'SCHEDULE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function LightingMoodOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<LightingAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgLux: 0, totalLedSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_LIGHTING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readLightingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[lighting-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runLightingEngine(db, config);
      toast.success(`Analyzed ${result.generated} lighting signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[lighting-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[lighting-report] status failed', err);
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
      <DocumentTitle parts={["AI Lighting Mood Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLightbulb} className="text-amber-500" />
              AI Lighting Mood Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts optimal lighting (lux, Kelvin, dimming schedule) per zone — 65% say lighting affects dining (NRA)
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze lighting'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faLayerGroup} label="Zones at risk" value={String(summary.zonesAtRisk)} color="text-amber-600" />
          <SummaryCard icon={faSun} label="Avg lux" value={summary.avgLux.toFixed(0)} color="text-amber-600" />
          <SummaryCard icon={faMoneyBill} label="LED savings/yr" value={fmt$(summary.totalLedSavings)} color="text-emerald-600" />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLightbulb} spin className="text-4xl mb-3" />
            <p>Analyzing lighting mood optimization opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No lighting alerts</p>
            <p className="text-sm mt-1">Lighting optimal across all zones and time-of-day.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faLightbulb, label: alert.rule_id.toUpperCase() };
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
                          {alert.time_of_day && alert.time_of_day !== 'all' && (
                            <span className="text-xs font-medium text-amber-600">@ {alert.time_of_day}</span>
                          )}
                          {alert.weather && alert.weather !== 'all' && (
                            <span className="text-xs text-sky-600">{alert.weather}</span>
                          )}
                          {alert.current_lux != null && alert.target_lux != null && (
                            <span className="text-xs">
                              <span className="text-rose-600">{alert.current_lux} lux</span>
                              <span className="text-neutral-400 mx-1">→</span>
                              <span className="text-emerald-600 font-medium">{alert.target_lux} lux</span>
                            </span>
                          )}
                          {alert.current_kelvin != null && alert.target_kelvin != null && alert.current_kelvin > 0 && (
                            <span className="text-xs">
                              <span className="text-rose-600">{alert.current_kelvin}K</span>
                              <span className="text-neutral-400 mx-1">→</span>
                              <span className="text-emerald-600 font-medium">{alert.target_kelvin}K</span>
                            </span>
                          )}
                          {alert.led_roi_months != null && (
                            <span className="text-xs text-emerald-600 font-medium">ROI {alert.led_roi_months}mo</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_dwell_change_min != null && alert.predicted_dwell_change_min !== 0 && (
                            <span className={alert.predicted_dwell_change_min > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {alert.predicted_dwell_change_min > 0 ? '+' : ''}{alert.predicted_dwell_change_min}min dwell
                            </span>
                          )}
                          {alert.predicted_spend_change_pct != null && alert.predicted_spend_change_pct !== 0 && (
                            <span className={alert.predicted_spend_change_pct > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              {alert.predicted_spend_change_pct > 0 ? '+' : ''}{alert.predicted_spend_change_pct}% spend
                            </span>
                          )}
                          {alert.predicted_photo_sharing_lift_pct != null && alert.predicted_photo_sharing_lift_pct > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_photo_sharing_lift_pct}pp photo sharing</span>
                          )}
                          {alert.led_upgrade_cost != null && alert.led_upgrade_cost > 0 && (
                            <span>cost: <span className="text-neutral-700 font-medium">{fmt$(alert.led_upgrade_cost)}</span></span>
                          )}
                          {alert.led_annual_savings != null && alert.led_annual_savings > 0 && (
                            <span className="text-emerald-600 font-medium">+{fmt$(alert.led_annual_savings)}/yr savings</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
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
          <span>Breakfast: {config.breakfastLux} lux / {config.breakfastKelvin}K</span>
          <span>Lunch: {config.lunchLux} lux</span>
          <span>Dinner: {config.dinnerLux} lux / {config.dinnerKelvin}K</span>
          <span>Late night: {config.lateNightLux} lux</span>
          <span>Photo min: {config.photographyMinLux} lux</span>
          <span className="text-neutral-400">150th POSR-exclusive differentiator</span>
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

export default LightingMoodOptimizerScreen;
