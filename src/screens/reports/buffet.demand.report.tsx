/**
 * Buffet Demand Prediction Dashboard — predict guest count per session.
 *
 * 31st POSR-exclusive differentiator — buffet restaurants waste 15-25% of
 * food due to inaccurate guest forecasting. POSR predicts guest count.
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
  faUtensils, faRobot, faRotate, faLightbulb,
  faCheckCircle, faUsers, faChartBar, faDollarSign, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runBuffetDemandPrediction, getActivePredictions, getSummary,
  readBuffetDemandConfig, DEFAULT_BUFFET_DEMAND_CONFIG,
  type BuffetDemandPrediction,
} from "@/lib/buffet-demand.service.ts";

const formatDate = (d: Date | string): string => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function BuffetDemandScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<BuffetDemandPrediction[]>([]);
  const [summary, setSummary] = useState({ total: 0, avgPredicted: 0, totalWastePrevention: 0, avgConfidence: 0, stockoutRiskCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_BUFFET_DEMAND_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readBuffetDemandConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActivePredictions(db), getSummary(db)]);
      setPredictions(list); setSummary(sum);
    } catch (err) { console.error('[buffet-demand-report] reload failed', err); toast.error('Failed to load predictions'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true); setProgress({ current: 0, total: 2 });
    try {
      const result = await runBuffetDemandPrediction(db, config, (current, total) => setProgress({ current, total }));
      toast.success(result.predictions.length > 0
        ? `Predicted demand for ${result.predictions.length} buffet sessions — avg ${Math.round(result.predictions.reduce((s, p) => s + p.predicted_guests, 0) / Math.max(1, result.predictions.length))} guests`
        : `No upcoming buffet sessions found`);
      await reload();
    } catch (err) { console.error('[buffet-demand-report] analyze failed', err); toast.error('Prediction failed — see console'); }
    finally { setAnalyzing(false); setProgress({ current: 0, total: 0 }); }
  }, [db, config, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Buffet Demand Prediction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUtensils} className="text-amber-600" />
              Buffet Demand Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              AI guest count prediction per buffet session — minimize waste + prevent stockouts (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Predicting… (${progress.current}/${progress.total})` : 'Predict demand'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading predictions…</p>
          </div>
        ) : predictions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No upcoming buffet sessions!</p>
            <p className="text-sm mt-1">Create buffet sessions and click "Predict demand".</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Sessions</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faUsers} />Avg predicted</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{Math.round(summary.avgPredicted)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Waste prevention</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalWastePrevention)}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg confidence</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{Math.round(summary.avgConfidence * 100)}%</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Stockout risk</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.stockoutRiskCount}</div>
              </div>
            </div>

            <div className="space-y-3">
              {predictions.map((pred, idx) => {
                const highStockoutRisk = pred.est_stockout_risk > 0.2;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${highStockoutRisk ? 'bg-rose-50 border-rose-400' : 'bg-white border-neutral-200'}`}>
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faUtensils} className={`text-xl ${highStockoutRisk ? 'text-rose-600' : 'text-amber-600'}`} />
                        <span className="font-semibold capitalize">{pred.session_type}</span>
                        <span className="text-sm text-neutral-500">· {formatDate(pred.business_date)}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Predicted guests</div>
                        <div className={`text-2xl font-bold tabular-nums ${highStockoutRisk ? 'text-rose-600' : 'text-amber-700'}`}>{pred.predicted_guests}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2 bg-neutral-50 rounded p-3 text-sm">
                      <div>
                        <div className="text-xs text-neutral-500">Manager expected</div>
                        <div className="font-bold tabular-nums text-neutral-700">{pred.expected_guests}</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Historical avg</div>
                        <div className="font-bold tabular-nums text-neutral-700">{pred.historical_avg.toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Trend</div>
                        <div className={`font-bold tabular-nums ${pred.trend_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {pred.trend_pct >= 0 ? '+' : ''}{pred.trend_pct.toFixed(0)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Confidence</div>
                        <div className={`font-bold tabular-nums ${pred.confidence >= 0.6 ? 'text-emerald-600' : 'text-amber-600'}`}>{Math.round(pred.confidence * 100)}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Rec. production</div>
                        <div className="font-bold tabular-nums text-neutral-700">{pred.recommended_qty.toFixed(1)} kg</div>
                      </div>
                    </div>

                    {(pred.est_waste_prevention > 0 || pred.est_stockout_risk > 0) && (
                      <div className="flex gap-4 text-xs mb-2">
                        {pred.est_waste_prevention > 0 && (
                          <span className="text-emerald-700"><FontAwesomeIcon icon={faDollarSign} className="mr-1" />Waste prevention: {withCurrency(pred.est_waste_prevention)}</span>
                        )}
                        {pred.est_stockout_risk > 0 && (
                          <span className="text-rose-700"><FontAwesomeIcon icon={faTriangleExclamation} className="mr-1" />Stockout risk: {Math.round(pred.est_stockout_risk * 100)}%</span>
                        )}
                      </div>
                    )}

                    {pred.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{pred.ai_insight}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Portion/guest: <strong>{config.portionPerGuest} kg</strong></span>
              <span>Waste cost/kg: <strong>{withCurrency(config.wasteCostPerKg)}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default BuffetDemandScreen;
