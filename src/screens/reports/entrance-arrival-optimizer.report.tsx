/**
 * AI Entrance & Arrival Experience Optimizer — predicts optimal entrance
 * experience (greeting speed, host positioning, entry atmosphere).
 *
 * 153rd POSR-exclusive differentiator.
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
  faDoorOpen, faRotate, faClock, faUserGroup, faLayerGroup,
  faHourglassHalf, faCrown, faBroom, faCloudSun, faUsers,
  faCheckCircle, faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runEntranceEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readEntranceConfig, DEFAULT_ENTRANCE_CONFIG,
  type EntranceAlert,
} from "@/lib/entrance-arrival-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  greeting_delay_critical:         { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faClock,             label: 'GREETING DELAY' },
  host_understaffed_peak:          { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUserGroup,         label: 'HOST STAFF' },
  entry_atmosphere_mismatch:       { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faLayerGroup,        label: 'ATMOSPHERE' },
  waitlist_perception_negative:    { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faHourglassHalf,     label: 'WAITLIST' },
  vip_arrival_unrecognized:        { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faCrown,             label: 'VIP' },
  entrance_clutter:                { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faBroom,             label: 'CLUTTER' },
  weather_entrance_adjustment:     { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faCloudSun,          label: 'WEATHER' },
  segment_specific_greeting:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faUsers,             label: 'SEGMENT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function EntranceArrivalOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<EntranceAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgGreetingTimeSec: 0, totalWalkAways30d: 0, avgVipRecognitionPct: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ENTRANCE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readEntranceConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[entrance-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runEntranceEngine(db, config);
      toast.success(`Analyzed ${result.generated} entrance signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[entrance-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[entrance-report] status failed', err);
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
      <DocumentTitle parts={["AI Entrance Arrival", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faDoorOpen} className="text-sky-500" />
              AI Entrance & Arrival Experience Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts optimal entrance experience — 7 seconds form first impression, 33% leave if not greeted in 30s
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faDoorOpen} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze entrance'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faClock} label="Avg greeting time" value={`${summary.avgGreetingTimeSec.toFixed(0)}s`} color={summary.avgGreetingTimeSec >= 30 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Walk-aways (30d)" value={String(summary.totalWalkAways30d)} color={summary.totalWalkAways30d >= 15 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faCrown} label="VIP recognition" value={`${summary.avgVipRecognitionPct.toFixed(0)}%`} color={summary.avgVipRecognitionPct >= 90 ? 'text-emerald-600' : 'text-rose-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faDoorOpen} spin className="text-4xl mb-3" />
            <p>Analyzing entrance & arrival experience…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No entrance alerts</p>
            <p className="text-sm mt-1">Entrance experience optimized — fast greetings, well-staffed, aligned atmosphere.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faDoorOpen, label: alert.rule_id.toUpperCase() };
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
                          {alert.time_of_day && alert.time_of_day !== 'all' && (
                            <span className="text-xs font-medium text-amber-600">@ {alert.time_of_day}</span>
                          )}
                          {alert.customer_segment && alert.customer_segment !== 'all' && (
                            <span className="text-xs font-medium text-emerald-600 uppercase">{alert.customer_segment}</span>
                          )}
                          {alert.weather && alert.weather !== 'sunny' && (
                            <span className="text-xs text-sky-600">{alert.weather}</span>
                          )}
                          {alert.avg_greeting_time_sec != null && (
                            <span className={`text-xs font-bold ${alert.avg_greeting_time_sec >= 60 ? 'text-rose-600' : alert.avg_greeting_time_sec >= 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {alert.avg_greeting_time_sec}s greeting
                            </span>
                          )}
                          {alert.greeting_delay_pct != null && alert.greeting_delay_pct > 0 && (
                            <span className="text-xs text-rose-600">{alert.greeting_delay_pct}% delayed</span>
                          )}
                          {alert.walk_away_count_30d != null && alert.walk_away_count_30d > 0 && (
                            <span className="text-xs text-rose-600 font-medium">{alert.walk_away_count_30d} walk-aways/30d</span>
                          )}
                          {alert.host_count != null && (
                            <span className="text-xs text-neutral-500">{alert.host_count} host(s)</span>
                          )}
                          {alert.vip_recognition_rate_pct != null && (
                            <span className={`text-xs ${alert.vip_recognition_rate_pct < 90 ? 'text-rose-600 font-medium' : 'text-emerald-600'}`}>{alert.vip_recognition_rate_pct}% VIP recog</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.peak_arrival_rate_per_min != null && (
                            <span>peak: <span className="text-neutral-700">{alert.peak_arrival_rate_per_min}/min</span></span>
                          )}
                          {alert.avg_quoted_wait_min != null && (
                            <span>quoted wait: <span className="text-amber-600 font-medium">{alert.avg_quoted_wait_min}min</span></span>
                          )}
                          {alert.waitlist_bail_rate_pct != null && alert.waitlist_bail_rate_pct > 0 && (
                            <span className="text-rose-600">{alert.waitlist_bail_rate_pct}% bail</span>
                          )}
                          {alert.vip_arrivals_today != null && alert.vip_arrivals_today > 0 && (
                            <span className="text-fuchsia-600">{alert.vip_arrivals_today} VIP today</span>
                          )}
                          {alert.predicted_satisfaction_drop != null && alert.predicted_satisfaction_drop > 0 && (
                            <span className="text-rose-600">−{alert.predicted_satisfaction_drop.toFixed(0)}pts sat</span>
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
          <span>Max greeting: {config.maxGreetingTimeSec}s</span>
          <span>Host capacity: {config.singleHostMaxArrivalsPerMin}/min</span>
          <span>Walk-away threshold: {config.walkAwayThresholdPerMo}/mo</span>
          <span>VIP target: {config.vipRecognitionTargetPct}%</span>
          <span className="text-neutral-400">153rd POSR-exclusive differentiator</span>
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

export default EntranceArrivalOptimizerScreen;
