/**
 * Forecast Accuracy Dashboard — measure AI prediction quality.
 *
 * Research finding: Toast Predict + Square Forecast bundle accuracy
 * measurement in their AI tiers. POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (MAPE, MAE, bias, accuracy %, coverage)
 *   2. Accuracy grade banner (excellent/good/fair/poor with industry benchmark)
 *   3. Accuracy trend chart (MAPE over time — is AI getting better?)
 *   4. Best/worst hours + days (where AI is right vs wrong)
 *   5. AI insights panel (error patterns + recommendations)
 *   6. Worst predictions table (specific failures)
 *   7. Generate button (evaluate pending + compute rollups)
 *
 * Placement: new route /reports/forecast-accuracy
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
  faBullseye, faChartLine, faArrowTrendUp, faArrowTrendDown, faRobot,
  faRotate, faLightbulb, faClock, faCalendarDay, faCheckCircle,
  faTriangleExclamation, faGaugeHigh,
} from "@fortawesome/free-solid-svg-icons";
import {
  generateAccuracyRollups,
  getLatestAccuracy,
  getAccuracyTrend,
  getWorstPredictions,
  readAccuracyConfig,
  DEFAULT_ACCURACY_CONFIG,
  type ForecastAccuracy,
  type AccuracyTrend,
  type WorstPrediction,
} from "@/lib/forecast-accuracy.service.ts";

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getGrade = (mape: number): { label: string; color: string; bg: string; icon: any } => {
  if (mape < 15) return { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-400', icon: faCheckCircle };
  if (mape < 25) return { label: 'Good', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-400', icon: faGaugeHigh };
  if (mape < 40) return { label: 'Fair', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-400', icon: faTriangleExclamation };
  return { label: 'Poor', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-500', icon: faTriangleExclamation };
};

export function ForecastAccuracyScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [latest, setLatest] = useState<ForecastAccuracy | null>(null);
  const [trend, setTrend] = useState<AccuracyTrend[]>([]);
  const [worst, setWorst] = useState<WorstPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_ACCURACY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readAccuracyConfig(settingsRows[0] ?? {}));
      const [latestAcc, trendData, worstData] = await Promise.all([
        getLatestAccuracy(db),
        getAccuracyTrend(db, 30),
        getWorstPredictions(db, 10),
      ]);
      setLatest(latestAcc);
      setTrend(trendData);
      setWorst(worstData);
    } catch (err) {
      console.error('[forecast-acc-report] reload failed', err);
      toast.error('Failed to load accuracy data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await generateAccuracyRollups(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        `Processed ${result.batchesProcessed} forecast batches — ${result.totalEvaluated} predictions evaluated`
      );
      await reload();
    } catch (err) {
      console.error('[forecast-acc-report] generate failed', err);
      toast.error('Generation failed — see console');
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  // Trend chart scaling
  const trendStats = useMemo(() => {
    if (trend.length === 0) return { max: 100, range: 100 };
    const mapes = trend.map(t => t.mape);
    const max = Math.max(...mapes, 50);
    return { max, range: max };
  }, [trend]);

  return (
    <Layout>
      <DocumentTitle parts={["Forecast Accuracy", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBullseye} className="text-violet-600" />
              Forecast Accuracy
            </h1>
            <p className="text-sm text-neutral-500">
              Measure AI prediction quality — MAPE/MAE/bias + trend + best/worst hours + AI insights
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={generating} />
            {generating ? `Evaluating… (${progress.current}/${progress.total})` : 'Evaluate accuracy'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading accuracy data…</p>
          </div>
        ) : !latest ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBullseye} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No accuracy data yet</p>
            <p className="text-sm mt-1">Click "Evaluate accuracy" to compare past forecasts with actuals.</p>
            <p className="text-xs mt-2">Note: accuracy requires that forecasts were generated at least 1 day ago.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard icon={faBullseye} label="MAPE" value={`${latest.mape.toFixed(1)}%`} color={latest.mape < 25 ? 'text-emerald-600' : latest.mape < 40 ? 'text-amber-600' : 'text-rose-600'} />
              <SummaryCard icon={faChartLine} label="MAE" value={`${latest.mae.toFixed(1)} orders`} color="text-blue-600" />
              <SummaryCard
                icon={latest.bias > 0 ? faArrowTrendUp : faArrowTrendDown}
                label="Bias"
                value={`${latest.bias > 0 ? '+' : ''}${latest.bias.toFixed(1)}`}
                color={Math.abs(latest.bias) < 2 ? 'text-emerald-600' : 'text-amber-600'}
              />
              <SummaryCard icon={faGaugeHigh} label="Accuracy" value={`${latest.accuracy_pct.toFixed(1)}%`} color={latest.accuracy_pct >= 75 ? 'text-emerald-600' : latest.accuracy_pct >= 60 ? 'text-amber-600' : 'text-rose-600'} />
              <SummaryCard icon={faCheckCircle} label="Coverage" value={`${latest.coverage_pct.toFixed(0)}%`} color="text-violet-600" />
            </div>

            {/* Grade banner */}
            {(() => {
              const grade = getGrade(latest.mape);
              return (
                <div className={`rounded-lg border-2 p-4 ${grade.bg}`}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <FontAwesomeIcon icon={grade.icon} className={`text-3xl ${grade.color}`} />
                      <div>
                        <div className={`text-xl font-bold ${grade.color}`}>{grade.label}</div>
                        <div className="text-xs text-neutral-600">
                          {latest.mape.toFixed(1)}% MAPE over {latest.evaluated_count} predictions
                          {latest.bias > 0 ? ` · over-predicting by ${latest.bias.toFixed(1)} orders` : ''}
                          {latest.bias < 0 ? ` · under-predicting by ${Math.abs(latest.bias).toFixed(1)} orders` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">Period</div>
                      <div className="text-sm font-medium">
                        {new Date(latest.period_start as any).toLocaleDateString()} → {new Date(latest.period_end as any).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Accuracy trend chart */}
            {trend.length > 1 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Accuracy trend (last 30 days)</h3>
                <div className="relative h-32 flex items-end gap-px">
                  {trend.map((point, idx) => {
                    const heightPct = (point.mape / trendStats.max) * 100;
                    const isGood = point.mape < 25;
                    const isFair = point.mape < 40;
                    return (
                      <div
                        key={idx}
                        className="flex-1 relative group"
                        style={{ height: '100%' }}
                        title={`${point.date.toLocaleDateString()}: ${point.mape.toFixed(1)}% MAPE`}
                      >
                        <div
                          className={`absolute bottom-0 left-0 right-0 rounded-t transition-colors ${
                            isGood ? 'bg-emerald-400' : isFair ? 'bg-amber-400' : 'bg-rose-400'
                          }`}
                          style={{ height: `${Math.max(2, heightPct)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-neutral-400 mt-2">
                  <span>{trend[0]?.date.toLocaleDateString()}</span>
                  <span>Industry benchmarks: &lt;15% excellent · 15-25% good · 25-40% fair · &gt;40% poor</span>
                  <span>{trend[trend.length - 1]?.date.toLocaleDateString()}</span>
                </div>
              </div>
            )}

            {/* Best/worst hours + days */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faClock} className="text-blue-600" />
                  Best/worst hours
                </h3>
                <div className="space-y-2 text-sm">
                  {latest.best_hour !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-600" />
                        Best hour
                      </span>
                      <span className="font-semibold text-emerald-600">{String(latest.best_hour).padStart(2, '0')}:00</span>
                    </div>
                  )}
                  {latest.worst_hour !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faTriangleExclamation} className="text-rose-600" />
                        Worst hour
                      </span>
                      <span className="font-semibold text-rose-600">{String(latest.worst_hour).padStart(2, '0')}:00</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faCalendarDay} className="text-violet-600" />
                  Best/worst days
                </h3>
                <div className="space-y-2 text-sm">
                  {latest.best_day && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-600" />
                        Best day
                      </span>
                      <span className="font-semibold text-emerald-600">{latest.best_day}</span>
                    </div>
                  )}
                  {latest.worst_day && (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faTriangleExclamation} className="text-rose-600" />
                        Worst day
                      </span>
                      <span className="font-semibold text-rose-600">{latest.worst_day}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AI insights + recommendations */}
            {latest.ai_insights && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Insights
                </h3>
                <p className="text-sm text-violet-900 whitespace-pre-wrap mb-3">{latest.ai_insights}</p>
                {latest.ai_recommendations.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-violet-700 uppercase">Recommendations</div>
                    {latest.ai_recommendations.map((rec, idx) => (
                      <div key={idx} className="text-sm text-violet-900 flex items-start gap-2">
                        <span className="text-violet-500 mt-0.5">→</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Worst predictions table */}
            {worst.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Worst predictions (highest error)</h3>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Date</th>
                        <th className="text-center p-2">Hour</th>
                        <th className="text-center p-2">Day</th>
                        <th className="text-right p-2">Predicted</th>
                        <th className="text-right p-2">Actual</th>
                        <th className="text-right p-2">Error</th>
                        <th className="text-right p-2">Error %</th>
                        <th className="text-center p-2">AI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {worst.map((p, idx) => (
                        <tr key={idx} className="border-t hover:bg-neutral-50">
                          <td className="p-2 text-xs">{p.target_date.toLocaleDateString()}</td>
                          <td className="p-2 text-center text-xs">
                            {p.target_hour !== undefined ? `${String(p.target_hour).padStart(2, '0')}:00` : '—'}
                          </td>
                          <td className="p-2 text-center text-xs">
                            {p.day_of_week !== undefined ? DAY_NAMES[p.day_of_week].slice(0, 3) : '—'}
                          </td>
                          <td className="p-2 text-right tabular-nums">{p.predicted_orders}</td>
                          <td className="p-2 text-right tabular-nums">{p.actual_orders}</td>
                          <td className="p-2 text-right tabular-nums">
                            <span className={p.predicted_orders > p.actual_orders ? 'text-amber-600' : 'text-rose-600'}>
                              {p.predicted_orders > p.actual_orders ? '+' : ''}{p.predicted_orders - p.actual_orders}
                            </span>
                          </td>
                          <td className="p-2 text-right tabular-nums font-semibold text-rose-600">
                            {p.error_pct.toFixed(1)}%
                          </td>
                          <td className="p-2 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${p.ai_enhanced ? 'bg-violet-100 text-violet-700' : 'bg-neutral-100 text-neutral-500'}`}>
                              {p.ai_enhanced ? 'AI' : 'Stat'}
                            </span>
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
              <span>Auto-evaluate: <strong>{config.autoEvaluate ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min evaluations: <strong>{config.minEvaluations}</strong></span>
              <span>AI insights: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Predictions evaluated: <strong>{latest.evaluated_count} / {latest.total_predictions}</strong></span>
              <span>AI-enhanced: <strong>{latest.ai_enhanced ? 'yes' : 'no'}</strong></span>
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

export default ForecastAccuracyScreen;
