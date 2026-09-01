/**
 * Menu Optimization Dashboard — BCG menu engineering matrix + AI insights.
 *
 * Research finding: Toast Menu Intelligence $100+/mo (higher tier add-on).
 * Square Menu Insights gated to Plus/Pro. POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (total dishes, stars/dogs counts, total profit, potential gain)
 *   2. BCG matrix 2×2 grid (Stars / Plowhorses / Puzzles / Dogs)
 *   3. Insights table with classification badge, pricing rec, AI insight, action
 *   4. Generate button (collects data + runs analysis with AI enhancement)
 *
 * Placement: new route /reports/menu-optimization
 */

import { useState, useCallback, useMemo } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { Layout } from "@/screens/partials/layout.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar, faHorse, faPuzzlePiece, faDog, faRobot, faChartLine, faArrowTrendUp, faDollarSign, faRotate } from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  generateMenuInsights,
  getMenuInsights,
  readMenuOptConfig,
  DEFAULT_MENU_OPT_CONFIG,
  type MenuInsight,
  type MenuClassification,
  type MenuOptimizationSummary,
} from "@/lib/menu-optimization.service.ts";

const CLASSIFICATION_STYLE: Record<MenuClassification, {
  bg: string; text: string; border: string; icon: any; label: string; description: string;
}> = {
  star:      { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-400',  icon: faStar,          label: 'Star',      description: 'High popularity + high margin — promote & protect' },
  plowhorse: { bg: 'bg-blue-50',   text: 'text-blue-700',    border: 'border-blue-400',   icon: faHorse,         label: 'Plowhorse', description: 'High popularity + low margin — raise price or cut cost' },
  puzzle:    { bg: 'bg-violet-50', text: 'text-violet-700',  border: 'border-violet-400', icon: faPuzzlePiece,   label: 'Puzzle',    description: 'Low popularity + high margin — reposition or rename' },
  dog:       { bg: 'bg-rose-50',   text: 'text-rose-700',    border: 'border-rose-400',    icon: faDog,           label: 'Dog',       description: 'Low popularity + low margin — remove or reprice' },
};

const ACTION_LABEL: Record<string, string> = {
  promote: 'Promote',
  reprice: 'Reprice',
  reposition: 'Reposition',
  remove: 'Remove',
  keep: 'Keep',
};

const ACTION_STYLE: Record<string, string> = {
  promote: 'bg-emerald-100 text-emerald-700',
  reprice: 'bg-amber-100 text-amber-700',
  reposition: 'bg-violet-100 text-violet-700',
  remove: 'bg-rose-100 text-rose-700',
  keep: 'bg-neutral-100 text-neutral-600',
};

const PRICING_LABEL: Record<string, string> = {
  underpriced: 'Underpriced',
  overpriced: 'Overpriced',
  optimal: 'Optimal',
  no_data: 'No data',
};

const PRICING_STYLE: Record<string, string> = {
  underpriced: 'bg-rose-100 text-rose-700',
  overpriced: 'bg-amber-100 text-amber-700',
  optimal: 'bg-emerald-100 text-emerald-700',
  no_data: 'bg-neutral-100 text-neutral-500',
};

export function MenuOptimizationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [insights, setInsights] = useState<MenuInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<'all' | MenuClassification>('all');
  const [config, setConfig] = useState(DEFAULT_MENU_OPT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Load config from settings
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      const settings = settingsRows[0] ?? {};
      setConfig(readMenuOptConfig(settings));

      const list = await getMenuInsights(db);
      setInsights(list);
    } catch (err) {
      console.error('[menu-opt-report] reload failed', err);
      toast.error('Failed to load menu insights');
    } finally {
      setLoading(false);
    }
  }, [db]);

  // Initial load
  useMemo(() => { reload(); }, [reload]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const result = await generateMenuInsights(db, config);
      toast.success(
        `Analyzed ${result.summary.totalDishes} dishes — ${result.summary.stars} stars, ${result.summary.dogs} dogs. Potential gain: ${withCurrency(result.summary.potentialRevenueGain)}`
      );
      await reload();
    } catch (err) {
      console.error('[menu-opt-report] generate failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setGenerating(false);
    }
  }, [db, config, reload]);

  const summary: MenuOptimizationSummary = useMemo(() => {
    return {
      totalDishes: insights.length,
      stars: insights.filter(i => i.classification === 'star').length,
      plowhorses: insights.filter(i => i.classification === 'plowhorse').length,
      puzzles: insights.filter(i => i.classification === 'puzzle').length,
      dogs: insights.filter(i => i.classification === 'dog').length,
      totalRevenue: insights.reduce((s, i) => s + i.revenue, 0),
      totalProfit: insights.reduce((s, i) => s + i.profit, 0),
      avgMarginPct: insights.length > 0 ? insights.reduce((s, i) => s + i.margin_pct, 0) / insights.length : 0,
      underpricedCount: insights.filter(i => i.pricing_recommendation === 'underpriced').length,
      overpricedCount: insights.filter(i => i.pricing_recommendation === 'overpriced').length,
      potentialRevenueGain: insights.reduce((sum, i) => {
        if (i.suggested_price && i.price_change_pct && i.price_change_pct > 0) {
          return sum + (i.suggested_price - (i.revenue / i.units_sold)) * i.units_sold;
        }
        return sum;
      }, 0),
      generatedAt: new Date(),
    };
  }, [insights]);

  const filteredInsights = useMemo(() => {
    if (filter === 'all') return insights;
    return insights.filter(i => i.classification === filter);
  }, [insights, filter]);

  return (
    <Layout>
      <DocumentTitle parts={["Menu Optimization", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-violet-600" />
              Menu Optimization
            </h1>
            <p className="text-sm text-neutral-500">
              AI-powered menu engineering — classify dishes, detect mispricing, surface growth opportunities
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={generating} />
            {generating ? 'Analyzing…' : insights.length > 0 ? 'Re-analyze menu' : 'Analyze menu'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading menu insights…</p>
          </div>
        ) : insights.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChartLine} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No menu insights yet</p>
            <p className="text-sm mt-1">Click "Analyze menu" to run the AI-powered menu engineering analysis.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard icon={faStar} label="Stars" value={summary.stars} color="text-amber-600" />
              <SummaryCard icon={faDog} label="Dogs" value={summary.dogs} color="text-rose-600" />
              <SummaryCard icon={faDollarSign} label="Total profit" value={withCurrency(summary.totalProfit)} color="text-emerald-600" />
              <SummaryCard icon={faArrowTrendUp} label="Avg margin" value={`${summary.avgMarginPct.toFixed(1)}%`} color="text-blue-600" />
              <SummaryCard icon={faArrowTrendUp} label="Potential gain" value={withCurrency(summary.potentialRevenueGain)} color="text-violet-600" />
            </div>

            {/* BCG matrix 2×2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(['star', 'plowhorse', 'puzzle', 'dog'] as MenuClassification[]).map(cls => {
                const style = CLASSIFICATION_STYLE[cls];
                const items = insights.filter(i => i.classification === cls);
                const topItem = items[0];
                return (
                  <button
                    key={cls}
                    onClick={() => setFilter(filter === cls ? 'all' : cls)}
                    className={`${style.bg} ${style.border} border-2 rounded-lg p-4 text-left transition-all hover:shadow-md ${filter === cls ? 'ring-2 ring-offset-2' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={style.icon} className={`text-2xl ${style.text}`} />
                        <div>
                          <div className={`font-bold text-lg ${style.text}`}>{style.label}</div>
                          <div className="text-xs text-neutral-600">{items.length} dishes</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Profit</div>
                        <div className={`font-bold tabular-nums ${style.text}`}>
                          {withCurrency(items.reduce((s, i) => s + i.profit, 0))}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-600">{style.description}</p>
                    {topItem && (
                      <p className="text-xs text-neutral-500 mt-2 truncate">
                        Top: {topItem.dish_name} ({topItem.units_sold} sold)
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 flex-wrap">
              {(['all', 'star', 'plowhorse', 'puzzle', 'dog'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    filter === f
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {f === 'all' ? `All (${insights.length})` : `${CLASSIFICATION_STYLE[f].label} (${insights.filter(i => i.classification === f).length})`}
                </button>
              ))}
            </div>

            {/* Insights table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Dish</th>
                      <th className="text-center p-3">Class</th>
                      <th className="text-right p-3">Units</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">Profit</th>
                      <th className="text-right p-3">Margin</th>
                      <th className="text-right p-3">Food cost</th>
                      <th className="text-center p-3">Pricing</th>
                      <th className="text-right p-3">Suggested</th>
                      <th className="text-left p-3">AI insight</th>
                      <th className="text-center p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInsights.map(ins => {
                      const style = CLASSIFICATION_STYLE[ins.classification];
                      return (
                        <tr key={ins.dish_id} className="border-t hover:bg-neutral-50">
                          <td className="p-3">
                            <div className="font-medium">{ins.dish_name}</div>
                            {ins.category && <div className="text-xs text-neutral-500">{ins.category}</div>}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                              <FontAwesomeIcon icon={style.icon} />
                              {style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{ins.units_sold}</td>
                          <td className="p-3 text-right tabular-nums">{withCurrency(ins.revenue)}</td>
                          <td className="p-3 text-right tabular-nums font-semibold text-emerald-600">{withCurrency(ins.profit)}</td>
                          <td className="p-3 text-right tabular-nums">{ins.margin_pct.toFixed(1)}%</td>
                          <td className="p-3 text-right tabular-nums">
                            {ins.food_cost_pct > 0 ? `${ins.food_cost_pct.toFixed(1)}%` : '—'}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${PRICING_STYLE[ins.pricing_recommendation]}`}>
                              {PRICING_LABEL[ins.pricing_recommendation]}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {ins.suggested_price ? (
                              <span className={ins.price_change_pct && ins.price_change_pct > 0 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>
                                {withCurrency(ins.suggested_price)}
                                {ins.price_change_pct && (
                                  <div className="text-xs">({ins.price_change_pct > 0 ? '+' : ''}{ins.price_change_pct.toFixed(1)}%)</div>
                                )}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="p-3 text-xs text-neutral-600 max-w-xs">
                            {ins.ai_insight ? (
                              <span className="italic">"{ins.ai_insight}"</span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${ACTION_STYLE[ins.ai_action ?? 'keep']}`}>
                              {ACTION_LABEL[ins.ai_action ?? 'keep']}
                            </span>
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
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min sales for popular: <strong>{config.minSalesForPopular} units</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Pricing issues: <strong className="text-rose-600">{summary.underpricedCount} underpriced</strong> / <strong className="text-amber-600">{summary.overpricedCount} overpriced</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon,
  label,
  value,
  color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default MenuOptimizationScreen;
