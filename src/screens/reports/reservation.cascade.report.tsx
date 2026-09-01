/**
 * AI Reservation Cascade Predictor — multi-reservation cascade effects dashboard.
 *
 * 48th POSR-exclusive differentiator — predicts downstream impact of single
 * events across the entire evening.
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
  faWater, faRotate, faLightbulb, faCheckCircle,
  faUsers, faPersonWalking, faUtensils, faLayerGroup, faLock,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runCascadeEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readCascadeConfig, DEFAULT_CASCADE_CONFIG,
  type ReservationCascadeAlert,
} from "@/lib/reservation-cascade.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  no_show_cascade:      { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUsers,       label: 'NO-SHOW CASCADE' },
  walk_in_storm:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faPersonWalking, label: 'WALK-IN STORM' },
  turnover_bottleneck:  { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faRotate,      label: 'TURNOVER BOTTLENECK' },
  kitchen_spike:        { bg: 'bg-orange-50',   text: 'text-orange-700',  icon: faUtensils,    label: 'KITCHEN SPIKE' },
  double_booked_table:  { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faLock,        label: 'DOUBLE-BOOKED' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

// Cascade depth visualization (1-5 levels deep)
const renderDepth = (depth: number): JSX.Element => {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(level => (
        <div
          key={level}
          className={`h-3 w-2 rounded-sm ${level <= depth ? 'bg-rose-500' : 'bg-neutral-200'}`}
          title={`Level ${level}`}
        />
      ))}
    </div>
  );
};

const parseMitigation = (json?: string): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export function ReservationCascadeScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ReservationCascadeAlert[]>([]);
  const [summary, setSummary] = useState({ criticalCount: 0, totalAlerts: 0, totalAffectedReservations: 0, totalRevenueLoss: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CASCADE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCascadeConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[cascade-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runCascadeEngine(db, config);
      toast.success(result.alerts.length > 0
        ? `Generated ${result.alerts.length} cascade alerts — ${result.alerts.filter(a => a.severity === 'critical').length} critical, ${result.alerts.filter(a => a.rule_id === 'no_show_cascade').length} no-show cascades`
        : `No cascade risks detected — all upcoming slots stable`);
      await reload();
    } catch (err) { console.error('[cascade-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'mitigated' | 'occurred') => {
    try { await updateAlertStatus(db, alertId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedAlerts = [...alerts].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
  });

  return (
    <Layout>
      <DocumentTitle parts={["Reservation Cascade", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWater} className="text-violet-600" />
              AI Reservation Cascade
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts downstream impact of single events across the evening (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Predict cascades'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWater} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No cascade risks detected!</p>
            <p className="text-sm mt-1">Click "Predict cascades" to analyze downstream impact of upcoming reservations.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faWater} />Critical cascades</div>
                <div className="text-3xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faLayerGroup} />Total alerts</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.totalAlerts}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faUsers} />Affected reservations</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.totalAffectedReservations}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-300 p-3 text-center">
                <div className="text-xs text-rose-700">Est. revenue loss</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalRevenueLoss)}</div>
              </div>
            </div>

            {/* Alerts table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faWater} className="text-violet-600" />
                  Cascade Alerts (sorted by severity)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Trigger</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Affected</th>
                      <th className="p-3 text-right">Tables</th>
                      <th className="p-3 text-right">Delay</th>
                      <th className="p-3 text-center">Cascade depth</th>
                      <th className="p-3 text-right">Revenue loss</th>
                      <th className="p-3 text-left">Mitigation Steps</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAlerts.map((a, idx) => {
                      const style = RULE_STYLE[a.rule_id] ?? RULE_STYLE.no_show_cascade;
                      const steps = parseMitigation(a.mitigation_steps);
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[a.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">{a.trigger_description ?? '—'}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{a.description}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold">{a.affected_reservations}</td>
                          <td className="p-3 text-right tabular-nums">{a.affected_tables}</td>
                          <td className="p-3 text-right">
                            <span className={`tabular-nums font-bold ${a.predicted_delay_minutes > 30 ? 'text-rose-600' : 'text-amber-600'}`}>
                              {a.predicted_delay_minutes.toFixed(0)}min
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {renderDepth(a.cascade_depth)}
                              <span className="text-xs text-neutral-500">L{a.cascade_depth}/5</span>
                            </div>
                          </td>
                          <td className="p-3 text-right tabular-nums font-bold text-rose-600">{withCurrency(a.est_revenue_loss)}</td>
                          <td className="p-3">
                            {steps.length > 0 ? (
                              <ul className="text-xs space-y-0.5 list-disc list-inside">
                                {steps.slice(0, 3).map((s, i) => <li key={i} className="text-neutral-700">{s}</li>)}
                                {steps.length > 3 && <li className="text-neutral-400 italic">+{steps.length - 3} more</li>}
                              </ul>
                            ) : <span className="text-xs text-neutral-400">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              <button onClick={() => a.id && handleStatus(a.id, 'mitigated')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap">
                                <FontAwesomeIcon icon={faCheckCircle} /> Mitigated
                              </button>
                              <button onClick={() => a.id && handleStatus(a.id, 'occurred')} className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200">
                                Occurred
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI insights */}
            {alerts.filter(a => a.ai_insight).slice(0, 5).map((a, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{a.trigger_description ?? '—'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[a.rule_id].bg} ${RULE_STYLE[a.rule_id].text}`}>{a.rule_id.replace(/_/g, ' ')}</span>
                  {a.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{a.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{a.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Peak threshold: <strong>{config.peakThreshold}+ res</strong></span>
              <span>Walk-in storm: <strong>{config.walkInStormThreshold}+ walk-ins</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default ReservationCascadeScreen;
