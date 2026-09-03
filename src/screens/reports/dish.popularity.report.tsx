/**
 * AI Dish Popularity Predictor — predict new dish success before launch.
 *
 * 78th POSR-exclusive differentiator — 60% of new menu items fail within 90 days.
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
  faLightbulb, faRotate, faUtensils, faCheckCircle,
  faStar, faDollarSign, faChartBar, faLayerGroup, faSun,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runDishPopEngine, getActivePredictions, getSummary, updatePredictionStatus,
  readDishPopConfig, DEFAULT_DISH_POP_CONFIG,
  type DishPopularityPrediction,
} from "@/lib/dish-popularity.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  similar_to_bestseller: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faStar,       label: 'SIMILAR TO BESTSELLER' },
  price_point_optimal:   { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faDollarSign, label: 'PRICE OPTIMAL' },
  category_trending:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faChartBar,   label: 'CATEGORY TRENDING' },
  ingredient_overlap:    { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faLayerGroup, label: 'INGREDIENT OVERLAP' },
  seasonal_fit:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faSun,        label: 'SEASONAL FIT' },
};

const popColor = (s: number): string => s >= 70 ? 'text-emerald-600' : s >= 50 ? 'text-amber-600' : 'text-rose-600';
const popBarColor = (s: number): string => s >= 70 ? 'bg-emerald-500' : s >= 50 ? 'bg-amber-500' : 'bg-rose-500';
const confColor = (c: number): string => c >= 0.7 ? 'text-emerald-600' : c >= 0.5 ? 'text-amber-600' : 'text-rose-600';

const parseIngredients = (json?: string): string[] => {
  if (!json) return [];
  try { const p = JSON.parse(json); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
};

export function DishPopularityScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<DishPopularityPrediction[]>([]);
  const [summary, setSummary] = useState({ predictionCount: 0, highConfidenceCount: 0, totalPredictedRevenue: 0, avgPopularity: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_DISH_POP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readDishPopConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActivePredictions(db), getSummary(db)]);
      setPredictions(list); setSummary(sum);
    } catch (err) { console.error('[dish-pop-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runDishPopEngine(db, config);
      toast.success(result.predictions.length > 0
        ? `Evaluated ${result.predictions.length} proposed dishes — ${result.predictions.filter(p => p.launch_recommendation === 'launch_now').length} recommended for launch`
        : `No dishes to evaluate — need existing menu items for comparison`);
      await reload();
    } catch (err) { console.error('[dish-pop-report] analyze failed', err); toast.error('Engine failed'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (id: string, status: 'launched' | 'tested' | 'declined') => {
    try { await updatePredictionStatus(db, id, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed'); }
  }, [db, reload]);

  const sortedPreds = [...predictions].sort((a, b) => b.predicted_popularity - a.predicted_popularity);

  return (
    <Layout>
      <DocumentTitle parts={["Dish Popularity", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLightbulb} className="text-amber-600" />
              AI Dish Popularity
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts new dish success before launch — reduces 60% failure rate (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Predicting…' : 'Evaluate dishes'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : predictions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLightbulb} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No dish predictions!</p>
            <p className="text-sm mt-1">Click "Evaluate dishes" to predict popularity of proposed new items.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faLightbulb} />Dishes evaluated</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.predictionCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">High confidence</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.highConfidenceCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-300 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Predicted revenue/wk</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalPredictedRevenue)}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg popularity</div>
                <div className={`text-2xl font-bold tabular-nums ${popColor(summary.avgPopularity)}`}>{summary.avgPopularity.toFixed(0)}/100</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedPreds.map((p, idx) => {
                const style = RULE_STYLE[p.rule_id] ?? RULE_STYLE.price_point_optimal;
                const ingredients = parseIngredients(p.proposed_ingredients);
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className="font-medium text-lg">{p.proposed_dish_name}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 capitalize">{p.proposed_category}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-bold ${p.launch_recommendation === 'launch_now' ? 'bg-emerald-100 text-emerald-700' : p.launch_recommendation === 'skip' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'} capitalize`}>
                            {p.launch_recommendation?.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Confidence: <strong className={confColor(p.confidence)}>{(p.confidence * 100).toFixed(0)}%</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{p.description}</p>
                    </div>

                    <div className="p-3">
                      {/* Metrics grid */}
                      <div className="grid grid-cols-5 gap-3 mb-3 text-center">
                        <div>
                          <div className="text-xs text-neutral-500">Price</div>
                          <div className="font-bold tabular-nums">{withCurrency(p.proposed_price ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Cat. avg</div>
                          <div className="font-bold tabular-nums text-neutral-500">{withCurrency(p.category_avg_price ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Margin</div>
                          <div className={`font-bold tabular-nums ${(p.est_margin_pct ?? 0) > 65 ? 'text-emerald-600' : 'text-amber-600'}`}>{(p.est_margin_pct ?? 0).toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Orders/wk</div>
                          <div className="font-bold tabular-nums text-emerald-600">{p.predicted_orders_week}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Revenue/wk</div>
                          <div className="font-bold tabular-nums text-emerald-600">{withCurrency(p.predicted_revenue_week)}</div>
                        </div>
                      </div>

                      {/* Popularity bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-neutral-500">Predicted popularity</span>
                          <span className={`font-bold ${popColor(p.predicted_popularity)}`}>{p.predicted_popularity}/100</span>
                        </div>
                        <div className="h-2 bg-neutral-100 rounded">
                          <div className={`h-2 rounded ${popBarColor(p.predicted_popularity)}`} style={{ width: `${p.predicted_popularity}%` }}></div>
                        </div>
                      </div>

                      {/* Similarity + ingredients */}
                      <div className="flex flex-wrap gap-3 mb-3 text-xs">
                        {p.similar_dish && p.similar_dish !== '—' && (
                          <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700">
                            Similar to: {p.similar_dish} ({Math.round(p.similarity_score * 100)}% overlap)
                          </span>
                        )}
                        {ingredients.map((ing, i) => (
                          <span key={i} className="px-2 py-1 rounded bg-violet-100 text-violet-700">{ing}</span>
                        ))}
                      </div>

                      {/* AI insight */}
                      {p.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{p.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => p.id && handleStatus(p.id, 'launched')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Launch
                        </button>
                        <button onClick={() => p.id && handleStatus(p.id, 'tested')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          Test limited
                        </button>
                        <button onClick={() => p.id && handleStatus(p.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Min confidence: <strong>{(config.minConfidence * 100).toFixed(0)}%</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default DishPopularityScreen;
