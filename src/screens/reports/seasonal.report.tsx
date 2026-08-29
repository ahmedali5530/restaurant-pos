/**
 * Seasonal Trend Analysis Dashboard — monthly patterns + YoY + AI insights.
 *
 * Research finding: Toast Seasonal Insights $25+/mo (higher tier), Square
 * doesn't have this. POSR offers it free.
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
  faCalendarAlt, faArrowTrendUp, faArrowTrendDown, faRobot, faRotate,
  faLightbulb, faChartBar, faSnowflake, faSeedling, faSun, faLeaf,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeSeasonalTrends,
  getSeasonalTrends,
  readSeasonalConfig,
  DEFAULT_SEASONAL_CONFIG,
  type SeasonalTrend,
} from "@/lib/seasonal.service.ts";

const SEASON_ICON: Record<string, any> = {
  winter: faSnowflake, spring: faSeedling, summer: faSun, fall: faLeaf,
};
const SEASON_COLOR: Record<string, string> = {
  winter: 'text-blue-600', spring: 'text-emerald-600', summer: 'text-amber-600', fall: 'text-orange-600',
};

export function SeasonalScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [trends, setTrends] = useState<SeasonalTrend[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_SEASONAL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSeasonalConfig(settingsRows[0] ?? {}));
      const list = await getSeasonalTrends(db);
      setTrends(list);
    } catch (err) {
      console.error('[seasonal-report] reload failed', err);
      toast.error('Failed to load seasonal data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await analyzeSeasonalTrends(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setTrends(result.trends);
      setAiSummary(result.insights);
      toast.success(`Analyzed ${result.trends.length} months of seasonal data`);
    } catch (err) {
      console.error('[seasonal-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const maxRevenue = useMemo(() => {
    return Math.max(...trends.map(t => t.total_revenue), 1);
  }, [trends]);

  return (
    <Layout>
      <DocumentTitle parts={["Seasonal Trends", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarAlt} className="text-blue-600" />
              Seasonal Trends
            </h1>
            <p className="text-sm text-neutral-500">
              Monthly revenue/order patterns + peak days + top items + AI seasonal recommendations
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
            <p>Loading seasonal data…</p>
          </div>
        ) : trends.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCalendarAlt} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No seasonal data yet</p>
            <p className="text-sm mt-1">Click "Analyze trends" to discover monthly patterns.</p>
          </div>
        ) : (
          <>
            {/* Revenue bar chart */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <FontAwesomeIcon icon={faChartBar} className="text-blue-600" />
                Monthly revenue pattern
              </h3>
              <div className="relative h-48 flex items-end gap-2">
                {trends.map((t, idx) => {
                  const heightPct = (t.total_revenue / maxRevenue) * 100;
                  const seasonIcon = SEASON_ICON[t.season] ?? faLeaf;
                  const seasonColor = SEASON_COLOR[t.season] ?? 'text-neutral-500';
                  return (
                    <div key={idx} className="flex-1 relative group" style={{ height: '100%' }}
                      title={`${t.month_name}: ${withCurrency(t.total_revenue)} revenue, ${t.total_orders} orders`}>
                      <div className={`absolute bottom-0 left-0 right-0 rounded-t transition-colors ${
                        t.is_peak_season ? 'bg-amber-400' : 'bg-blue-300'
                      }`} style={{ height: `${Math.max(3, heightPct)}%` }} />
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-medium text-neutral-600">
                        {t.month_name.slice(0, 3)}
                      </div>
                      {t.is_peak_season && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-amber-600">PEAK</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-400 mr-1 align-middle" />Peak season</span>
                <span><span className="inline-block w-3 h-3 rounded-sm bg-blue-300 mr-1 align-middle" />Normal</span>
                <span>Peak threshold: 15%+ above avg</span>
              </div>
            </div>

            {/* AI summary */}
            {aiSummary && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Seasonal Assessment
                </h3>
                <p className="text-sm text-violet-900 whitespace-pre-wrap">{aiSummary}</p>
                {trends[0]?.ai_recommendations && trends[0].ai_recommendations.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-violet-700 uppercase mb-1">Recommendations</div>
                    {trends[0].ai_recommendations.map((rec, idx) => (
                      <div key={idx} className="text-sm text-violet-900 flex items-start gap-2 mb-1">
                        <span className="text-violet-500 mt-0.5">→</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Monthly breakdown table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Month</th>
                      <th className="text-center p-3">Season</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">Orders</th>
                      <th className="text-right p-3">Avg order</th>
                      <th className="text-right p-3">Daily avg</th>
                      <th className="text-right p-3">Customers</th>
                      <th className="text-right p-3">MoM change</th>
                      <th className="text-center p-3">Peak?</th>
                      <th className="text-left p-3">Top item</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.map((t, idx) => (
                      <tr key={idx} className={`border-t hover:bg-neutral-50 ${t.is_peak_season ? 'bg-amber-50' : ''}`}>
                        <td className="p-3 font-medium">{t.month_name}</td>
                        <td className="p-3 text-center">
                          <FontAwesomeIcon icon={SEASON_ICON[t.season] ?? faLeaf} className={SEASON_COLOR[t.season] ?? 'text-neutral-500'} />
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold text-emerald-600">{withCurrency(t.total_revenue)}</td>
                        <td className="p-3 text-right tabular-nums">{t.total_orders}</td>
                        <td className="p-3 text-right tabular-nums text-neutral-500">{withCurrency(t.avg_order_value)}</td>
                        <td className="p-3 text-right tabular-nums text-neutral-500">{withCurrency(t.avg_daily_revenue)}</td>
                        <td className="p-3 text-right tabular-nums text-neutral-500">{t.unique_customers}</td>
                        <td className="p-3 text-right tabular-nums">
                          {(t.mom_revenue_change ?? 0) !== 0 && (
                            <span className={(t.mom_revenue_change ?? 0) > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                              <FontAwesomeIcon icon={(t.mom_revenue_change ?? 0) > 0 ? faArrowTrendUp : faArrowTrendDown} className="mr-1 text-xs" />
                              {Math.abs(t.mom_revenue_change ?? 0).toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {t.is_peak_season && <span className="text-amber-500 font-bold">★</span>}
                        </td>
                        <td className="p-3 text-xs text-neutral-500">
                          {t.top_items?.[0]?.name ?? '—'}
                          {t.top_items?.[0] && <span className="text-neutral-400 ml-1">({t.top_items[0].quantity}x)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Lookback: <strong>{config.lookbackYears} years</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Months analyzed: <strong>{trends.length}</strong></span>
              <span>Peak months: <strong className="text-amber-600">{trends.filter(t => t.is_peak_season).length}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default SeasonalScreen;
