/**
 * AI Catering Order Optimizer — bulk event order optimization dashboard.
 *
 * 53rd POSR-exclusive differentiator — catering is a $60B+ US market.
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
  faUtensils, faRotate, faLightbulb, faCheckCircle,
  faUsers, faPercent, faTruck, faClock, faUserTie,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runCateringEngine, getActiveOptimizations, getSummary, updateOptimizationStatus,
  readCateringConfig, DEFAULT_CATERING_CONFIG,
  type CateringOptimization,
} from "@/lib/catering-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  bulk_pricing:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faPercent,    label: 'BULK PRICING' },
  waste_prediction:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUtensils,   label: 'WASTE PREDICTION' },
  travel_suitability:  { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faTruck,      label: 'TRAVEL SUITABILITY' },
  staffing_alert:      { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUserTie,    label: 'STAFFING ALERT' },
  menu_mix_optimal:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCheckCircle, label: 'OPTIMAL MIX' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const EVENT_TYPE_STYLE: Record<string, string> = {
  corporate:  'bg-blue-100 text-blue-700',
  wedding:    'bg-pink-100 text-pink-700',
  birthday:   'bg-violet-100 text-violet-700',
  conference: 'bg-emerald-100 text-emerald-700',
  holiday:    'bg-rose-100 text-rose-700',
  other:      'bg-neutral-100 text-neutral-700',
};

const parseSuggestedDishes = (json?: string): Array<{ name: string; portions: number; travel_score: number; cost_per_portion: number }> => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function CateringOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [optimizations, setOptimizations] = useState<CateringOptimization[]>([]);
  const [summary, setSummary] = useState({ activeEvents: 0, totalGuests: 0, totalEstRevenue: 0, avgWastePct: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CATERING_CONFIG);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCateringConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveOptimizations(db), getSummary(db)]);
      setOptimizations(list); setSummary(sum);
    } catch (err) { console.error('[catering-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runCateringEngine(db, config);
      toast.success(result.optimizations.length > 0
        ? `Generated ${result.optimizations.length} catering optimizations — ${result.optimizations.reduce((s, o) => s + o.guest_count, 0)} total guests`
        : `No catering events found — need dishes in menu`);
      await reload();
    } catch (err) { console.error('[catering-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (optId: string, status: 'accepted' | 'adjusted' | 'declined') => {
    try { await updateOptimizationStatus(db, optId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: critical first, then by guest_count desc
  const sortedOpts = [...optimizations].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sev[a.severity] !== sev[b.severity]) return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
    return b.guest_count - a.guest_count;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Catering Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUtensils} className="text-violet-600" />
              AI Catering Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Optimizes bulk event orders — recipe scaling, bulk pricing, waste prediction (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Optimizing…' : 'Optimize events'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : optimizations.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUtensils} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No catering optimizations yet!</p>
            <p className="text-sm mt-1">Click "Optimize events" to generate bulk order recommendations.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faUtensils} />Active events</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.activeEvents}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faUsers} />Total guests</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.totalGuests}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Est. revenue</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalEstRevenue)}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Avg waste</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{(summary.avgWastePct * 100).toFixed(1)}%</div>
              </div>
            </div>

            {/* Optimizations list */}
            <div className="space-y-3">
              {sortedOpts.map((o, idx) => {
                const style = RULE_STYLE[o.rule_id] ?? RULE_STYLE.bulk_pricing;
                const isExpanded = expandedId === o.id;
                const dishes = parseSuggestedDishes(o.suggested_dishes);
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    {/* Header */}
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[o.severity] ?? SEVERITY_DOT.low}`}></span>
                          <span className="font-medium">{o.event_name}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${EVENT_TYPE_STYLE[o.event_type ?? 'other'] ?? EVENT_TYPE_STYLE.other}`}>
                            {o.event_type ?? 'other'}
                          </span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500"><FontAwesomeIcon icon={faUsers} /> <strong>{o.guest_count}</strong> guests</span>
                          <span className="text-neutral-500"><FontAwesomeIcon icon={faClock} /> <strong>{o.prep_hours_needed}h</strong> prep</span>
                          <span className="text-neutral-500"><FontAwesomeIcon icon={faUserTie} /> <strong>{o.staff_needed}</strong> staff</span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{o.description}</p>
                    </div>

                    {/* Metrics row */}
                    <div className="p-3">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                        <div className="text-center">
                          <div className="text-xs text-neutral-500">Est. cost</div>
                          <div className="font-bold text-rose-600 tabular-nums">{withCurrency(o.total_est_cost)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-neutral-500">Suggested price</div>
                          <div className="font-bold text-emerald-600 tabular-nums">{withCurrency(o.suggested_price)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-neutral-500">Bulk discount</div>
                          <div className="font-bold text-amber-600 tabular-nums">{(o.bulk_discount_pct * 100).toFixed(1)}%</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-neutral-500">Predicted waste</div>
                          <div className={`font-bold tabular-nums ${o.predicted_waste_pct > 0.15 ? 'text-rose-600' : 'text-amber-600'}`}>
                            {(o.predicted_waste_pct * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-rose-500">{withCurrency(o.est_waste_cost)} loss</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-neutral-500">Travel score</div>
                          <div className={`font-bold tabular-nums ${o.travel_suitability_score >= 70 ? 'text-emerald-600' : o.travel_suitability_score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {o.travel_suitability_score}/100
                          </div>
                        </div>
                      </div>

                      {/* Suggested dishes (expandable) */}
                      {dishes.length > 0 && (
                        <div>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : o.id ?? null)}
                            className="text-xs text-violet-600 hover:underline mb-2"
                          >
                            <FontAwesomeIcon icon={faUtensils} className="mr-1" />
                            {isExpanded ? 'Hide' : 'Show'} suggested dishes ({dishes.length})
                          </button>
                          {isExpanded && (
                            <div className="bg-violet-50/50 p-3 rounded border border-violet-100">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-neutral-500">
                                    <th className="text-left p-1">Dish</th>
                                    <th className="text-right p-1">Portions</th>
                                    <th className="text-right p-1">Cost/portion</th>
                                    <th className="text-right p-1">Travel score</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dishes.map((d, i) => (
                                    <tr key={i} className="border-t border-violet-100">
                                      <td className="p-1 font-medium">{d.name}</td>
                                      <td className="p-1 text-right tabular-nums">{d.portions}</td>
                                      <td className="p-1 text-right tabular-nums">{withCurrency(d.cost_per_portion)}</td>
                                      <td className={`p-1 text-right tabular-nums font-semibold ${d.travel_score >= 70 ? 'text-emerald-600' : d.travel_score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                                        {d.travel_score}/100
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI insight */}
                      {o.ai_insight && (
                        <div className="mt-2 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{o.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <button onClick={() => o.id && handleStatus(o.id, 'accepted')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Accept
                        </button>
                        <button onClick={() => o.id && handleStatus(o.id, 'adjusted')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          Adjust menu
                        </button>
                        <button onClick={() => o.id && handleStatus(o.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Target margin: <strong>{(config.targetMarginPct * 100).toFixed(0)}%</strong></span>
              <span>Bulk threshold: <strong>{config.bulkDiscountThreshold}+ guests</strong></span>
              <span>Waste benchmark: <strong>{(config.wasteBenchmarkPct * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default CateringOptimizerScreen;
