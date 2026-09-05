/**
 * AI Customer Journey Friction Point Detector — identifies friction points
 * across the in-restaurant customer journey (arrival→seating→ordering→
 * eating→payment→departure) and recommends stage-specific improvements.
 *
 * 125th POSR-exclusive differentiator — restaurants lose $500-2,000/mo per
 * location from customer journey friction going undetected.
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
  faRoute, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faDoorOpen, faChair, faBookOpen,
  faUtensils, faCreditCard, faDoorClosed, faLink, faGaugeHigh,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runJourneyFrictionEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readJourneyFrictionConfig, DEFAULT_JOURNEYFRICTION_CONFIG,
  type JourneyFrictionAlert,
} from "@/lib/journey-friction.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  arrival_friction:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faDoorOpen,          label: 'ARRIVAL' },
  seating_friction:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faChair,             label: 'SEATING' },
  ordering_friction:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBookOpen,          label: 'ORDERING' },
  eating_friction:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faUtensils,          label: 'EATING' },
  payment_friction:     { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faCreditCard,        label: 'PAYMENT' },
  departure_friction:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faDoorClosed,        label: 'DEPARTURE' },
  friction_chain:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faLink,              label: 'FRICTION CHAIN' },
  peak_friction_stage:  { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faGaugeHigh,         label: 'PEAK STAGE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const STAGE_COLOR: Record<string, string> = {
  arrival: 'text-amber-600',
  seating: 'text-amber-600',
  ordering: 'text-amber-600',
  eating: 'text-rose-600',
  payment: 'text-rose-600',
  departure: 'text-amber-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function JourneyFrictionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<JourneyFrictionAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, peakFrictionStage: '—', totalCustomersAffected: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_JOURNEYFRICTION_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readJourneyFrictionConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[journeyfriction-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runJourneyFrictionEngine(db, config);
      toast.success(`Detected ${result.generated} friction points — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[journeyfriction-report] analyze failed', err);
      toast.error('Detection failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[journeyfriction-report] status failed', err);
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
      <DocumentTitle parts={["AI Journey Friction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faRoute} className="text-amber-600" />
              AI Customer Journey Friction Point Detector
            </h1>
            <p className="text-sm text-neutral-500">
              Identifies friction across arrival→seating→ordering→eating→payment→departure stages
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Detecting…' : 'Detect friction'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faGaugeHigh} label="Peak friction stage" value={summary.peakFrictionStage} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Customers affected" value={String(summary.totalCustomersAffected)} color="text-amber-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faRoute} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRoute} spin className="text-4xl mb-3" />
            <p>Detecting journey friction points…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No journey friction detected</p>
            <p className="text-sm mt-1">All journey stages running smoothly — no friction points.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faRoute, label: alert.rule_id.toUpperCase() };
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
                          {alert.journey_stage && (
                            <span className={`font-semibold uppercase text-sm ${STAGE_COLOR[alert.journey_stage] ?? 'text-neutral-700'}`}>
                              {alert.journey_stage}
                            </span>
                          )}
                          {alert.friction_score != null && alert.stage_benchmark != null && (
                            <span className="text-xs">
                              <span className={alert.friction_score >= 60 ? 'text-rose-600 font-bold' : 'text-amber-600 font-medium'}>{alert.friction_score}</span>
                              <span className="text-neutral-400"> / {alert.stage_benchmark}</span>
                            </span>
                          )}
                          {alert.friction_gap != null && alert.friction_gap > 0 && (
                            <span className="text-xs font-bold text-rose-600">+{alert.friction_gap} gap</span>
                          )}
                          {alert.friction_type && (
                            <span className="text-xs text-amber-600 font-medium">{alert.friction_type}</span>
                          )}
                          {alert.is_peak_hour && (
                            <span className="text-xs font-medium text-rose-600">PEAK</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.avg_stage_time != null && alert.optimal_stage_time != null && (
                            <span>{alert.avg_stage_time} min (optimal {alert.optimal_stage_time})</span>
                          )}
                          {alert.complaint_count != null && <span className={alert.complaint_count >= 10 ? 'text-rose-600' : ''}>{alert.complaint_count} complaints</span>}
                          {alert.error_count != null && alert.error_count > 0 && <span className="text-rose-600">{alert.error_count} errors</span>}
                          {alert.customers_affected != null && <span>{alert.customers_affected} customers</span>}
                          {alert.chained_from_stage && <span className="text-violet-600">chained from {alert.chained_from_stage}</span>}
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
                        <div className="text-xs text-neutral-400">opportunity/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Fixed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Improving
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
          <span>Friction threshold: +{config.threshold} gap</span>
          <span>Chain threshold: {config.chainThreshold} stages</span>
          <span>Peak multiplier: {config.peakMultiplier}x</span>
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

export default JourneyFrictionScreen;
