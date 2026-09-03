/**
 * Recipe Cost Optimization Dashboard — per-dish cost breakdown + margin + AI recs.
 *
 * Research finding: Toast Recipe Engineering $40+/mo (higher tier), Square
 * Recipe Costing in Plus. POSR offers it free.
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
  faUtensils, faChartLine, faDollarSign, faRobot, faRotate,
  faLightbulb, faPercent,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeRecipeCosts,
  getRecipeAnalyses,
  readRecipeConfig,
  DEFAULT_RECIPE_CONFIG,
  type RecipeCostAnalysis,
  type RecipeGrade,
} from "@/lib/recipe-optimization.service.ts";

const GRADE_STYLE: Record<RecipeGrade, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'A — Excellent (<24%)' },
  B: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'B — Good (24-30%)' },
  C: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'C — Average (30-40%)' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'D — High (40-44%)' },
  F: { bg: 'bg-rose-100',   text: 'text-rose-700',   label: 'F — Critical (>44%)' },
};

const REC_LABEL: Record<string, string> = {
  substitute: 'Substitute ingredient', reportion: 'Reduce portion', reprice: 'Increase price',
  redesign: 'Redesign recipe', keep: 'Keep as-is',
};

export function RecipeOptimizationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [analyses, setAnalyses] = useState<RecipeCostAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_RECIPE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readRecipeConfig(settingsRows[0] ?? {}));
      const list = await getRecipeAnalyses(db);
      setAnalyses(list);
    } catch (err) {
      console.error('[recipe-report] reload failed', err);
      toast.error('Failed to load recipe data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await analyzeRecipeCosts(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setAnalyses(result.analyses);
      toast.success(
        `Analyzed ${result.totalDishes} dishes — avg food cost ${result.avgFoodCostPct}%, potential savings ${withCurrency(result.totalPotentialSavings)}/mo`
      );
    } catch (err) {
      console.error('[recipe-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const stats = useMemo(() => {
    if (analyses.length === 0) return { avgFoodCost: 0, potentialSavings: 0, criticalCount: 0, goodCount: 0 };
    return {
      avgFoodCost: analyses.reduce((s, a) => s + a.food_cost_pct, 0) / analyses.length,
      potentialSavings: analyses.reduce((s, a) => s + (a.potential_savings ?? 0), 0),
      criticalCount: analyses.filter(a => a.grade === 'D' || a.grade === 'F').length,
      goodCount: analyses.filter(a => a.grade === 'A' || a.grade === 'B').length,
    };
  }, [analyses]);

  return (
    <Layout>
      <DocumentTitle parts={["Recipe Optimization", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUtensils} className="text-violet-600" />
              Recipe Cost Optimization
            </h1>
            <p className="text-sm text-neutral-500">
              Per-dish recipe cost breakdown + food cost % + margin + AI recommendations (substitute/reportion/reprice/redesign)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze recipes'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading recipe data…</p>
          </div>
        ) : analyses.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUtensils} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No recipe cost data yet</p>
            <p className="text-sm mt-1">Click "Analyze recipes" to compute per-dish cost breakdowns.</p>
            <p className="text-xs mt-2">Requires dishes with recipe items (menu_item_recipe) configured.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faUtensils} label="Dishes analyzed" value={analyses.length} color="text-violet-600" />
              <SummaryCard icon={faPercent} label="Avg food cost" value={`${stats.avgFoodCost.toFixed(1)}%`} color={stats.avgFoodCost > config.criticalFoodCostPct ? 'text-rose-600' : stats.avgFoodCost > config.targetFoodCostPct ? 'text-amber-600' : 'text-emerald-600'} />
              <SummaryCard icon={faChartLine} label="Critical (D/F)" value={stats.criticalCount} color="text-rose-600" />
              <SummaryCard icon={faDollarSign} label="Potential savings" value={withCurrency(stats.potentialSavings) + '/mo'} color="text-emerald-600" />
            </div>

            {/* Recipes table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Dish</th>
                      <th className="text-center p-3">Grade</th>
                      <th className="text-right p-3">Price</th>
                      <th className="text-right p-3">Recipe cost</th>
                      <th className="text-right p-3">Food cost %</th>
                      <th className="text-right p-3">Margin %</th>
                      <th className="text-right p-3">Margin $</th>
                      <th className="text-right p-3">Ingredients</th>
                      <th className="text-left p-3">Top cost ingredient</th>
                      <th className="text-center p-3">AI rec</th>
                      <th className="text-left p-3">AI insight</th>
                      <th className="text-right p-3">Savings/mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyses.map((a, idx) => {
                      const grade = GRADE_STYLE[a.grade];
                      const topIng = a.top_cost_ingredients?.[0];
                      return (
                        <tr key={idx} className="border-t hover:bg-neutral-50">
                          <td className="p-3 font-medium">{a.dish_name}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center mx-auto ${grade.bg} ${grade.text}`} title={grade.label}>
                              {a.grade}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{withCurrency(a.dish_price)}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{withCurrency(a.total_recipe_cost)}</td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={a.food_cost_pct > config.criticalFoodCostPct ? 'text-rose-600 font-semibold' : a.food_cost_pct > config.targetFoodCostPct ? 'text-amber-600' : 'text-emerald-600'}>
                              {a.food_cost_pct}%
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={a.margin_pct > 70 ? 'text-emerald-600' : a.margin_pct > 60 ? 'text-amber-600' : 'text-rose-600'}>
                              {a.margin_pct}%
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold text-emerald-600">{withCurrency(a.margin_amount)}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{a.ingredient_count}</td>
                          <td className="p-3 text-xs">
                            {topIng ? (
                              <span>
                                {topIng.name} ({withCurrency(topIng.cost)}, {topIng.pct_of_total}%)
                              </span>
                            ) : '—'}
                          </td>
                          <td className="p-3 text-center">
                            {a.ai_recommendation && (
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                a.ai_recommendation === 'keep' ? 'bg-emerald-100 text-emerald-700' :
                                a.ai_recommendation === 'reprice' ? 'bg-amber-100 text-amber-700' :
                                a.ai_recommendation === 'substitute' ? 'bg-violet-100 text-violet-700' :
                                a.ai_recommendation === 'redesign' ? 'bg-rose-100 text-rose-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {REC_LABEL[a.ai_recommendation] ?? a.ai_recommendation}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-violet-600 italic max-w-xs">
                            {a.ai_insight ? `"${a.ai_insight}"` : <span className="text-neutral-400">—</span>}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {a.potential_savings ? <span className="text-emerald-600 font-semibold">{withCurrency(a.potential_savings)}</span> : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Target food cost: <strong>{config.targetFoodCostPct}%</strong></span>
              <span>Critical threshold: <strong>{config.criticalFoodCostPct}%</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Good (A/B): <strong className="text-emerald-600">{stats.goodCount}</strong></span>
              <span>Critical (D/F): <strong className="text-rose-600">{stats.criticalCount}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon, label, value, color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default RecipeOptimizationScreen;
