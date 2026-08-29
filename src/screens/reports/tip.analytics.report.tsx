/**
 * Tip Distribution Analytics Dashboard — tip pool equity + fairness + AI recs.
 *
 * Research finding: Toast Tip Pool Management $25+/mo (higher tier), Square
 * Tip Reporting in Plus. POSR offers it free.
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
  faHandHoldingDollar, faPercent, faUsers, faScaleBalanced,
  faRobot, faRotate, faLightbulb, faClock,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeTipDistribution,
  getLatestTipAnalysis,
  readTipConfig,
  DEFAULT_TIP_CONFIG,
  type TipAnalysis,
} from "@/lib/tip-analytics.service.ts";

export function TipAnalyticsScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [analysis, setAnalysis] = useState<TipAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_TIP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTipConfig(settingsRows[0] ?? {}));
      const a = await getLatestTipAnalysis(db);
      setAnalysis(a);
    } catch (err) {
      console.error('[tip-report] reload failed', err);
      toast.error('Failed to load tip data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await analyzeTipDistribution(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setAnalysis(result);
      toast.success(
        result
          ? `Analyzed ${result.total_orders} orders — ${result.total_orders_with_tips} with tips (${result.tip_frequency}%). Total tips: ${withCurrency(result.total_tips)}. Equity: ${result.equity_score}/100.`
          : 'No order data found.'
      );
    } catch (err) {
      console.error('[tip-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  return (
    <Layout>
      <DocumentTitle parts={["Tip Analytics", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faHandHoldingDollar} className="text-emerald-600" />
              Tip Distribution Analytics
            </h1>
            <p className="text-sm text-neutral-500">
              Tip pool equity + Gini coefficient + per-employee breakdown + AI fairness recommendations
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze tips'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading tip data…</p>
          </div>
        ) : !analysis ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faHandHoldingDollar} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No tip data yet</p>
            <p className="text-sm mt-1">Click "Analyze tips" to compute distribution metrics.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faHandHoldingDollar} label="Total tips" value={withCurrency(analysis.total_tips)} color="text-emerald-600" />
              <SummaryCard icon={faPercent} label="Tip frequency" value={`${analysis.tip_frequency}%`} color="text-amber-600" />
              <SummaryCard icon={faPercent} label="Avg tip %" value={`${analysis.avg_tip_pct}%`} color="text-blue-600" />
              <SummaryCard icon={faScaleBalanced} label="Equity score" value={`${analysis.equity_score}/100`} color={analysis.equity_score >= 80 ? 'text-emerald-600' : analysis.equity_score >= 60 ? 'text-amber-600' : 'text-rose-600'} />
            </div>

            {/* Equity banner */}
            <div className={`rounded-lg border-2 p-4 ${analysis.equity_score >= 80 ? 'bg-emerald-50 border-emerald-400' : analysis.equity_score >= 60 ? 'bg-amber-50 border-amber-400' : 'bg-rose-50 border-rose-400'}`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faScaleBalanced} className={`text-3xl ${analysis.equity_score >= 80 ? 'text-emerald-600' : analysis.equity_score >= 60 ? 'text-amber-600' : 'text-rose-600'}`} />
                  <div>
                    <div className={`text-lg font-bold ${analysis.equity_score >= 80 ? 'text-emerald-700' : analysis.equity_score >= 60 ? 'text-amber-700' : 'text-rose-700'}`}>
                      {analysis.equity_score >= 80 ? 'Equitable distribution' : analysis.equity_score >= 60 ? 'Moderate inequality' : 'Significant inequality'}
                    </div>
                    <div className="text-xs text-neutral-600">
                      Gini coefficient: {analysis.gini_coefficient} · {analysis.total_orders_with_tips}/{analysis.total_orders} orders tipped · Avg {withCurrency(analysis.avg_tip_amount)}/order
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-500">Cash vs Card</div>
                  <div className="text-sm font-medium">{analysis.cash_tip_pct}% / {analysis.card_tip_pct}%</div>
                </div>
              </div>
            </div>

            {/* AI insights */}
            {analysis.ai_insight && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Tip Distribution Assessment
                </h3>
                <p className="text-sm text-violet-900 whitespace-pre-wrap mb-3">{analysis.ai_insight}</p>
                {analysis.ai_recommendations.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-violet-700 uppercase mb-1">Recommendations</div>
                    {analysis.ai_recommendations.map((rec, idx) => (
                      <div key={idx} className="text-sm text-violet-900 flex items-start gap-2 mb-1">
                        <span className="text-violet-500 mt-0.5">→</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Per-employee table */}
            {analysis.per_employee && analysis.per_employee.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faUsers} className="text-blue-600" />
                  Per-employee tip collection
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="text-left p-2">Employee</th>
                        <th className="text-right p-2">Tips collected</th>
                        <th className="text-right p-2">Orders served</th>
                        <th className="text-right p-2">Avg tip/order</th>
                        <th className="text-right p-2">Share %</th>
                        <th className="text-center p-3">Share bar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.per_employee.map((emp, idx) => (
                        <tr key={idx} className="border-t hover:bg-neutral-50">
                          <td className="p-2 font-medium">{emp.name}</td>
                          <td className="p-2 text-right tabular-nums font-semibold text-emerald-600">{withCurrency(emp.tips_collected)}</td>
                          <td className="p-2 text-right tabular-nums text-neutral-500">{emp.orders_served}</td>
                          <td className="p-2 text-right tabular-nums">{withCurrency(emp.avg_tip_per_order)}</td>
                          <td className="p-2 text-right tabular-nums font-semibold">{emp.tip_share_pct}%</td>
                          <td className="p-2">
                            <div className="w-full bg-neutral-100 rounded-full h-3">
                              <div className="bg-blue-400 h-3 rounded-full" style={{ width: `${emp.tip_share_pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              {analysis.peak_tip_hour !== undefined && (
                <span>Peak tipping hour: <strong>{String(analysis.peak_tip_hour).padStart(2, '0')}:00</strong></span>
              )}
              <span>Gini: <strong>{analysis.gini_coefficient}</strong></span>
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

export default TipAnalyticsScreen;
