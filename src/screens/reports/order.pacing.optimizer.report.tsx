/**
 * AI Order Pacing & Batching Optimizer — prevents kitchen bottlenecks by
 * proactively pacing, throttling, and batching order flow.
 *
 * 104th POSR-exclusive differentiator — restaurants lose $300-1,200/mo from
 * poor order pacing.
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
  faGaugeHigh, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faLayerGroup, faTruckFast, faCalendarCheck,
  faUsers, faStopwatch, faStar, faClock,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPacingEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readPacingConfig, DEFAULT_PACING_CONFIG,
  type PacingAlert,
} from "@/lib/order-pacing-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  kitchen_capacity_warning:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faGaugeHigh,      label: 'CAPACITY' },
  online_order_throttle:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTruckFast,      label: 'ONLINE FLOOD' },
  reservation_pace_mismatch:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCalendarCheck,  label: 'RESERVATION PACE' },
  batch_opportunity:           { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faLayerGroup,     label: 'BATCH' },
  rush_incoming:               { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faStopwatch,      label: 'RUSH INCOMING' },
  staff_coverage_gap:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUsers,          label: 'STAFF GAP' },
  ticket_priority_needed:      { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faStar,           label: 'PRIORITY' },
  prep_lead_time_violation:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faClock,          label: 'LEAD TIME' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function OrderPacingOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<PacingAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalRevenueRisk: 0, totalTimeSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PACING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPacingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[pacing-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPacingEngine(db, config);
      toast.success(`Generated ${result.generated} pacing alerts`);
      await reload();
    } catch (err) {
      console.error('[pacing-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[pacing-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_revenue_at_risk ?? 0) - (a.est_revenue_at_risk ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Order Pacing", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faGaugeHigh} className="text-orange-600" />
              AI Order Pacing & Batching Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Prevents kitchen bottlenecks — proactive pacing, throttling, and batch cooking
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Check pacing'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Critical alerts" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faGaugeHigh} label="Open alerts" value={String(summary.totalAlerts)} color="text-orange-600" />
          <SummaryCard icon={faTriangleExclamation} label="Revenue at risk" value={fmt$(summary.totalRevenueRisk)} color="text-rose-600" />
          <SummaryCard icon={faClock} label="Time savings" value={`${summary.totalTimeSavings} min`} color="text-emerald-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faGaugeHigh} spin className="text-4xl mb-3" />
            <p>Loading pacing alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No pacing alerts</p>
            <p className="text-sm mt-1">Kitchen flow is well-paced.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faGaugeHigh, label: alert.rule_id.toUpperCase() };
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
                          {alert.current_tickets != null && alert.max_capacity != null && (
                            <span className="text-xs font-medium text-neutral-700">{alert.current_tickets}/{alert.max_capacity} tickets</span>
                          )}
                          {alert.avg_ticket_time_min != null && (
                            <span className={`text-xs ${alert.avg_ticket_time_min > config.targetTicketTime ? 'text-rose-600 font-medium' : ''}`}>{alert.avg_ticket_time_min}min avg</span>
                          )}
                          {alert.online_orders_pending != null && <span className="text-xs text-neutral-500">{alert.online_orders_pending} online pending</span>}
                          {alert.reservations_next_hour != null && <span className="text-xs text-neutral-500">{alert.reservations_next_hour} reservations/hr</span>}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        {alert.est_time_savings_min != null && alert.est_time_savings_min > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 mt-2">
                            <FontAwesomeIcon icon={faClock} /> Saves {alert.est_time_savings_min}min
                          </span>
                        )}
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_revenue_at_risk > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_revenue_at_risk)}</div>
                        <div className="text-xs text-neutral-400">at risk</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Resolved
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
          <span>Max tickets: {config.maxTickets}</span>
          <span>Max online pending: {config.maxOnlinePending}</span>
          <span>Rush lookahead: {config.rushLookaheadMin}min</span>
          <span>Target ticket time: {config.targetTicketTime}min</span>
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

export default OrderPacingOptimizerScreen;
