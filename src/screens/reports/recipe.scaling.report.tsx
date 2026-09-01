/**
 * AI Recipe Scaling Optimizer — scale recipes with culinary science dashboard.
 *
 * 59th POSR-exclusive differentiator — recipe scaling is NOT linear (CIA
 * Culinary Institute research).
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
  faScaleBalanced, faRotate, faLightbulb, faCheckCircle,
  faUtensils, faPepperHot, faDroplet, faClock, faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runRecipeScaleEngine, getActiveScalings, getSummary, updateScalingStatus,
  readRecipeScaleConfig, DEFAULT_RECIPE_SCALE_CONFIG,
  type RecipeScaling,
} from "@/lib/recipe-scaling.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  bulk_scaling:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faDollarSign,       label: 'BULK SCALING' },
  spice_adjustment:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faPepperHot,        label: 'SPICE ADJUSTMENT' },
  liquid_adjustment:   { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faDroplet,          label: 'LIQUID ADJUSTMENT' },
  cooking_time:        { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faClock,            label: 'COOKING TIME' },
  cost_per_portion:    { bg: 'bg-neutral-50',  text: 'text-neutral-700', icon: faDollarSign,       label: 'COST/PORTION' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const CATEGORY_STYLE: Record<string, string> = {
  spice:      'bg-amber-100 text-amber-700',
  salt:       'bg-amber-100 text-amber-700',
  leavening:  'bg-yellow-100 text-yellow-700',
  liquid:     'bg-blue-100 text-blue-700',
  garnish:    'bg-emerald-100 text-emerald-700',
  main:       'bg-neutral-100 text-neutral-700',
};

const parseIngredients = (json?: string): Array<{ name: string; base_qty: number; scaled_qty: number; adjustment_factor: number; linear_factor: number; category: string; unit: string; cost: number }> => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseEquipment = (json?: string): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export function RecipeScalingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [scalings, setScalings] = useState<RecipeScaling[]>([]);
  const [summary, setSummary] = useState({ recipeCount: 0, totalServings: 0, totalCost: 0, totalSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_RECIPE_SCALE_CONFIG);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readRecipeScaleConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveScalings(db), getSummary(db)]);
      setScalings(list); setSummary(sum);
    } catch (err) { console.error('[recipe-scale-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runRecipeScaleEngine(db, config);
      toast.success(result.scalings.length > 0
        ? `Scaled ${result.scalings.length} recipes to ${config.defaultTarget} servings each`
        : `No recipes to scale — need menu items with ingredients`);
      await reload();
    } catch (err) { console.error('[recipe-scale-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (scalingId: string, status: 'applied' | 'adjusted' | 'declined') => {
    try { await updateScalingStatus(db, scalingId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: by target_servings desc
  const sortedScalings = [...scalings].sort((a, b) => b.target_servings - a.target_servings);

  return (
    <Layout>
      <DocumentTitle parts={["Recipe Scaling", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faScaleBalanced} className="text-violet-600" />
              AI Recipe Scaling
            </h1>
            <p className="text-sm text-neutral-500">
              Scales recipes with culinary science — spices, liquids, cooking time (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Scaling…' : 'Scale recipes'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : scalings.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faScaleBalanced} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No scaled recipes yet!</p>
            <p className="text-sm mt-1">Click "Scale recipes" to generate bulk ingredient lists with culinary adjustments.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faUtensils} />Recipes scaled</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.recipeCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Total servings</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.totalServings}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Total cost</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalCost)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Bulk savings</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalSavings)}</div>
              </div>
            </div>

            {/* Scalings list */}
            <div className="space-y-3">
              {sortedScalings.map((s, idx) => {
                const style = RULE_STYLE[s.rule_id] ?? RULE_STYLE.bulk_scaling;
                const isExpanded = expandedId === s.id;
                const ingredients = parseIngredients(s.adjusted_ingredients);
                const equipment = parseEquipment(s.equipment_needed);
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    {/* Header */}
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[s.severity] ?? SEVERITY_DOT.low}`}></span>
                          <span className="font-medium">{s.recipe_name}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700">{s.base_servings} → {s.target_servings} servings</span>
                          <span className="text-xs text-neutral-500">×{s.scale_factor}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Cost: <strong className="text-rose-600">{withCurrency(s.total_cost)}</strong></span>
                          <span className="text-neutral-500">/portion: <strong className="text-amber-600">{withCurrency(s.cost_per_portion)}</strong></span>
                          {s.cooking_time_minutes && <span className="text-neutral-500"><FontAwesomeIcon icon={faClock} /> {s.cooking_time_minutes}min</span>}
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{s.description}</p>
                    </div>

                    {/* Metrics */}
                    <div className="p-3">
                      <div className="grid grid-cols-4 gap-3 mb-3 text-center">
                        <div>
                          <div className="text-xs text-neutral-500">Total cost</div>
                          <div className="font-bold text-rose-600 tabular-nums">{withCurrency(s.total_cost)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Per portion</div>
                          <div className="font-bold text-amber-600 tabular-nums">{withCurrency(s.cost_per_portion)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Est waste</div>
                          <div className="font-bold text-orange-600 tabular-nums">{(s.est_waste_pct * 100).toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Bulk savings</div>
                          <div className="font-bold text-emerald-600 tabular-nums">{withCurrency(s.est_savings)}</div>
                        </div>
                      </div>

                      {/* Expandable ingredients */}
                      {ingredients.length > 0 && (
                        <div className="mb-3">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : s.id ?? null)}
                            className="text-xs text-violet-600 hover:underline mb-1 flex items-center gap-1"
                          >
                            <FontAwesomeIcon icon={faLightbulb} />
                            {isExpanded ? 'Hide' : 'Show'} scaled ingredients ({ingredients.length})
                          </button>
                          {isExpanded && (
                            <div className="bg-violet-50/50 p-3 rounded border border-violet-100 overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-neutral-500">
                                    <th className="text-left p-1">Ingredient</th>
                                    <th className="text-left p-1">Category</th>
                                    <th className="text-right p-1">Base qty</th>
                                    <th className="text-right p-1">Scaled qty</th>
                                    <th className="text-right p-1">Adj factor</th>
                                    <th className="text-right p-1">Linear</th>
                                    <th className="text-right p-1">Cost</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ingredients.map((ing, i) => (
                                    <tr key={i} className="border-t border-violet-100">
                                      <td className="p-1 font-medium">{ing.name}</td>
                                      <td className="p-1">
                                        <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${CATEGORY_STYLE[ing.category] ?? CATEGORY_STYLE.main}`}>
                                          {ing.category}
                                        </span>
                                      </td>
                                      <td className="p-1 text-right tabular-nums">{ing.base_qty} {ing.unit}</td>
                                      <td className="p-1 text-right tabular-nums font-semibold">{ing.scaled_qty} {ing.unit}</td>
                                      <td className={`p-1 text-right tabular-nums ${ing.adjustment_factor < ing.linear_factor ? 'text-amber-600' : ing.adjustment_factor > ing.linear_factor ? 'text-emerald-600' : 'text-neutral-500'}`}>
                                        {ing.adjustment_factor}
                                      </td>
                                      <td className="p-1 text-right tabular-nums text-neutral-400">{ing.linear_factor}</td>
                                      <td className="p-1 text-right tabular-nums">{withCurrency(ing.cost)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Equipment */}
                      {equipment.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-neutral-500 mb-1"><FontAwesomeIcon icon={faUtensils} className="mr-1" />Equipment needed:</div>
                          <div className="flex flex-wrap gap-2">
                            {equipment.map((eq, i) => (
                              <span key={i} className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700">{eq}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI insight */}
                      {s.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{s.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => s.id && handleStatus(s.id, 'applied')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Use
                        </button>
                        <button onClick={() => s.id && handleStatus(s.id, 'adjusted')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          Adjust
                        </button>
                        <button onClick={() => s.id && handleStatus(s.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          Skip
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
              <span>Default target: <strong>{config.defaultTarget} servings</strong></span>
              <span>Bulk threshold: <strong>{config.bulkDiscountThreshold}+ servings</strong></span>
              <span>Waste benchmark: <strong>{(config.wasteBenchmarkPct * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default RecipeScalingScreen;
