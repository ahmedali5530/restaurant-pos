/**
 * AI Reservation Overbooking Optimizer — compute optimal slot overbooking.
 *
 * 47th POSR-exclusive differentiator — restaurants lose $4-6k/year to no-shows.
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
  faCalendarPlus, faRotate, faLightbulb, faCheckCircle,
  faArrowUp, faArrowDown, faPersonWalking, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runOverbookingEngine, getActivePlans, getSummary, updatePlanStatus,
  readOverbookingConfig, DEFAULT_OVERBOOKING_CONFIG,
  type OverbookingPlan,
} from "@/lib/overbooking.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  slot_overbook:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowUp,           label: 'OVERBOOK' },
  slot_conservative:     { bg: 'bg-neutral-50',  text: 'text-neutral-700', icon: faArrowDown,         label: 'CONSERVATIVE' },
  slot_walk_in_friendly: { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faPersonWalking,     label: 'WALK-IN FRIENDLY' },
  slot_at_risk:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'AT RISK' },
};

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fillRateColor = (rate: number): string => {
  if (rate >= 0.9) return 'bg-rose-500';
  if (rate >= 0.7) return 'bg-emerald-500';
  if (rate >= 0.5) return 'bg-yellow-400';
  return 'bg-neutral-300';
};

export function OverbookingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [plans, setPlans] = useState<OverbookingPlan[]>([]);
  const [summary, setSummary] = useState({ overbookSlots: 0, atRiskSlots: 0, totalRevenueGain: 0, avgNoShowRate: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_OVERBOOKING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readOverbookingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActivePlans(db), getSummary(db)]);
      setPlans(list); setSummary(sum);
    } catch (err) { console.error('[overbooking-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runOverbookingEngine(db, config);
      toast.success(result.plans.length > 0
        ? `Generated ${result.plans.length} overbooking plans — ${result.plans.filter(p => p.rule_id === 'slot_overbook').length} overbook slots, ${result.plans.filter(p => p.rule_id === 'slot_at_risk').length} at-risk slots`
        : `No overbooking plans — need ≥3 reservations per slot`);
      await reload();
    } catch (err) { console.error('[overbooking-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (planId: string, status: 'applied' | 'declined') => {
    try { await updatePlanStatus(db, planId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: at_risk critical first, then overbook by revenue gain desc
  const sortedPlans = [...plans].sort((a, b) => {
    if (a.rule_id === 'slot_at_risk' && b.rule_id !== 'slot_at_risk') return -1;
    if (b.rule_id === 'slot_at_risk' && a.rule_id !== 'slot_at_risk') return 1;
    return b.est_revenue_gain - a.est_revenue_gain;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Overbooking", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarPlus} className="text-violet-600" />
              AI Overbooking Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Computes optimal slot overbooking level — accept more bookings safely (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Computing…' : 'Optimize slots'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : plans.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCalendarPlus} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No overbooking plans yet!</p>
            <p className="text-sm mt-1">Click "Optimize slots" to compute optimal overbooking levels per reservation slot.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowUp} />Overbook slots</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.overbookSlots}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />At-risk slots</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.atRiskSlots}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center ring-2 ring-violet-200">
                <div className="text-xs text-violet-700 font-semibold">Est. revenue gain</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{withCurrency(summary.totalRevenueGain)}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Avg no-show rate</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{(summary.avgNoShowRate * 100).toFixed(1)}%</div>
              </div>
            </div>

            {/* Plans table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faCalendarPlus} className="text-violet-600" />
                  Slot Recommendations (sorted by impact)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Slot</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Capacity</th>
                      <th className="p-3 text-right">Booked</th>
                      <th className="p-3 text-right">No-shows (pred)</th>
                      <th className="p-3 text-right">Walk-ins</th>
                      <th className="p-3 text-right">Overbook</th>
                      <th className="p-3 text-right">Fill rate</th>
                      <th className="p-3 text-right">Revenue gain</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlans.map((p, idx) => {
                      const style = RULE_STYLE[p.rule_id] ?? RULE_STYLE.slot_overbook;
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="p-3">
                            <div className="font-semibold">{DOW_NAMES[p.day_of_week] ?? '?'} {p.hour}:00</div>
                            <p className="text-xs text-neutral-500 mt-0.5">{p.description}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{p.capacity_seats}</td>
                          <td className="p-3 text-right tabular-nums">{p.current_bookings}</td>
                          <td className="p-3 text-right tabular-nums text-amber-600">{p.predicted_no_shows} ({(p.historical_no_show_rate * 100).toFixed(0)}%)</td>
                          <td className="p-3 text-right tabular-nums text-violet-600">{p.predicted_walk_ins}</td>
                          <td className="p-3 text-right">
                            <span className={`text-lg font-bold tabular-nums ${p.optimal_overbook_count > 0 ? 'text-emerald-600' : 'text-neutral-400'}`}>
                              {p.optimal_overbook_count > 0 ? `+${p.optimal_overbook_count}` : '—'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="tabular-nums">{(p.expected_fill_rate * 100).toFixed(0)}%</span>
                              <div className="w-12 h-1.5 bg-neutral-100 rounded">
                                <div className={`h-1.5 rounded ${fillRateColor(p.expected_fill_rate)}`} style={{ width: `${Math.min(100, p.expected_fill_rate * 100)}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className={`p-3 text-right tabular-nums font-bold ${p.est_revenue_gain > 0 ? 'text-emerald-600' : 'text-neutral-400'}`}>
                            {p.est_revenue_gain > 0 ? `+${withCurrency(p.est_revenue_gain)}` : '—'}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => p.id && handleStatus(p.id, 'applied')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap">
                                <FontAwesomeIcon icon={faCheckCircle} /> Apply
                              </button>
                              <button onClick={() => p.id && handleStatus(p.id, 'declined')} className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                                Skip
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
            {plans.filter(p => p.ai_insight).slice(0, 5).map((p, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{DOW_NAMES[p.day_of_week]} {p.hour}:00</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[p.rule_id].bg} ${RULE_STYLE[p.rule_id].text}`}>{p.rule_id.replace(/_/g, ' ')}</span>
                  {p.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{p.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{p.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Wait threshold: <strong>{config.serviceWaitThreshold}min</strong></span>
              <span>Max overbook: <strong>+{(config.maxOverbookPct * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default OverbookingScreen;
