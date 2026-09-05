/**
 * AI Restroom Cleanliness Impact Predictor — predicts how restroom cleanliness
 * impacts customer satisfaction + return likelihood.
 *
 * 146th POSR-exclusive differentiator.
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
  faRestroom, faRotate, faClock, faTriangleExclamation, faBoxOpen,
  faUsers, faTrafficLight, faStar, faBroom, faCheckCircle, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runRestroomEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readRestroomConfig, DEFAULT_RESTROOM_CONFIG,
  type RestroomAlert,
} from "@/lib/restroom-cleanliness-impact.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  check_frequency_low:                { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,           label: 'CHECK FREQ' },
  customer_complaint_spike:           { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'COMPLAINTS' },
  peak_usage_understocked:            { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faBoxOpen,         label: 'UNDERSTOCKED' },
  cleanliness_degradation_during_rush:{ bg: 'bg-red-50',     text: 'text-red-700',     icon: faBroom,           label: 'DEGRADING' },
  high_traffic_undercleaned:          { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faUsers,           label: 'TRAFFIC' },
  negative_review_correlation:        { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faStar,            label: 'REVIEWS' },
  supply_runout_pattern:              { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faBoxOpen,         label: 'SUPPLY RUNOUT' },
  peak_hour_check_missed:             { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTrafficLight,    label: 'PEAK MISS' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function RestroomCleanlinessScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<RestroomAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgCheckIntervalMin: 0, totalComplaints7d: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_RESTROOM_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readRestroomConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[restroom-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runRestroomEngine(db, config);
      toast.success(`Analyzed ${result.generated} restroom signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[restroom-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[restroom-report] status failed', err);
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
      <DocumentTitle parts={["AI Restroom Cleanliness", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faRestroom} className="text-sky-500" />
              AI Restroom Cleanliness Impact Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how restroom cleanliness impacts satisfaction + return likelihood — 88% of customers equate restroom with kitchen
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faRestroom} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze cleanliness'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faRestroom} label="Zones at risk" value={String(summary.zonesAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faClock} label="Avg check interval" value={`${summary.avgCheckIntervalMin.toFixed(0)}min`} color={summary.avgCheckIntervalMin >= 150 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Complaints (7d)" value={String(summary.totalComplaints7d)} color={summary.totalComplaints7d >= 5 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRestroom} spin className="text-4xl mb-3" />
            <p>Analyzing restroom cleanliness impact…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No restroom alerts</p>
            <p className="text-sm mt-1">All restrooms checked on schedule, supplies stocked, no complaints.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faRestroom, label: alert.rule_id.toUpperCase() };
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
                          {alert.restroom_zone && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.restroom_zone} restroom</span>
                          )}
                          {alert.time_of_day && (
                            <span className="text-xs font-medium text-amber-600">@ {alert.time_of_day}</span>
                          )}
                          {alert.last_check_minutes_ago != null && (
                            <span className={`text-xs font-bold ${alert.last_check_minutes_ago >= 180 ? 'text-rose-600' : alert.last_check_minutes_ago >= 120 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              last check {alert.last_check_minutes_ago}min ago
                            </span>
                          )}
                          {alert.avg_check_interval_minutes != null && alert.target_check_interval_minutes != null && (
                            <span className="text-xs">
                              interval: <span className={alert.avg_check_interval_minutes > alert.target_check_interval_minutes ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.avg_check_interval_minutes}min</span>
                              <span className="text-neutral-400 mx-1">/ target</span>
                              <span className="text-neutral-700">{alert.target_check_interval_minutes}min</span>
                            </span>
                          )}
                          {alert.complaints_last_7d != null && alert.complaints_last_7d > 0 && (
                            <span className="text-xs text-rose-600 font-medium">{alert.complaints_last_7d} complaints/7d</span>
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
                          {alert.customers_since_last_clean != null && alert.target_customers_per_clean != null && (
                            <span>
                              customers: <span className={alert.customers_since_last_clean >= alert.target_customers_per_clean ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.customers_since_last_clean}</span>
                              <span className="text-neutral-400 mx-1">/ target</span>
                              <span className="text-neutral-700">{alert.target_customers_per_clean}</span>
                            </span>
                          )}
                          {alert.paper_towel_pct != null && (
                            <span>paper: <span className={alert.paper_towel_pct < 30 ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.paper_towel_pct}%</span></span>
                          )}
                          {alert.soap_pct != null && (
                            <span>soap: <span className={alert.soap_pct < 30 ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.soap_pct}%</span></span>
                          )}
                          {alert.toilet_paper_pct != null && (
                            <span>TP: <span className={alert.toilet_paper_pct < 30 ? 'text-rose-600 font-medium' : 'text-neutral-700'}>{alert.toilet_paper_pct}%</span></span>
                          )}
                          {alert.current_traffic_per_hour != null && (
                            <span>traffic: <span className="text-neutral-700">{alert.current_traffic_per_hour}/hr</span></span>
                          )}
                          {alert.predicted_satisfaction_drop != null && alert.predicted_satisfaction_drop > 0 && (
                            <span className="text-rose-600">−{alert.predicted_satisfaction_drop.toFixed(0)} pts sat</span>
                          )}
                          {alert.predicted_return_likelihood_drop != null && alert.predicted_return_likelihood_drop > 0 && (
                            <span className="text-rose-600 font-medium">−{alert.predicted_return_likelihood_drop.toFixed(0)}pp return</span>
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
          <span>Check interval: ≥{config.checkIntervalThresholdMin}min</span>
          <span>Customers per clean: ≥{config.customerPerCleanThreshold}</span>
          <span>Complaint threshold: ≥{config.complaintWeeklyThreshold}/wk</span>
          <span>Review threshold: ≥{config.reviewMentionThreshold}</span>
          <span className="text-neutral-400">146th POSR-exclusive differentiator</span>
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

export default RestroomCleanlinessScreen;
