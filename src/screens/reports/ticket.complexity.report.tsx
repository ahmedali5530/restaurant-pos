/**
 * AI Order Ticket Complexity Analyzer — analyzes each ticket's complexity,
 * predicts fulfillment time, recommends dynamic station routing.
 *
 * 113th POSR-exclusive differentiator — restaurants lose $250-1,000/mo per
 * location from unmanaged ticket complexity. No POS analyzes ticket
 * complexity before routing to kitchen.
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
  faLayerGroup, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faGaugeHigh, faRoute, faSliders,
  faCreditCard, faAllergies, faClock, faArrowRightArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runTicketCompEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readTicketCompConfig, DEFAULT_TICKETCOMP_CONFIG,
  type TicketCompAlert,
} from "@/lib/ticket-complexity.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  high_complexity_ticket:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faLayerGroup,          label: 'HIGH COMPLEXITY' },
  station_overload_risk:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faGaugeHigh,          label: 'OVERLOAD RISK' },
  modifier_heavy_ticket:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faSliders,            label: 'MODIFIER-HEAVY' },
  split_payment_delay:        { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faCreditCard,         label: 'SPLIT DELAY' },
  special_request_flag:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faAllergies,          label: 'SPECIAL REQUEST' },
  predicted_long_fulfillment: { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faClock,              label: 'LONG FULFILL' },
  complexity_pattern:         { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faArrowRightArrowLeft, label: 'PATTERN' },
  routing_recommendation:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faRoute,              label: 'ROUTING REC' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function TicketComplexityScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<TicketCompAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgComplexity: 0, longFulfillmentCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TICKETCOMP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTicketCompConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[ticketcomp-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTicketCompEngine(db, config);
      toast.success(`Analyzed ${result.generated} tickets — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[ticketcomp-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[ticketcomp-report] status failed', err);
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
      <DocumentTitle parts={["AI Ticket Complexity", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLayerGroup} className="text-amber-600" />
              AI Order Ticket Complexity Analyzer
            </h1>
            <p className="text-sm text-neutral-500">
              Analyzes ticket complexity + predicts fulfillment time + recommends dynamic station routing
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze tickets'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faLayerGroup} label="Avg complexity" value={`${summary.avgComplexity.toFixed(0)}/100`} color="text-amber-600" />
          <SummaryCard icon={faClock} label="Long fulfillment" value={String(summary.longFulfillmentCount)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faLayerGroup} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLayerGroup} spin className="text-4xl mb-3" />
            <p>Analyzing ticket complexity…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No complexity alerts</p>
            <p className="text-sm mt-1">All tickets at manageable complexity — no overload risks.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faLayerGroup, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.ticket_id}</span>
                          {alert.complexity_score != null && (
                            <span className={`text-xs font-bold ${alert.complexity_score >= 80 ? 'text-rose-600' : alert.complexity_score >= 60 ? 'text-amber-600' : 'text-neutral-500'}`}>
                              {alert.complexity_score}/100 complexity
                            </span>
                          )}
                          {alert.predicted_fulfillment_minutes != null && (
                            <span className={`text-xs font-medium ${alert.predicted_fulfillment_minutes >= 20 ? 'text-rose-600' : 'text-neutral-500'}`}>
                              {alert.predicted_fulfillment_minutes} min predict
                            </span>
                          )}
                          {alert.primary_station && (
                            <span className="text-xs text-neutral-600">
                              <span className="text-rose-600 font-medium">{alert.primary_station}</span>
                              {alert.station_load_pct != null && ` (${alert.station_load_pct}%)`}
                              {alert.recommended_station && (
                                <>
                                  <span className="mx-1 text-neutral-400">→</span>
                                  <span className="text-emerald-600 font-medium">{alert.recommended_station}</span>
                                </>
                              )}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.item_count != null && <span>{alert.item_count} items</span>}
                          {alert.modifier_count != null && <span>{alert.modifier_count} mods</span>}
                          {alert.split_payment_count != null && alert.split_payment_count > 0 && <span className="text-sky-600">{alert.split_payment_count} splits</span>}
                          {alert.special_request_count != null && alert.special_request_count > 0 && <span className="text-rose-600">{alert.special_request_count} special</span>}
                          {alert.stations_involved && <span className="text-neutral-400">{alert.stations_involved}</span>}
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Routed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Handling
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
          <span>High complexity: {config.highThreshold}/100</span>
          <span>Modifier threshold: {config.modThreshold} mods</span>
          <span>Long fulfillment: {config.longFulfill} min</span>
          <span>Station overload: {config.stationOverload}%</span>
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

export default TicketComplexityScreen;
