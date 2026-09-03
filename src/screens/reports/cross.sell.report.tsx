/**
 * AI Real-Time Cross-Sell Engine — data-driven suggestions during ordering.
 *
 * 77th POSR-exclusive differentiator — cross-selling increases avg ticket 15-30%.
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
  faCartPlus, faRotate, faLightbulb, faCheckCircle,
  faUtensils, faLayerGroup, faDollarSign, faFire, faIceCream,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runCrossSellEngine, getActiveSuggestions, getSummary, updateSuggestionStatus,
  readCrossSellConfig, DEFAULT_CROSS_SELL_CONFIG,
  type CrossSellSuggestion,
} from "@/lib/cross-sell.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  complement_item:  { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faUtensils,    label: 'COMPLEMENT' },
  category_gap:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faLayerGroup,  label: 'CATEGORY GAP' },
  high_margin_add:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faDollarSign,  label: 'HIGH MARGIN' },
  popular_pairing:  { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faFire,        label: 'POPULAR PAIRING' },
  dessert_prompt:   { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faIceCream,    label: 'DESSERT PROMPT' },
};

const convColor = (c: number): string => c >= 0.35 ? 'text-emerald-600' : c >= 0.20 ? 'text-amber-600' : 'text-rose-600';

export function CrossSellScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [suggestions, setSuggestions] = useState<CrossSellSuggestion[]>([]);
  const [summary, setSummary] = useState({ suggestionCount: 0, totalAnnualRevenue: 0, avgConversion: 0, activeCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CROSS_SELL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCrossSellConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveSuggestions(db), getSummary(db)]);
      setSuggestions(list); setSummary(sum);
    } catch (err) { console.error('[cross-sell-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runCrossSellEngine(db, config);
      toast.success(result.suggestions.length > 0
        ? `Generated ${result.suggestions.length} cross-sell suggestions — est ${withCurrency(result.suggestions.reduce((s, r) => s + r.est_annual_revenue, 0))}/yr revenue`
        : `No suggestions — need menu items`);
      await reload();
    } catch (err) { console.error('[cross-sell-report] analyze failed', err); toast.error('Engine failed'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (id: string, status: 'active' | 'paused') => {
    try { await updateSuggestionStatus(db, id, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed'); }
  }, [db, reload]);

  const sortedSugs = [...suggestions].sort((a, b) => b.est_annual_revenue - a.est_annual_revenue);

  return (
    <Layout>
      <DocumentTitle parts={["Cross-Sell", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCartPlus} className="text-emerald-600" />
              AI Cross-Sell Engine
            </h1>
            <p className="text-sm text-neutral-500">
              Real-time suggestions during ordering — increases avg ticket 15-30% (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Generating…' : 'Generate suggestions'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : suggestions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCartPlus} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No cross-sell suggestions!</p>
            <p className="text-sm mt-1">Click "Generate suggestions" to create data-driven cross-sell prompts.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faCartPlus} />Suggestions</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.suggestionCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-300 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Est. annual revenue</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalAnnualRevenue)}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Avg conversion</div>
                <div className={`text-2xl font-bold tabular-nums ${convColor(summary.avgConversion)}`}>{(summary.avgConversion * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Active</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.activeCount}</div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faCartPlus} className="text-emerald-600" />
                  Cross-Sell Suggestions (sorted by revenue potential)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Trigger → Suggestion</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Conversion</th>
                      <th className="p-3 text-right">Revenue/order</th>
                      <th className="p-3 text-right">Annual revenue</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSugs.map((s, idx) => {
                      const style = RULE_STYLE[s.rule_id] ?? RULE_STYLE.complement_item;
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-amber-600">{s.trigger_item ?? s.trigger_category}</span>
                              <FontAwesomeIcon icon={faCartPlus} className="text-neutral-400" />
                              <span className="font-medium text-emerald-600">{s.suggested_item ?? s.suggested_category}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{s.description}</p>
                            {s.suggestion_text && (
                              <p className="text-xs text-violet-600 italic mt-1 bg-violet-50/50 p-2 rounded border border-violet-100">
                                Script: {s.suggestion_text}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <span className={`font-bold tabular-nums ${convColor(s.est_conversion_rate)}`}>{(s.est_conversion_rate * 100).toFixed(0)}%</span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{s.est_revenue_per_order > 0 ? withCurrency(s.est_revenue_per_order) : '—'}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">{withCurrency(s.est_annual_revenue)}</td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              {s.status === 'active' ? (
                                <button onClick={() => s.id && handleStatus(s.id, 'paused')} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">
                                  Pause
                                </button>
                              ) : (
                                <button onClick={() => s.id && handleStatus(s.id, 'active')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap font-medium">
                                  <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Activate
                                </button>
                              )}
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
            {suggestions.filter(s => s.ai_insight).slice(0, 5).map((s, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{s.trigger_item ?? s.trigger_category} → {s.suggested_item ?? s.suggested_category}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[s.rule_id].bg} ${RULE_STYLE[s.rule_id].text}`}>{s.rule_id.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{s.ai_insight}</p>
              </div>
            ))}

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Min confidence: <strong>{(config.minConfidence * 100).toFixed(0)}%</strong></span>
              <span>Avg daily orders: <strong>{config.avgDailyOrders}</strong></span>
              <span>Prompt delay: <strong>{config.promptDelaySec}s</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default CrossSellScreen;
