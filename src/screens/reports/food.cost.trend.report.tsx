/**
 * Food Cost Trend Dashboard — ingredient price changes + margin impact + AI recs.
 *
 * Research finding: Toast Food Cost Variance $35+/mo (higher tier), Square
 * COGS tracking in Plus. POSR offers it free.
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
  faChartLine, faArrowTrendUp, faArrowTrendDown, faMinus, faDollarSign,
  faRobot, faRotate, faLightbulb, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeFoodCostTrends,
  getFoodCostTrends,
  readFoodCostConfig,
  DEFAULT_FOODCOST_CONFIG,
  type FoodCostTrend,
  type CostSeverity,
} from "@/lib/food-cost-trend.service.ts";

const SEVERITY_STYLE: Record<CostSeverity, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-rose-100',    text: 'text-rose-700',    label: 'Critical' },
  high:     { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'High' },
  medium:   { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Medium' },
  low:      { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Low' },
};

const TREND_ICON: Record<string, any> = {
  rising: faArrowTrendUp,
  falling: faArrowTrendDown,
  stable: faMinus,
};

const REC_LABEL: Record<string, string> = {
  renegotiate: 'Renegotiate', substitute: 'Substitute', reprice_menu: 'Reprice menu',
  absorb: 'Absorb (good)', monitor: 'Monitor',
};

export function FoodCostTrendScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [trends, setTrends] = useState<FoodCostTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_FOODCOST_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readFoodCostConfig(settingsRows[0] ?? {}));
      const list = await getFoodCostTrends(db);
      setTrends(list);
    } catch (err) {
      console.error('[food-cost-report] reload failed', err);
      toast.error('Failed to load food cost trends');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await analyzeFoodCostTrends(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setTrends(result.trends);
      toast.success(
        `Analyzed ${result.trends.length} ingredients — ${result.risingCount} rising, ${result.fallingCount} falling. Annual impact: ${withCurrency(result.totalAnnualImpact)}`
      );
    } catch (err) {
      console.error('[food-cost-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const stats = useMemo(() => {
    const totalImpact = trends.reduce((s, t) => s + Math.abs(t.annual_cost_impact), 0);
    const rising = trends.filter(t => t.trend_direction === 'rising').length;
    const falling = trends.filter(t => t.trend_direction === 'falling').length;
    const critical = trends.filter(t => t.severity === 'critical').length;
    return { totalImpact, rising, falling, critical };
  }, [trends]);

  return (
    <Layout>
      <DocumentTitle parts={["Food Cost Trends", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-emerald-600" />
              Food Cost Trends
            </h1>
            <p className="text-sm text-neutral-500">
              Ingredient price changes + margin impact + AI recommendations (renegotiate/substitute/reprice/absorb)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze trends'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading food cost data…</p>
          </div>
        ) : trends.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChartLine} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No food cost trends yet</p>
            <p className="text-sm mt-1">Click "Analyze trends" to track ingredient price changes.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faArrowTrendUp} label="Rising" value={stats.rising} color="text-rose-600" />
              <SummaryCard icon={faArrowTrendDown} label="Falling" value={stats.falling} color="text-emerald-600" />
              <SummaryCard icon={faTriangleExclamation} label="Critical" value={stats.critical} color="text-rose-700" />
              <SummaryCard icon={faDollarSign} label="Annual impact" value={withCurrency(stats.totalImpact)} color="text-amber-600" />
            </div>

            {/* Trends table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Ingredient</th>
                      <th className="text-center p-3">Trend</th>
                      <th className="text-right p-3">Current</th>
                      <th className="text-right p-3">30d ago</th>
                      <th className="text-right p-3">Change 30d</th>
                      <th className="text-right p-3">Change 90d</th>
                      <th className="text-right p-3">Monthly consumption</th>
                      <th className="text-right p-3">Monthly impact</th>
                      <th className="text-right p-3">Annual impact</th>
                      <th className="text-center p-3">Severity</th>
                      <th className="text-left p-3">Affected dishes</th>
                      <th className="text-center p-3">AI rec</th>
                      <th className="text-left p-3">AI insight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.map((trend, idx) => {
                      const sev = SEVERITY_STYLE[trend.severity];
                      const trendIcon = TREND_ICON[trend.trend_direction] ?? faMinus;
                      return (
                        <tr key={idx} className="border-t hover:bg-neutral-50">
                          <td className="p-3 font-medium">
                            {trend.item_name}
                            {trend.uom && <span className="text-xs text-neutral-500 ml-1">({trend.uom})</span>}
                          </td>
                          <td className="p-3 text-center">
                            <FontAwesomeIcon icon={trendIcon} className={
                              trend.trend_direction === 'rising' ? 'text-rose-500' :
                              trend.trend_direction === 'falling' ? 'text-emerald-500' : 'text-neutral-400'
                            } />
                          </td>
                          <td className="p-3 text-right tabular-nums">{withCurrency(trend.current_price)}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{trend.price_30d_ago > 0 ? withCurrency(trend.price_30d_ago) : '—'}</td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={trend.price_change_pct_30d > 5 ? 'text-rose-600 font-semibold' : trend.price_change_pct_30d < -5 ? 'text-emerald-600 font-semibold' : 'text-neutral-500'}>
                              {trend.price_change_pct_30d > 0 ? '+' : ''}{trend.price_change_pct_30d}%
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">
                            {trend.price_change_pct_90d > 0 ? '+' : ''}{trend.price_change_pct_90d}%
                          </td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{trend.avg_monthly_consumption}</td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={trend.monthly_cost_impact > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {trend.monthly_cost_impact > 0 ? '+' : ''}{withCurrency(trend.monthly_cost_impact)}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold">
                            <span className={trend.annual_cost_impact > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {trend.annual_cost_impact > 0 ? '+' : ''}{withCurrency(trend.annual_cost_impact)}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs px-2 py-1 rounded-full ${sev.bg} ${sev.text}`}>{sev.label}</span>
                          </td>
                          <td className="p-3 text-xs text-neutral-500 max-w-xs">
                            {trend.affected_dishes && trend.affected_dishes.length > 0 ? (
                              <span>{trend.affected_dishes.slice(0, 3).join(', ')}{trend.affected_dishes.length > 3 ? ` +${trend.affected_dishes.length - 3}` : ''}</span>
                            ) : '—'}
                          </td>
                          <td className="p-3 text-center">
                            {trend.ai_recommendation && (
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                trend.ai_recommendation === 'renegotiate' ? 'bg-amber-100 text-amber-700' :
                                trend.ai_recommendation === 'reprice_menu' ? 'bg-rose-100 text-rose-700' :
                                trend.ai_recommendation === 'substitute' ? 'bg-violet-100 text-violet-700' :
                                trend.ai_recommendation === 'absorb' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-neutral-100 text-neutral-600'
                              }`}>
                                {REC_LABEL[trend.ai_recommendation] ?? trend.ai_recommendation}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-violet-600 italic max-w-xs">
                            {trend.ai_insight ? `"${trend.ai_insight}"` : <span className="text-neutral-400">—</span>}
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
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Rising threshold: <strong>{config.risingThreshold}%</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Items tracked: <strong>{trends.length}</strong></span>
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

export default FoodCostTrendScreen;
