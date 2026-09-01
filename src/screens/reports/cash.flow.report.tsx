/**
 * Cash Flow Forecast Dashboard — 30-day cash position projection.
 *
 * Research finding: Lightspeed Financial Insights, Square Cash Flow,
 * Toast Capital all charge for cash flow forecasting (~$50/mo). POSR
 * offers it free.
 *
 * Layout:
 *   1. Summary cards (opening balance, projected closing, min balance, runway)
 *   2. Health status banner (healthy/watch/warning/critical)
 *   3. 30-day balance projection chart (visual line)
 *   4. Inflow vs outflow breakdown
 *   5. AI insights + recommendations panel
 *   6. Upcoming obligations table (payables + payroll + recurring)
 *   7. Generate button (runs forecast with AI enhancement)
 *
 * Placement: new route /reports/cash-flow
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
  faWallet, faArrowTrendUp, faArrowTrendDown, faHourglassHalf, faRobot,
  faLightbulb, faRotate, faTriangleExclamation, faCheckCircle,
  faFileInvoice, faUsers, faReceipt,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  generateCashFlowForecast,
  getLatestForecast,
  readCashFlowConfig,
  DEFAULT_CASHFLOW_CONFIG,
  type CashFlowForecast,
  type CashFlowEntry,
  type HealthStatus,
} from "@/lib/cash-flow.service.ts";

const HEALTH_STYLE: Record<HealthStatus, { bg: string; text: string; border: string; label: string; icon: any }> = {
  healthy:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Healthy',  icon: faCheckCircle },
  watch:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-400',    label: 'Watch',    icon: faHourglassHalf },
  warning:  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-400',   label: 'Warning',  icon: faTriangleExclamation },
  critical: { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-500',     label: 'Critical', icon: faTriangleExclamation },
};

const ENTRY_TYPE_ICON: Record<string, any> = {
  revenue: faArrowTrendUp,
  payroll: faUsers,
  purchase: faFileInvoice,
  expense: faReceipt,
  rent: faReceipt,
  utilities: faReceipt,
  tax: faReceipt,
  other_inflow: faArrowTrendUp,
  other_outflow: faArrowTrendDown,
};

export function CashFlowReportScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [forecast, setForecast] = useState<CashFlowForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_CASHFLOW_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCashFlowConfig(settingsRows[0] ?? {}));
      const f = await getLatestForecast(db);
      setForecast(f);
    } catch (err) {
      console.error('[cashflow-report] reload failed', err);
      toast.error('Failed to load cash flow forecast');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setProgress({ current: 0, total: 6 });
    try {
      const result = await generateCashFlowForecast(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setForecast(result);
      toast.success(
        `Forecast generated — projected ${withCurrency(result.projected_closing_balance)} in 30d. Health: ${result.health_status}`
      );
    } catch (err) {
      console.error('[cashflow-report] generate failed', err);
      toast.error('Forecast generation failed — see console');
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  // Build chart data — daily running balance
  const chartData = useMemo(() => {
    if (!forecast) return [];
    const dailyBalances: { date: Date; balance: number; inflow: number; outflow: number }[] = [];
    let running = forecast.opening_balance;
    const byDay = new Map<string, CashFlowEntry[]>();
    for (const e of forecast.entries) {
      const key = e.date.toISOString().split('T')[0];
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(e);
    }
    for (let i = 0; i < forecast.forecast_days; i++) {
      const date = new Date(forecast.forecast_start);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().split('T')[0];
      const dayEntries = byDay.get(key) ?? [];
      const inflow = dayEntries.filter(e => e.direction === 'inflow').reduce((s, e) => s + e.amount, 0);
      const outflow = dayEntries.filter(e => e.direction === 'outflow').reduce((s, e) => s + e.amount, 0);
      running += inflow - outflow;
      dailyBalances.push({ date: new Date(date), balance: running, inflow, outflow });
    }
    return dailyBalances;
  }, [forecast]);

  // Chart scaling
  const chartStats = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 0, range: 1 };
    const balances = chartData.map(d => d.balance);
    const min = Math.min(...balances, 0);
    const max = Math.max(...balances, 0);
    return { min, max, range: max - min || 1 };
  }, [chartData]);

  // Upcoming obligations (outflows, sorted by date)
  const upcomingObligations = useMemo(() => {
    if (!forecast) return [];
    return forecast.entries
      .filter(e => e.direction === 'outflow' && e.is_confirmed)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 15);
  }, [forecast]);

  return (
    <Layout>
      <DocumentTitle parts={["Cash Flow Forecast", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWallet} className="text-emerald-600" />
              Cash Flow Forecast
            </h1>
            <p className="text-sm text-neutral-500">
              30-day cash position projection — revenue + payroll + payables + AI insights
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={generating} />
            {generating ? `Generating… (${progress.current}/${progress.total})` : 'Generate forecast'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading forecast…</p>
          </div>
        ) : !forecast ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWallet} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No cash flow forecast yet</p>
            <p className="text-sm mt-1">Click "Generate forecast" to run the 30-day projection.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faWallet} label="Opening balance" value={withCurrency(forecast.opening_balance)} color="text-blue-600" />
              <SummaryCard icon={faArrowTrendUp} label="Projected (30d)" value={withCurrency(forecast.projected_closing_balance)} color={forecast.projected_closing_balance >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
              <SummaryCard icon={faArrowTrendDown} label="Min balance" value={withCurrency(forecast.min_projected_balance)} color={forecast.min_projected_balance < config.minReserve ? 'text-rose-600' : 'text-amber-600'} />
              <SummaryCard
                icon={faHourglassHalf}
                label="Runway"
                value={forecast.runway_days !== undefined ? `${forecast.runway_days} days` : '∞'}
                color={forecast.runway_days !== undefined && forecast.runway_days < 30 ? 'text-rose-600' : 'text-emerald-600'}
              />
            </div>

            {/* Health banner */}
            <div className={`rounded-lg border-2 p-4 ${HEALTH_STYLE[forecast.health_status].bg} ${HEALTH_STYLE[forecast.health_status].border}`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={HEALTH_STYLE[forecast.health_status].icon} className={`text-3xl ${HEALTH_STYLE[forecast.health_status].text}`} />
                  <div>
                    <div className={`text-xl font-bold ${HEALTH_STYLE[forecast.health_status].text}`}>
                      {HEALTH_STYLE[forecast.health_status].label}
                    </div>
                    <div className="text-xs text-neutral-600">
                      Min balance {withCurrency(forecast.min_projected_balance)} on {forecast.min_balance_date?.toLocaleDateString()}
                      {forecast.min_projected_balance < config.minReserve && ` · below reserve ${withCurrency(config.minReserve)}`}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-right">
                  <div>
                    <div className="text-xs text-neutral-500">Avg daily revenue</div>
                    <div className="font-bold text-emerald-600 tabular-nums">{withCurrency(forecast.avg_daily_revenue)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Avg daily expense</div>
                    <div className="font-bold text-rose-600 tabular-nums">{withCurrency(forecast.avg_daily_expense)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Burn rate</div>
                    <div className={`font-bold tabular-nums ${forecast.burn_rate > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {forecast.burn_rate > 0 ? '-' : '+'}{withCurrency(Math.abs(forecast.burn_rate))}/day
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 30-day balance projection chart */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3">30-day balance projection</h3>
              <div className="relative h-48 flex items-end gap-px">
                {/* Zero line */}
                {chartStats.min < 0 && (
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-rose-300"
                    style={{ bottom: `${(Math.abs(chartStats.min) / chartStats.range) * 100}%` }}
                  >
                    <span className="absolute -top-5 left-0 text-xs text-rose-500">$0</span>
                  </div>
                )}
                {/* Min reserve line */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-amber-300"
                  style={{ bottom: `${((config.minReserve - chartStats.min) / chartStats.range) * 100}%` }}
                >
                  <span className="absolute -top-5 right-0 text-xs text-amber-500">Reserve {withCurrency(config.minReserve)}</span>
                </div>
                {chartData.map((d, idx) => {
                  const heightPct = ((d.balance - chartStats.min) / chartStats.range) * 100;
                  const isNegative = d.balance < 0;
                  const isMin = forecast.min_balance_date && d.date.toDateString() === forecast.min_balance_date.toDateString();
                  return (
                    <div
                      key={idx}
                      className="flex-1 relative group"
                      style={{ height: '100%' }}
                      title={`${d.date.toLocaleDateString()}: ${withCurrency(d.balance)}`}
                    >
                      <div
                        className={`absolute bottom-0 left-0 right-0 rounded-t transition-colors ${
                          isNegative ? 'bg-rose-400'
                          : isMin ? 'bg-amber-500'
                          : d.balance > forecast.opening_balance ? 'bg-emerald-400'
                          : 'bg-blue-400'
                        }`}
                        style={{ height: `${Math.max(2, heightPct)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-neutral-400 mt-2">
                <span>{chartData[0]?.date.toLocaleDateString()}</span>
                <span>15d</span>
                <span>{chartData[chartData.length - 1]?.date.toLocaleDateString()}</span>
              </div>
            </div>

            {/* Inflow vs Outflow breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2 text-emerald-700">
                  <FontAwesomeIcon icon={faArrowTrendUp} />
                  Inflows ({withCurrency(forecast.total_inflow)})
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Projected revenue</span>
                    <span className="font-semibold tabular-nums">{withCurrency(forecast.total_inflow)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-neutral-500">
                    <span>Avg daily</span>
                    <span>{withCurrency(forecast.avg_daily_revenue)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2 text-rose-700">
                  <FontAwesomeIcon icon={faArrowTrendDown} />
                  Outflows ({withCurrency(forecast.total_outflow)})
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Payroll (upcoming)</span>
                    <span className="font-semibold tabular-nums">{withCurrency(forecast.upcoming_payroll)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payables (pending POs)</span>
                    <span className="font-semibold tabular-nums">{withCurrency(forecast.payables_total)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-neutral-500">
                    <span>Avg daily expense</span>
                    <span>{withCurrency(forecast.avg_daily_expense)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI insights + recommendations */}
            {forecast.ai_insights && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Financial Insights
                </h3>
                <p className="text-sm text-violet-900 whitespace-pre-wrap mb-3">{forecast.ai_insights}</p>
                {forecast.ai_recommendations.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-violet-700 uppercase">Recommendations</div>
                    {forecast.ai_recommendations.map((rec, idx) => (
                      <div key={idx} className="text-sm text-violet-900 flex items-start gap-2">
                        <span className="text-violet-500 mt-0.5">→</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Upcoming obligations */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3">Upcoming obligations</h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-center p-2">Status</th>
                      <th className="text-right p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingObligations.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-neutral-400">No confirmed obligations</td></tr>
                    ) : (
                      upcomingObligations.map((entry, idx) => (
                        <tr key={idx} className="border-t hover:bg-neutral-50">
                          <td className="p-2 text-xs">{entry.date.toLocaleDateString()}</td>
                          <td className="p-2">
                            <span className="inline-flex items-center gap-1 text-xs capitalize">
                              <FontAwesomeIcon icon={ENTRY_TYPE_ICON[entry.entry_type] ?? faReceipt} />
                              {entry.entry_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-2 text-xs">{entry.description ?? '—'}</td>
                          <td className="p-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${entry.is_confirmed ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {entry.is_confirmed ? 'Confirmed' : 'Projected'}
                            </span>
                          </td>
                          <td className="p-2 text-right font-semibold tabular-nums">{withCurrency(entry.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Forecast: <strong>{config.forecastDays} days</strong></span>
              <span>Min reserve: <strong>{withCurrency(config.minReserve)}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Payroll cycle: <strong>{config.payrollCycleDays} days</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Net flow: <strong className={forecast.net_flow >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{forecast.net_flow >= 0 ? '+' : ''}{withCurrency(forecast.net_flow)}</strong></span>
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

export default CashFlowReportScreen;
