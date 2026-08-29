/**
 * Vendor Performance Dashboard — supplier scorecards + AI recommendations.
 *
 * Research finding: Square Vendor Management $40/mo, Toast Supplier
 * Management add-on. POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (total suppliers, total spend, avg score, potential savings)
 *   2. Grade distribution (A/B/C/D/F counts)
 *   3. Supplier scorecards table (sortable by score/spend/on-time/quality)
 *   4. AI recommendations panel (renegotiate/diversify/consolidate/drop/keep/monitor)
 *   5. Generate button (runs analysis with AI enhancement)
 *
 * Placement: new route /reports/vendor-performance
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
  faTruck, faDollarSign, faGaugeHigh, faArrowTrendUp, faRobot, faRotate,
  faLightbulb, faCheck, faXmark, faEye, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeVendorPerformance,
  getVendorPerformances,
  getOpenVendorInsights,
  updateInsightStatus,
  readVendorConfig,
  DEFAULT_VENDOR_CONFIG,
  type VendorPerformance,
  type VendorInsight,
  type VendorRecommendation,
  type VendorGrade,
} from "@/lib/vendor-performance.service.ts";

const GRADE_STYLE: Record<VendorGrade, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'A — Excellent' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'B — Good' },
  C: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'C — Average' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'D — Below average' },
  F: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'F — Poor' },
};

const RECOMMENDATION_STYLE: Record<VendorRecommendation, { bg: string; text: string; label: string }> = {
  renegotiate: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Renegotiate' },
  diversify: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Diversify' },
  consolidate: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Consolidate' },
  drop: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Drop' },
  keep: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Keep' },
  monitor: { bg: 'bg-neutral-100', text: 'text-neutral-600', label: 'Monitor' },
};

export function VendorPerformanceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [performances, setPerformances] = useState<VendorPerformance[]>([]);
  const [insights, setInsights] = useState<VendorInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_VENDOR_CONFIG);
  const [sortBy, setSortBy] = useState<'score' | 'spend' | 'on_time' | 'name'>('score');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readVendorConfig(settingsRows[0] ?? {}));
      const [perfs, ins] = await Promise.all([
        getVendorPerformances(db),
        getOpenVendorInsights(db),
      ]);
      setPerformances(perfs);
      setInsights(ins);
    } catch (err) {
      console.error('[vendor-report] reload failed', err);
      toast.error('Failed to load vendor data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 4 });
    try {
      const result = await analyzeVendorPerformance(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        `Analyzed ${result.performances.length} suppliers — potential savings: ${withCurrency(result.potentialSavings)}/yr`
      );
      await reload();
    } catch (err) {
      console.error('[vendor-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleInsightAction = useCallback(async (insightId: string, status: 'acknowledged' | 'acted_on' | 'dismissed') => {
    try {
      await updateInsightStatus(db, insightId, status);
      toast.success(`Insight ${status}`);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update insight');
    }
  }, [db, reload]);

  const stats = useMemo(() => {
    const totalSpend = performances.reduce((s, p) => s + p.total_spend, 0);
    const avgScore = performances.length > 0
      ? performances.reduce((s, p) => s + p.overall_score, 0) / performances.length
      : 0;
    const gradeCounts: Record<VendorGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const p of performances) gradeCounts[p.grade]++;
    const potentialSavings = insights.reduce((s, i) => s + (i.projected_savings ?? 0), 0);
    return { totalSpend, avgScore, gradeCounts, potentialSavings };
  }, [performances, insights]);

  const sortedPerformances = useMemo(() => {
    const sorted = [...performances];
    switch (sortBy) {
      case 'score': sorted.sort((a, b) => b.overall_score - a.overall_score); break;
      case 'spend': sorted.sort((a, b) => b.total_spend - a.total_spend); break;
      case 'on_time': sorted.sort((a, b) => b.on_time_rate - a.on_time_rate); break;
      case 'name': sorted.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)); break;
    }
    return sorted;
  }, [performances, sortBy]);

  return (
    <Layout>
      <DocumentTitle parts={["Vendor Performance", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTruck} className="text-blue-600" />
              Vendor Performance
            </h1>
            <p className="text-sm text-neutral-500">
              Supplier scorecards — on-time delivery, quality, price + AI recommendations
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze vendors'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading vendor data…</p>
          </div>
        ) : performances.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTruck} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No vendor analysis yet</p>
            <p className="text-sm mt-1">Click "Analyze vendors" to generate supplier scorecards.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faTruck} label="Suppliers" value={performances.length} color="text-blue-600" />
              <SummaryCard icon={faDollarSign} label="Total spend" value={withCurrency(stats.totalSpend)} color="text-emerald-600" />
              <SummaryCard icon={faGaugeHigh} label="Avg score" value={`${stats.avgScore.toFixed(0)}/100`} color="text-violet-600" />
              <SummaryCard icon={faArrowTrendUp} label="Potential savings" value={withCurrency(stats.potentialSavings) + '/yr'} color="text-amber-600" />
            </div>

            {/* Grade distribution */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3">Grade distribution</h3>
              <div className="flex gap-2 flex-wrap">
                {(['A', 'B', 'C', 'D', 'F'] as VendorGrade[]).map(g => (
                  <div key={g} className={`px-4 py-2 rounded-lg ${GRADE_STYLE[g].bg} ${GRADE_STYLE[g].text}`}>
                    <div className="text-2xl font-bold">{g}</div>
                    <div className="text-xs">{stats.gradeCounts[g]} suppliers</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sort controls */}
            <div className="flex gap-2 items-center">
              <span className="text-sm text-neutral-500">Sort by:</span>
              {(['score', 'spend', 'on_time', 'name'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    sortBy === s ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {s === 'on_time' ? 'On-time %' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* Supplier scorecards table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Supplier</th>
                      <th className="text-center p-3">Grade</th>
                      <th className="text-right p-3">Score</th>
                      <th className="text-right p-3">Orders</th>
                      <th className="text-right p-3">Spend</th>
                      <th className="text-right p-3">On-time</th>
                      <th className="text-right p-3">Quality</th>
                      <th className="text-right p-3">Price comp.</th>
                      <th className="text-right p-3">Lead days</th>
                      <th className="text-center p-3">Trend</th>
                      <th className="text-right p-3">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPerformances.map(p => (
                      <tr key={p.supplier_id} className="border-t hover:bg-neutral-50">
                        <td className="p-3 font-medium">{p.supplier_name}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${GRADE_STYLE[p.grade].bg} ${GRADE_STYLE[p.grade].text}`}>
                            {p.grade}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold">{p.overall_score}</td>
                        <td className="p-3 text-right tabular-nums">{p.total_orders}</td>
                        <td className="p-3 text-right tabular-nums font-medium">{withCurrency(p.total_spend)}</td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={p.on_time_rate >= 0.8 ? 'text-emerald-600' : p.on_time_rate >= 0.5 ? 'text-amber-600' : 'text-rose-600'}>
                            {(p.on_time_rate * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={p.quality_score >= 0.9 ? 'text-emerald-600' : p.quality_score >= 0.7 ? 'text-amber-600' : 'text-rose-600'}>
                            {(p.quality_score * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={p.price_competitiveness >= 0.7 ? 'text-emerald-600' : p.price_competitiveness >= 0.4 ? 'text-amber-600' : 'text-rose-600'}>
                            {(p.price_competitiveness * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">{p.avg_lead_days.toFixed(1)}d</td>
                        <td className="p-3 text-center">
                          {p.trend_direction === 'improving' && <span className="text-emerald-600">↑</span>}
                          {p.trend_direction === 'declining' && <span className="text-rose-600">↓</span>}
                          {p.trend_direction === 'stable' && <span className="text-neutral-400">→</span>}
                        </td>
                        <td className="p-3 text-right tabular-nums text-neutral-500">{p.unique_items}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI Recommendations */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium flex items-center gap-2">
                  <FontAwesomeIcon icon={faLightbulb} className="text-amber-500" />
                  AI Recommendations
                </h3>
                {stats.potentialSavings > 0 && (
                  <span className="text-sm text-emerald-600 font-semibold">
                    Total potential savings: {withCurrency(stats.potentialSavings)}/yr
                  </span>
                )}
              </div>
              {insights.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-6">
                  No open recommendations. Click "Analyze vendors" to generate insights.
                </p>
              ) : (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  {insights.map((insight, idx) => {
                    const style = RECOMMENDATION_STYLE[insight.recommendation];
                    return (
                      <div key={idx} className="border border-neutral-200 rounded-lg p-3 hover:bg-neutral-50">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{insight.supplier_name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${insight.priority === 'high' ? 'bg-rose-100 text-rose-700' : insight.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600'}`}>
                              {insight.priority} priority
                            </span>
                            {insight.confidence < 0.6 && (
                              <span className="text-xs text-neutral-400">{Math.round(insight.confidence * 100)}% confidence</span>
                            )}
                          </div>
                          {insight.projected_savings && insight.projected_savings > 0 && (
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-semibold text-emerald-600 tabular-nums">
                                {withCurrency(insight.projected_savings)}/yr
                              </div>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-neutral-700 mb-1">{insight.insight_text}</p>
                        {insight.action && (
                          <p className="text-xs text-neutral-500 italic mb-2">→ {insight.action}</p>
                        )}
                        <div className="flex gap-1">
                          <button
                            onClick={() => insight.id && handleInsightAction(insight.id, 'acknowledged')}
                            className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200"
                          >
                            <FontAwesomeIcon icon={faEye} /> Ack
                          </button>
                          <button
                            onClick={() => insight.id && handleInsightAction(insight.id, 'acted_on')}
                            className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          >
                            <FontAwesomeIcon icon={faCheck} /> Acted
                          </button>
                          <button
                            onClick={() => insight.id && handleInsightAction(insight.id, 'dismissed')}
                            className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                          >
                            <FontAwesomeIcon icon={faXmark} /> Dismiss
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min orders: <strong>{config.minOrders}</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Critical items only: <strong>{config.criticalItemsOnly ? 'yes' : 'no'}</strong></span>
              <span>Open insights: <strong className="text-amber-600">{insights.length}</strong></span>
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

export default VendorPerformanceScreen;
