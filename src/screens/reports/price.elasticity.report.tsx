/**
 * Price Elasticity Analysis Dashboard — optimal pricing per menu item.
 *
 * 14th POSR-exclusive differentiator — Toast and Square have NO price
 * elasticity analysis. Enterprise tools charge $500+/mo. POSR free.
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
  faChartLine, faArrowTrendUp, faArrowTrendDown, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faEye, faTags,
  faUtensils, faDollarSign, faPercent,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runElasticityAnalysis,
  getElasticityResults,
  getElasticitySummary,
  updateElasticityAction,
  readElasticityConfig,
  DEFAULT_ELASTICITY_CONFIG,
  type PriceElasticityResult,
  type ElasticityType,
  type PriceAction,
} from "@/lib/price-elasticity.service.ts";

const ELASTICITY_STYLE: Record<ElasticityType, { bg: string; text: string; label: string }> = {
  elastic:    { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Elastic (price-sensitive)' },
  inelastic:  { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Inelastic (price-insensitive)' },
  unitary:    { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Unitary' },
  insufficient_data: { bg: 'bg-neutral-50', text: 'text-neutral-500', label: 'Insufficient data' },
};

const ACTION_STYLE: Record<PriceAction, { bg: string; text: string; icon: any; label: string }> = {
  raise_price:    { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: faArrowTrendUp,   label: 'Raise price' },
  lower_price:    { bg: 'bg-blue-100',    text: 'text-blue-700',    icon: faArrowTrendDown, label: 'Lower price' },
  keep_price:     { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: faCheckCircle,    label: 'Keep price' },
  insufficient_data: { bg: 'bg-neutral-100', text: 'text-neutral-400', icon: faEye, label: 'Insufficient data' },
};

export function PriceElasticityScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [results, setResults] = useState<PriceElasticityResult[]>([]);
  const [summary, setSummary] = useState({
    total: 0, raisePrice: 0, lowerPrice: 0, elastic: 0, inelastic: 0, totalRevenueImpact: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_ELASTICITY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readElasticityConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getElasticityResults(db),
        getElasticitySummary(db),
      ]);
      setResults(list);
      setSummary(sum);
    } catch (err) {
      console.error('[elasticity-report] reload failed', err);
      toast.error('Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runElasticityAnalysis(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.results.length > 0
          ? `Analyzed ${result.analyzed} menu items — ${result.results.length} have pricing recommendations (${withCurrency(summary.totalRevenueImpact * 52)}/yr potential)`
          : `Analyzed ${result.analyzed} items — no pricing changes recommended`
      );
      await reload();
    } catch (err) {
      console.error('[elasticity-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload, summary.totalRevenueImpact]);

  const handleAction = useCallback(async (resultId: string, action: string) => {
    try {
      await updateElasticityAction(db, resultId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Price Elasticity Analysis", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-emerald-600" />
              Price Elasticity Analysis
            </h1>
            <p className="text-sm text-neutral-500">
              AI optimal pricing per menu item — elasticity coefficient + revenue-maximizing price (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Run analysis'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading results…</p>
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No pricing changes needed!</p>
            <p className="text-sm mt-1">All items at optimal price. Click "Run analysis" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1">
                  <FontAwesomeIcon icon={faArrowTrendUp} />Raise
                </div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.raisePrice}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1">
                  <FontAwesomeIcon icon={faArrowTrendDown} />Lower
                </div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.lowerPrice}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Elastic</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.elastic}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Inelastic</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.inelastic}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Items</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Weekly impact</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">
                  {summary.totalRevenueImpact >= 0 ? '+' : ''}{withCurrency(summary.totalRevenueImpact)}
                </div>
              </div>
            </div>

            {/* Result list */}
            <div className="space-y-3">
              {results.map((result, idx) => {
                const elStyle = ELASTICITY_STYLE[result.elasticity_type] ?? ELASTICITY_STYLE.unitary;
                const actStyle = ACTION_STYLE[result.recommended_action] ?? ACTION_STYLE.keep_price;
                const revenuePositive = result.est_weekly_revenue_change >= 0;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${elStyle.bg} border-neutral-200`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faUtensils} className="text-xl text-neutral-500" />
                        <span className="font-semibold">{result.menu_item_name}</span>
                        {result.category && <span className="text-sm text-neutral-500">· {result.category}</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${elStyle.bg} ${elStyle.text} border border-current`}>
                          {elStyle.label}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-4">
                        <div>
                          <div className="text-xs text-neutral-500">Elasticity</div>
                          <div className="font-bold tabular-nums text-neutral-700">{result.elasticity_coef.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Confidence</div>
                          <div className="font-bold tabular-nums text-neutral-700">{Math.round(result.confidence_score * 100)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Weekly impact</div>
                          <div className={`font-bold tabular-nums ${revenuePositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {revenuePositive ? '+' : ''}{withCurrency(result.est_weekly_revenue_change)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Price comparison */}
                    <div className="bg-white/70 rounded p-3 mb-2 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-6">
                        <div>
                          <div className="text-xs text-neutral-500">Current price</div>
                          <div className="text-xl font-bold tabular-nums text-neutral-700">{withCurrency(result.current_price)}</div>
                        </div>
                        <FontAwesomeIcon icon={faArrowTrendUp} className="text-neutral-400" rotation={result.recommended_price > result.current_price ? 0 : 180} />
                        <div>
                          <div className="text-xs text-neutral-500">Recommended</div>
                          <div className={`text-xl font-bold tabular-nums ${actStyle.text}`}>{withCurrency(result.recommended_price)}</div>
                        </div>
                        <div className="text-xs">
                          <div className="text-neutral-500">Change</div>
                          <div className={`font-bold tabular-nums ${result.recommended_price > result.current_price ? 'text-emerald-600' : 'text-blue-600'}`}>
                            {result.recommended_price > result.current_price ? '+' : ''}{(((result.recommended_price - result.current_price) / result.current_price) * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${actStyle.bg} ${actStyle.text}`}>
                        <FontAwesomeIcon icon={actStyle.icon} className="mr-1" />{actStyle.label}
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="flex gap-4 text-xs text-neutral-600 mb-2">
                      <span><FontAwesomeIcon icon={faDollarSign} className="mr-1 text-neutral-400" />Food cost: {withCurrency(result.food_cost)}</span>
                      <span><FontAwesomeIcon icon={faPercent} className="mr-1 text-neutral-400" />Margin: {result.current_margin_pct.toFixed(1)}%</span>
                      <span><FontAwesomeIcon icon={faTags} className="mr-1 text-neutral-400" />Avg weekly: {result.avg_weekly_qty.toFixed(0)} units / {withCurrency(result.avg_weekly_revenue)}</span>
                      <span>Revenue impact: <strong className={revenuePositive ? 'text-emerald-600' : 'text-rose-600'}>{revenuePositive ? '+' : ''}{result.est_revenue_impact_pct.toFixed(1)}%</strong></span>
                      <span>Data points: {result.data_points}</span>
                    </div>

                    {/* AI insight */}
                    {result.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{result.ai_insight}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 items-center">
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => result.id && handleAction(result.id, 'price_adjusted')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} /> Adjust price
                        </button>
                        <button onClick={() => result.id && handleAction(result.id, 'reviewed')}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faEye} /> Review
                        </button>
                        <button onClick={() => result.id && handleAction(result.id, 'dismissed')}
                          className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          <FontAwesomeIcon icon={faXmark} /> Dismiss
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
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min data points: <strong>{config.minDataPoints}</strong></span>
              <span>Min weekly qty: <strong>{config.minWeeklyQty}</strong></span>
              <span>Margin floor: <strong>× {config.marginFloorMultiplier}</strong></span>
              <span>Max increase: <strong>+{(config.maxPriceIncreasePct * 100).toFixed(0)}%</strong></span>
              <span>Max decrease: <strong>-{(config.maxPriceDecreasePct * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default PriceElasticityScreen;
