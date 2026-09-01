/**
 * Revenue Forecast Dashboard — 90-day projection + weekly/monthly breakdown + AI.
 */

import { useState, useCallback } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { Layout } from "@/screens/partials/layout.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine, faDollarSign, faCalendarAlt, faRobot, faRotate,
  faLightbulb, faArrowTrendUp,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  generateRevenueForecast,
  getLatestRevenueForecast,
  readRevFcConfig,
  type RevenueForecast,
} from "@/lib/revenue-forecast.service.ts";

export function RevenueForecastScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [forecast, setForecast] = useState<RevenueForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState({ aiEnabled: true, forecastDays: 90 });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readRevFcConfig(settingsRows[0] ?? {}));
      const f = await getLatestRevenueForecast(db);
      setForecast(f);
    } catch (err) {
      console.error('[revfc-report] reload failed', err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useCallback(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await generateRevenueForecast(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setForecast(result);
      toast.success(result
        ? `90-day forecast: ${withCurrency(result.total_projected_revenue)} projected revenue, ${result.total_projected_orders} orders`
        : 'No data found'
      );
    } catch (err) {
      console.error('[revfc-report] analyze failed', err);
      toast.error('Forecast failed');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  return (
    <Layout>
      <DocumentTitle parts={["Revenue Forecast", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-emerald-600" />
              Revenue Forecast (90-day)
            </h1>
            <p className="text-sm text-neutral-500">
              90-day revenue projection combining DOW patterns + seasonal trends + AI insights
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Forecasting… (${progress.current}/${progress.total})` : 'Generate forecast'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading forecast…</p>
          </div>
        ) : !forecast ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChartLine} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No forecast yet</p>
            <p className="text-sm mt-1">Click "Generate forecast" for a 90-day revenue projection.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faDollarSign} label="Total projected" value={withCurrency(forecast.total_projected_revenue)} color="text-emerald-600" />
              <SummaryCard icon={faChartLine} label="Daily avg" value={withCurrency(forecast.avg_daily_revenue)} color="text-blue-600" />
              <SummaryCard icon={faArrowTrendUp} label="Peak day" value={forecast.projected_peak_day ?? '—'} color="text-amber-600" />
              <SummaryCard icon={faCalendarAlt} label="Total orders" value={forecast.total_projected_orders} color="text-violet-600" />
            </div>

            {/* AI insights */}
            {forecast.ai_insight && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Revenue Outlook
                </h3>
                <p className="text-sm text-violet-900 whitespace-pre-wrap mb-3">{forecast.ai_insight}</p>
                {forecast.ai_recommendations.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-violet-700 uppercase mb-1">Recommendations</div>
                    {forecast.ai_recommendations.map((rec, idx) => (
                      <div key={idx} className="text-sm text-violet-900 flex items-start gap-2 mb-1">
                        <span className="text-violet-500 mt-0.5">→</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Weekly breakdown */}
            {forecast.weekly_breakdown && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Weekly projection</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {forecast.weekly_breakdown.map((w, idx) => (
                    <div key={idx} className="bg-neutral-50 rounded p-2 text-center">
                      <div className="text-xs text-neutral-500">Week {w.week}</div>
                      <div className="font-bold tabular-nums text-sm">{withCurrency(w.revenue)}</div>
                      <div className="text-xs text-neutral-400">{w.orders} orders</div>
                      <div className={`text-xs ${w.growth_pct > 0 ? 'text-emerald-600' : w.growth_pct < 0 ? 'text-rose-600' : 'text-neutral-400'}`}>
                        {w.growth_pct > 0 ? '+' : ''}{w.growth_pct}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly breakdown */}
            {forecast.monthly_breakdown && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Monthly projection</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {forecast.monthly_breakdown.map((m, idx) => (
                    <div key={idx} className="bg-neutral-50 rounded p-3">
                      <div className="font-semibold text-sm">{m.month}</div>
                      <div className="text-xs text-neutral-500 capitalize">{m.season}</div>
                      <div className="text-xl font-bold tabular-nums text-emerald-600 mt-1">{withCurrency(m.revenue)}</div>
                      <div className="text-xs text-neutral-500">{m.orders} orders</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Config */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Forecast horizon: <strong>{forecast.forecast_days} days</strong></span>
              <span>Confidence: <strong>{(forecast.confidence_score * 100).toFixed(0)}%</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({ icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default RevenueForecastScreen;
