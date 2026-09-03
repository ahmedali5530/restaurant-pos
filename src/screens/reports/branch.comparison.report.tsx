/**
 * Branch Performance Comparison Dashboard — multi-location benchmarking.
 *
 * 27th POSR-exclusive differentiator — Toast Multi-Location $150+/mo.
 * POSR offers it free — compares all branches + AI insights.
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
  faStore, faRobot, faRotate, faLightbulb,
  faTrophy, faArrowTrendDown, faChartBar,
  faDollarSign, faUsers, faStar, faPercent,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runBranchComparison,
  getBranchComparisons,
  getBranchCompSummary,
  readBranchCompConfig,
  DEFAULT_BRANCH_COMP_CONFIG,
  type BranchComparison,
  type BranchRecommendation,
} from "@/lib/branch-comparison.service.ts";

const REC_LABEL: Record<BranchRecommendation, string> = {
  replicate_practices: 'Replicate practices',
  investigate_decline: 'Investigate decline',
  share_best_practice: 'Share best practice',
  resource_reallocation: 'Reallocate resources',
  maintain_position: 'Maintain position',
  urgent_intervention: 'Urgent intervention',
};

const REC_STYLE: Record<BranchRecommendation, string> = {
  replicate_practices: 'bg-emerald-100 text-emerald-700',
  investigate_decline: 'bg-amber-100 text-amber-700',
  share_best_practice: 'bg-blue-100 text-blue-700',
  resource_reallocation: 'bg-violet-100 text-violet-700',
  maintain_position: 'bg-neutral-100 text-neutral-600',
  urgent_intervention: 'bg-rose-100 text-rose-700',
};

export function BranchComparisonScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [comparisons, setComparisons] = useState<BranchComparison[]>([]);
  const [summary, setSummary] = useState<{
    totalBranches: number; topPerformer?: string; topScore: number;
    underperformer?: string; underperformerScore: number; avgScore: number; totalRevenue: number;
  }>({
    totalBranches: 0, topPerformer: undefined,
    topScore: 0, underperformer: undefined,
    underperformerScore: 0, avgScore: 0, totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_BRANCH_COMP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readBranchCompConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getBranchComparisons(db),
        getBranchCompSummary(db),
      ]);
      setComparisons(list);
      setSummary(sum);
    } catch (err) {
      console.error('[branch-comp-report] reload failed', err);
      toast.error('Failed to load comparisons');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runBranchComparison(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.comparisons.length > 0
          ? `Compared ${result.analyzed} branches — top: ${result.comparisons[0]?.branch_name} (${result.comparisons[0]?.overall_score}/100)`
          : `No branches found to compare`
      );
      await reload();
    } catch (err) {
      console.error('[branch-comp-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Branch Comparison", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faStore} className="text-blue-600" />
              Branch Comparison
            </h1>
            <p className="text-sm text-neutral-500">
              AI multi-location benchmarking — revenue + growth + efficiency + cost + AI insights (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Comparing… (${progress.current}/${progress.total})` : 'Compare branches'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading comparisons…</p>
          </div>
        ) : comparisons.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faStore} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No branches found!</p>
            <p className="text-sm mt-1">Configure multiple inventory stores and click "Compare branches".</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTrophy} />Top performer</div>
                <div className="text-lg font-bold text-emerald-700 truncate">{summary.topPerformer ?? '—'}</div>
                <div className="text-xs text-emerald-600">{summary.topScore}/100</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowTrendDown} />Underperformer</div>
                <div className="text-lg font-bold text-rose-700 truncate">{summary.underperformer ?? '—'}</div>
                <div className="text-xs text-rose-600">{summary.underperformerScore}/100</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Total branches</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.totalBranches}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Avg score</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{Math.round(summary.avgScore)}/100</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Total revenue</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{withCurrency(summary.totalRevenue)}</div>
              </div>
              <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-3 text-center">
                <div className="text-xs text-neutral-600">Score gap</div>
                <div className="text-2xl font-bold text-neutral-700 tabular-nums">{summary.topScore - summary.underperformerScore}</div>
              </div>
            </div>

            {/* Comparison table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    <th className="p-3 text-left">Rank</th>
                    <th className="p-3 text-left">Branch</th>
                    <th className="p-3 text-right">Revenue</th>
                    <th className="p-3 text-right">Growth</th>
                    <th className="p-3 text-right">AOV</th>
                    <th className="p-3 text-right">Orders</th>
                    <th className="p-3 text-right">Rating</th>
                    <th className="p-3 text-right">Labor%</th>
                    <th className="p-3 text-right">Food%</th>
                    <th className="p-3 text-right">Turnover</th>
                    <th className="p-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((comp, idx) => {
                    const isTop = comp.rank === 1;
                    const isBottom = comp.rank === comp.total_branches;
                    return (
                      <tr key={idx} className={`border-b border-neutral-100 ${isTop ? 'bg-emerald-50' : isBottom ? 'bg-rose-50' : ''}`}>
                        <td className="p-3">
                          <span className={`font-bold tabular-nums ${isTop ? 'text-emerald-600' : isBottom ? 'text-rose-600' : 'text-neutral-700'}`}>
                            #{comp.rank}
                          </span>
                        </td>
                        <td className="p-3 font-semibold">{comp.branch_name}</td>
                        <td className="p-3 text-right tabular-nums">{withCurrency(comp.total_revenue)}</td>
                        <td className={`p-3 text-right tabular-nums ${comp.revenue_growth_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {comp.revenue_growth_pct >= 0 ? '+' : ''}{comp.revenue_growth_pct.toFixed(1)}%
                        </td>
                        <td className="p-3 text-right tabular-nums">{withCurrency(comp.avg_order_value)}</td>
                        <td className="p-3 text-right tabular-nums">{comp.order_count}</td>
                        <td className="p-3 text-right tabular-nums">
                          {comp.avg_customer_rating > 0 ? (
                            <span className="flex items-center justify-end gap-1">
                              <FontAwesomeIcon icon={faStar} className="text-amber-400 text-xs" />
                              {comp.avg_customer_rating.toFixed(1)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="p-3 text-right tabular-nums text-neutral-600">{comp.labor_cost_pct.toFixed(1)}%</td>
                        <td className="p-3 text-right tabular-nums text-neutral-600">{comp.food_cost_pct.toFixed(1)}%</td>
                        <td className="p-3 text-right tabular-nums">{comp.turnover_rate.toFixed(1)}/day</td>
                        <td className="p-3 text-right">
                          <span className={`font-bold tabular-nums px-2 py-1 rounded ${
                            comp.overall_score >= 75 ? 'bg-emerald-100 text-emerald-700' :
                            comp.overall_score >= 50 ? 'bg-amber-100 text-amber-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {comp.overall_score}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* AI insights per branch */}
            <div className="space-y-3">
              {comparisons.filter(c => c.ai_insight).map((comp, idx) => (
                <div key={idx} className={`rounded-lg border-2 p-4 ${
                  comp.rank === 1 ? 'bg-emerald-50 border-emerald-400' :
                  comp.rank === comp.total_branches ? 'bg-rose-50 border-rose-400' :
                  'bg-white border-neutral-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <FontAwesomeIcon icon={comp.rank === 1 ? faTrophy : faStore} className={`text-xl ${comp.rank === 1 ? 'text-emerald-600' : 'text-neutral-500'}`} />
                    <span className="font-semibold">{comp.branch_name}</span>
                    <span className="text-sm text-neutral-500">· Rank #{comp.rank} of {comp.total_branches}</span>
                    {comp.ai_recommendation && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[comp.ai_recommendation]}`}>
                        AI: {REC_LABEL[comp.ai_recommendation]}
                      </span>
                    )}
                  </div>
                  {comp.ai_insight && (
                    <div className="bg-violet-50/70 rounded p-2 border border-violet-200">
                      <p className="text-xs text-violet-700 italic">
                        <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{comp.ai_insight}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Previous period: <strong>{config.prevDays} days</strong></span>
              <span>10 metrics per branch</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default BranchComparisonScreen;
