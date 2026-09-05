/**
 * AI WiFi Experience Impact Predictor — predicts how WiFi quality impacts
 * customer satisfaction, dwell time, and spend (especially for business/
 * solo/remote-worker segments).
 *
 * 147th POSR-exclusive differentiator.
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
  faWifi, faRotate, faSignal, faNetworkWired, faTowerBroadcast,
  faLaptop, faBriefcase, faHouseLaptop, faStar, faUserSecret,
  faCheckCircle, faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runWifiEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readWifiConfig, DEFAULT_WIFI_CONFIG,
  type WifiAlert,
} from "@/lib/wifi-experience-impact.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  slow_download_speed:                { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faWifi,           label: 'SLOW SPEED' },
  weak_signal_zone:                   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faSignal,         label: 'WEAK SIGNAL' },
  capacity_congestion_during_peak:    { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faNetworkWired,   label: 'CONGESTION' },
  auth_friction_high:                 { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faLaptop,         label: 'AUTH FRICTION' },
  business_segment_wifi_dependent:    { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faBriefcase,      label: 'BUSINESS DEP' },
  remote_worker_dwell_correlation:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faHouseLaptop,    label: 'REMOTE WORKER' },
  negative_review_wifi_mentions:      { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faStar,           label: 'REVIEWS' },
  bandwidth_hog_pattern:              { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faUserSecret,     label: 'BANDWIDTH HOG' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function WifiExperienceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<WifiAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgDownloadSpeed: 0, totalReviewMentions: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_WIFI_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWifiConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[wifi-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runWifiEngine(db, config);
      toast.success(`Analyzed ${result.generated} WiFi signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[wifi-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[wifi-report] status failed', err);
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
      <DocumentTitle parts={["AI WiFi Experience", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWifi} className="text-sky-500" />
              AI WiFi Experience Impact Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how WiFi quality impacts satisfaction, dwell, spend — business/remote-worker segments highly WiFi-dependent
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faWifi} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze WiFi'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faNetworkWired} label="Zones at risk" value={String(summary.zonesAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faWifi} label="Avg download" value={`${summary.avgDownloadSpeed.toFixed(1)} Mbps`} color={summary.avgDownloadSpeed < 10 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faStar} label="WiFi review mentions" value={String(summary.totalReviewMentions)} color={summary.totalReviewMentions >= 4 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWifi} spin className="text-4xl mb-3" />
            <p>Analyzing WiFi experience impact…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No WiFi experience alerts</p>
            <p className="text-sm mt-1">WiFi strong across all zones, no congestion or auth friction.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faWifi, label: alert.rule_id.toUpperCase() };
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
                          {alert.customer_segment && alert.customer_segment !== 'all' && (
                            <span className="text-xs font-medium text-fuchsia-600 uppercase">{alert.customer_segment}</span>
                          )}
                          {alert.avg_download_mbps != null && (
                            <span className={`text-xs font-bold ${alert.avg_download_mbps < 5 ? 'text-rose-600' : alert.avg_download_mbps < 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {alert.avg_download_mbps.toFixed(1)} Mbps
                            </span>
                          )}
                          {alert.signal_strength_dbm != null && (
                            <span className={`text-xs ${alert.signal_strength_dbm < -80 ? 'text-rose-600 font-medium' : alert.signal_strength_dbm < -67 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>
                              {alert.signal_strength_dbm} dBm
                            </span>
                          )}
                          {alert.concurrent_users != null && alert.max_capacity_users != null && (
                            <span className="text-xs text-neutral-500">{alert.concurrent_users}/{alert.max_capacity_users} users</span>
                          )}
                          {alert.auth_steps != null && (
                            <span className={`text-xs ${alert.auth_steps > 2 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.auth_steps}-step auth</span>
                          )}
                          {alert.auth_abandonment_rate_pct != null && alert.auth_abandonment_rate_pct > 0 && (
                            <span className="text-xs text-rose-600">{alert.auth_abandonment_rate_pct.toFixed(0)}% abandon</span>
                          )}
                          {alert.negative_review_mentions != null && alert.negative_review_mentions > 0 && (
                            <span className="text-xs text-fuchsia-600 font-medium">{alert.negative_review_mentions} reviews</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.avg_dwell_with_strong_wifi != null && alert.avg_dwell_with_weak_wifi != null && (
                            <span>
                              dwell: <span className="text-rose-600">{alert.avg_dwell_with_weak_wifi}min</span>
                              <span className="text-neutral-400 mx-1">→</span>
                              <span className="text-emerald-600 font-medium">{alert.avg_dwell_with_strong_wifi}min</span>
                              <span className="text-emerald-600 ml-1">(+{alert.avg_dwell_with_strong_wifi - alert.avg_dwell_with_weak_wifi}min)</span>
                            </span>
                          )}
                          {alert.avg_spend_with_strong_wifi != null && alert.avg_spend_with_weak_wifi != null && (
                            <span>
                              spend: <span className="text-rose-600">{fmt$(alert.avg_spend_with_weak_wifi)}</span>
                              <span className="text-neutral-400 mx-1">→</span>
                              <span className="text-emerald-600 font-medium">{fmt$(alert.avg_spend_with_strong_wifi)}</span>
                            </span>
                          )}
                          {alert.bandwidth_hog_user_count != null && alert.bandwidth_hog_user_count > 0 && (
                            <span className="text-yellow-600">{alert.bandwidth_hog_user_count} hog(s) using {alert.bandwidth_hog_consumption_pct?.toFixed(0)}%</span>
                          )}
                          {alert.predicted_dwell_increase_min != null && alert.predicted_dwell_increase_min > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_dwell_increase_min}min dwell potential</span>
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
          <span>Min speed: {config.minDownloadSpeedMbps} Mbps</span>
          <span>Min signal: {config.minSignalDbm} dBm</span>
          <span>Max auth steps: {config.maxAuthSteps}</span>
          <span>Congestion: ≥{config.congestionThresholdPct}%</span>
          <span className="text-neutral-400">147th POSR-exclusive differentiator</span>
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

export default WifiExperienceScreen;
