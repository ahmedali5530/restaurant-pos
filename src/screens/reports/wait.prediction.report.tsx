/**
 * Wait Time Prediction Dashboard — predictive waitlist quoting + accuracy tracking.
 *
 * 17th POSR-exclusive differentiator — OpenTable has basic waitlist but NO
 * predictive modeling. Toast Waitlist $50/mo has static quoting.
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
  faClock, faHourglassHalf, faRobot, faRotate, faLightbulb,
  faUsers, faChartLine, faPercent, faBullseye,
  faTriangleExclamation, faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";
import {
  runWaitPrediction,
  getActivePredictions,
  getWaitPredSummary,
  readWaitPredConfig,
  DEFAULT_WAITPRED_CONFIG,
  type WaitPrediction,
} from "@/lib/wait-prediction.service.ts";

const formatMin = (min: number): string => min < 60 ? `${min.toFixed(0)} min` : `${Math.floor(min/60)}h ${Math.round(min%60)}m`;

export function WaitPredictionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<WaitPrediction[]>([]);
  const [summary, setSummary] = useState({
    totalActive: 0, avgPredictedWait: 0, highWalkawayRisk: 0, avgConfidence: 0,
    accuracyCount: 0, avgErrorMin: 0, mapePct: 0, within5MinPct: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_WAITPRED_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWaitPredConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getActivePredictions(db),
        getWaitPredSummary(db),
      ]);
      setPredictions(list);
      setSummary(sum);
    } catch (err) {
      console.error('[waitpred-report] reload failed', err);
      toast.error('Failed to load predictions');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await runWaitPrediction(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.predictions.length > 0
          ? `Predicted wait for ${result.predictions.length} waitlist entries — avg ${formatMin(result.predictions.reduce((s, p) => s + p.predicted_wait_min, 0) / Math.max(1, result.predictions.length))}`
          : `No active waitlist entries to predict`
      );
      await reload();
    } catch (err) {
      console.error('[waitpred-report] analyze failed', err);
      toast.error('Prediction failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Wait Time Prediction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faHourglassHalf} className="text-amber-600" />
              Wait Time Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              AI predictive waitlist quoting — historical baselines + real-time load + accuracy tracking (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Predicting… (${progress.current}/${progress.total})` : 'Predict waits'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading predictions…</p>
          </div>
        ) : (
          <>
            {/* Summary — active predictions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Active predictions</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.totalActive}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Avg predicted wait</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{formatMin(summary.avgPredictedWait)}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">High walkaway risk</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.highWalkawayRisk}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg confidence</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{Math.round(summary.avgConfidence * 100)}%</div>
              </div>
            </div>

            {/* Accuracy metrics */}
            {summary.accuracyCount > 0 && (
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4">
                <div className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-2">
                  <FontAwesomeIcon icon={faBullseye} /> Model Accuracy (from {summary.accuracyCount} completed entries)
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-emerald-600">Avg error</div>
                    <div className="font-bold tabular-nums text-emerald-700">{formatMin(Math.abs(summary.avgErrorMin))} {summary.avgErrorMin >= 0 ? '(overestimate)' : '(underestimate)'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-emerald-600">MAPE</div>
                    <div className="font-bold tabular-nums text-emerald-700">{summary.mapePct.toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-emerald-600">Within ±5 min</div>
                    <div className="font-bold tabular-nums text-emerald-700">{summary.within5MinPct.toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            )}

            {predictions.length === 0 ? (
              <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
                <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
                <p className="text-lg font-medium text-emerald-600">No active waitlist entries!</p>
                <p className="text-sm mt-1">Predictions auto-generate when customers join the waitlist.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {predictions.map((pred, idx) => {
                  const walkawayHigh = pred.est_walkaway_risk > 0.5;
                  const confidenceHigh = pred.confidence >= 0.6;
                  return (
                    <div key={idx} className={`rounded-lg border-2 p-4 ${
                      walkawayHigh ? 'bg-rose-50 border-rose-400' : 'bg-amber-50 border-amber-400'
                    }`}>
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FontAwesomeIcon icon={faClock} className={`text-xl ${walkawayHigh ? 'text-rose-600' : 'text-amber-600'}`} />
                          <span className="font-semibold">{pred.customer_name}</span>
                          <span className="text-sm text-neutral-500">
                            · <FontAwesomeIcon icon={faUsers} className="mr-1" />Party of {pred.party_size}
                          </span>
                          <span className="text-sm text-neutral-500">
                            · {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][pred.day_of_week]} {pred.hour_of_day}:00
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0 flex items-center gap-4">
                          <div>
                            <div className="text-xs text-neutral-500">Predicted wait</div>
                            <div className={`text-2xl font-bold tabular-nums ${walkawayHigh ? 'text-rose-700' : 'text-amber-700'}`}>
                              {formatMin(pred.predicted_wait_min)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">Confidence</div>
                            <div className={`font-bold tabular-nums ${confidenceHigh ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {Math.round(pred.confidence * 100)}%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Walkaway risk bar */}
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-neutral-600">Walkaway risk</span>
                          <span className={`font-semibold tabular-nums ${walkawayHigh ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {Math.round(pred.est_walkaway_risk * 100)}%
                          </span>
                        </div>
                        <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${walkawayHigh ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            style={{ width: `${pred.est_walkaway_risk * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex gap-4 text-xs text-neutral-600 mb-2 bg-white/60 rounded p-2">
                        <span>Baseline: <strong className="tabular-nums">{formatMin(pred.historical_baseline_min)}</strong></span>
                        <span>Load: <strong className="tabular-nums">{pred.load_multiplier.toFixed(2)}×</strong></span>
                        <span>Occupancy: <strong className="tabular-nums">{pred.current_occupancy}/{pred.typical_occupancy}</strong></span>
                      </div>

                      {/* AI reasoning */}
                      {pred.ai_reasoning && (
                        <div className="bg-violet-50/70 rounded p-2 border border-violet-200">
                          <p className="text-xs text-violet-700 italic">
                            <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{pred.ai_reasoning}
                          </p>
                        </div>
                      )}

                      {walkawayHigh && (
                        <div className="mt-2 bg-rose-100 rounded p-2 border border-rose-300">
                          <p className="text-xs text-rose-700 font-medium">
                            <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1" />
                            High walkaway risk — consider offering bar seating or call-ahead
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Party size adjust: <strong>+{(config.partySizeAdjust * 100).toFixed(0)}%/seat</strong></span>
              <span>Min confidence: <strong>{(config.minConfidence * 100).toFixed(0)}%</strong></span>
              <span>Walkaway threshold: <strong>{config.walkawayThresholdMin} min</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default WaitPredictionScreen;
