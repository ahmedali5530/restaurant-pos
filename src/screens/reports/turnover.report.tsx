/**
 * Table Turnover Optimization Dashboard — per-table metrics + AI recommendations.
 *
 * Research finding: Toast Table Management $50+/mo (higher tier), Lightspeed
 * equivalent in Pro. POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (tables analyzed, total revenue, avg turnover, potential impact)
 *   2. Grade distribution (A/B/C/D/F counts)
 *   3. Per-table scorecards (sortable, with occupancy/turnover/revenue/utilization)
 *   4. AI recommendations panel (combine/reseat_faster/adjust_capacity/remove/promote_location/monitor)
 *   5. Analyze button
 *
 * Placement: new route /reports/table-turnover
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
  faChair, faDollarSign, faRotate, faArrowTrendUp, faRobot, faClock,
  faLightbulb, faCheck, faXmark, faEye, faUsers, faStopwatch,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeTableTurnover,
  getTableTurnoverAnalyses,
  getOpenTurnoverInsights,
  updateTurnoverInsightStatus,
  readTurnoverConfig,
  DEFAULT_TURNOVER_CONFIG,
  type TableTurnoverAnalysis,
  type TurnoverInsight,
  type TurnoverRecommendation,
  type TurnoverGrade,
} from "@/lib/turnover.service.ts";

const GRADE_STYLE: Record<TurnoverGrade, { bg: string; text: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700' },
  C: { bg: 'bg-amber-100', text: 'text-amber-700' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700' },
  F: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

const REC_STYLE: Record<TurnoverRecommendation, { bg: string; text: string; label: string }> = {
  combine:         { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Combine' },
  reseat_faster:   { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Reseat faster' },
  adjust_capacity: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Adjust capacity' },
  remove:          { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Remove' },
  promote_location: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Promote location' },
  monitor:         { bg: 'bg-neutral-100', text: 'text-neutral-600', label: 'Monitor' },
};

export function TableTurnoverScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [analyses, setAnalyses] = useState<TableTurnoverAnalysis[]>([]);
  const [insights, setInsights] = useState<TurnoverInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_TURNOVER_CONFIG);
  const [sortBy, setSortBy] = useState<'score' | 'revenue' | 'turnover' | 'occupancy' | 'name'>('score');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTurnoverConfig(settingsRows[0] ?? {}));
      const [analysedList, insightsList] = await Promise.all([
        getTableTurnoverAnalyses(db),
        getOpenTurnoverInsights(db),
      ]);
      setAnalyses(analysedList);
      setInsights(insightsList);
    } catch (err) {
      console.error('[turnover-report] reload failed', err);
      toast.error('Failed to load turnover data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 4 });
    try {
      const result = await analyzeTableTurnover(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        `Analyzed ${result.analyses.length} tables — avg turnover ${result.avgTurnoverRate.toFixed(1)}/day. Potential impact: ${withCurrency(result.potentialRevenueImpact)}/mo`
      );
      await reload();
    } catch (err) {
      console.error('[turnover-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleInsightAction = useCallback(async (insightId: string, status: 'acknowledged' | 'acted_on' | 'dismissed') => {
    try {
      await updateTurnoverInsightStatus(db, insightId, status);
      toast.success(`Insight ${status}`);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update insight');
    }
  }, [db, reload]);

  const stats = useMemo(() => {
    const totalRevenue = analyses.reduce((s, a) => s + a.total_revenue, 0);
    const avgTurnover = analyses.length > 0
      ? analyses.reduce((s, a) => s + a.turnover_rate, 0) / analyses.length
      : 0;
    const avgOccupancy = analyses.length > 0
      ? analyses.reduce((s, a) => s + a.avg_occupancy_minutes, 0) / analyses.length
      : 0;
    const gradeCounts: Record<TurnoverGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const a of analyses) gradeCounts[a.grade]++;
    const potentialImpact = insights.reduce((s, i) => s + (i.projected_revenue_impact ?? 0), 0);
    return { totalRevenue, avgTurnover, avgOccupancy, gradeCounts, potentialImpact };
  }, [analyses, insights]);

  const sortedAnalyses = useMemo(() => {
    const sorted = [...analyses];
    switch (sortBy) {
      case 'score': sorted.sort((a, b) => b.overall_score - a.overall_score); break;
      case 'revenue': sorted.sort((a, b) => b.revenue_per_hour - a.revenue_per_hour); break;
      case 'turnover': sorted.sort((a, b) => b.turnover_rate - a.turnover_rate); break;
      case 'occupancy': sorted.sort((a, b) => a.avg_occupancy_minutes - b.avg_occupancy_minutes); break;
      case 'name': sorted.sort((a, b) => a.table_name.localeCompare(b.table_name)); break;
    }
    return sorted;
  }, [analyses, sortBy]);

  return (
    <Layout>
      <DocumentTitle parts={["Table Turnover", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChair} className="text-amber-600" />
              Table Turnover
            </h1>
            <p className="text-sm text-neutral-500">
              Per-table occupancy, turnover rate, revenue per hour + AI recommendations for floor optimization
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze tables'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading turnover data…</p>
          </div>
        ) : analyses.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChair} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No table analysis yet</p>
            <p className="text-sm mt-1">Click "Analyze tables" to generate turnover scorecards.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard icon={faChair} label="Tables" value={analyses.length} color="text-amber-600" />
              <SummaryCard icon={faDollarSign} label="Total revenue" value={withCurrency(stats.totalRevenue)} color="text-emerald-600" />
              <SummaryCard icon={faRotate} label="Avg turnover" value={`${stats.avgTurnover.toFixed(1)}/day`} color="text-blue-600" />
              <SummaryCard icon={faStopwatch} label="Avg occupancy" value={`${stats.avgOccupancy.toFixed(0)} min`} color="text-violet-600" />
              <SummaryCard icon={faArrowTrendUp} label="Potential impact" value={withCurrency(stats.potentialImpact) + '/mo'} color="text-rose-600" />
            </div>

            {/* Grade distribution */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3">Grade distribution</h3>
              <div className="flex gap-2 flex-wrap">
                {(['A', 'B', 'C', 'D', 'F'] as TurnoverGrade[]).map(g => (
                  <div key={g} className={`px-4 py-2 rounded-lg ${GRADE_STYLE[g].bg} ${GRADE_STYLE[g].text}`}>
                    <div className="text-2xl font-bold">{g}</div>
                    <div className="text-xs">{stats.gradeCounts[g]} tables</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sort controls */}
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-neutral-500">Sort by:</span>
              {(['score', 'revenue', 'turnover', 'occupancy', 'name'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-3 py-1 rounded text-xs transition-colors capitalize ${
                    sortBy === s ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {s === 'revenue' ? 'Rev/hour' : s}
                </button>
              ))}
            </div>

            {/* Per-table scorecards */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Table</th>
                      <th className="text-center p-3">Grade</th>
                      <th className="text-right p-3">Score</th>
                      <th className="text-right p-3">Parties</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">Rev/hr</th>
                      <th className="text-right p-3">Turns/day</th>
                      <th className="text-right p-3">Occupancy</th>
                      <th className="text-right p-3">Party size</th>
                      <th className="text-right p-3">Utilization</th>
                      <th className="text-right p-3">Idle</th>
                      <th className="text-right p-3">Peak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAnalyses.map(a => (
                      <tr key={a.table_id} className="border-t hover:bg-neutral-50">
                        <td className="p-3">
                          <div className="font-medium">{a.table_name}</div>
                          {a.floor_name && <div className="text-xs text-neutral-500">{a.floor_name}{a.capacity ? ` · ${a.capacity} seats` : ''}</div>}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-block w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${GRADE_STYLE[a.grade].bg} ${GRADE_STYLE[a.grade].text}`}>
                            {a.grade}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold">{a.overall_score}</td>
                        <td className="p-3 text-right tabular-nums">{a.total_parties}</td>
                        <td className="p-3 text-right tabular-nums font-medium">{withCurrency(a.total_revenue)}</td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={a.revenue_per_hour >= 10 ? 'text-emerald-600' : a.revenue_per_hour >= 5 ? 'text-amber-600' : 'text-rose-600'}>
                            {withCurrency(a.revenue_per_hour)}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={a.turnover_rate >= 2 ? 'text-emerald-600' : a.turnover_rate >= 1 ? 'text-amber-600' : 'text-rose-600'}>
                            {a.turnover_rate.toFixed(1)}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {a.avg_occupancy_minutes > 0 ? `${a.avg_occupancy_minutes}m` : '—'}
                          <div className="text-xs text-neutral-400">med {a.median_occupancy_minutes}m</div>
                        </td>
                        <td className="p-3 text-right tabular-nums">{a.avg_party_size}</td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={a.capacity_utilization >= 0.7 ? 'text-emerald-600' : a.capacity_utilization >= 0.4 ? 'text-amber-600' : 'text-rose-600'}>
                            {(a.capacity_utilization * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={a.avg_idle_minutes <= 20 ? 'text-emerald-600' : a.avg_idle_minutes <= 45 ? 'text-amber-600' : 'text-rose-600'}>
                            {a.avg_idle_minutes > 0 ? `${a.avg_idle_minutes}m` : '—'}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums text-neutral-500">
                          {a.peak_hour !== undefined ? `${a.peak_hour}:00` : '—'}
                        </td>
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
                {stats.potentialImpact > 0 && (
                  <span className="text-sm text-emerald-600 font-semibold">
                    Total potential impact: {withCurrency(stats.potentialImpact)}/mo
                  </span>
                )}
              </div>
              {insights.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-6">
                  No open recommendations. Click "Analyze tables" to generate insights.
                </p>
              ) : (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  {insights.map((insight, idx) => {
                    const style = REC_STYLE[insight.recommendation];
                    return (
                      <div key={idx} className="border border-neutral-200 rounded-lg p-3 hover:bg-neutral-50">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium flex items-center gap-1">
                              <FontAwesomeIcon icon={faChair} className="text-amber-500 text-xs" />
                              {insight.table_name}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${insight.priority === 'high' ? 'bg-rose-100 text-rose-700' : insight.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600'}`}>
                              {insight.priority} priority
                            </span>
                          </div>
                          {insight.projected_revenue_impact && insight.projected_revenue_impact > 0 && (
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-semibold text-emerald-600 tabular-nums">
                                +{withCurrency(insight.projected_revenue_impact)}/mo
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
              <span>Open hours/day: <strong>{config.openHours}h</strong></span>
              <span>Min parties: <strong>{config.minParties}</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
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

export default TableTurnoverScreen;
