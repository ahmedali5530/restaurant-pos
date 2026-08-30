/**
 * Promo Forecast Dashboard — ROI prediction before launch + AI recommendations.
 *
 * 18th POSR-exclusive differentiator — Toast and Square have basic coupon
 * CRUD but NO predictive ROI modeling. POSR forecasts ROI before launch.
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
  faBullhorn, faRocket, faRobot, faRotate, faLightbulb,
  faCheckCircle, faXmark, faEye, faWandMagicSparkles,
  faDollarSign, faPercent, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPromoForecast,
  getActiveForecasts,
  getPromoForecastSummary,
  readPromoForecastConfig,
  DEFAULT_PROMOFORECAST_CONFIG,
  type PromoForecast,
  type PromoRecommendation,
} from "@/lib/promo-forecast.service.ts";

const REC_STYLE: Record<PromoRecommendation, { bg: string; text: string; icon: any; label: string }> = {
  launch:    { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: faRocket,        label: 'Launch' },
  optimize:  { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: faWandMagicSparkles, label: 'Optimize' },
  reject:    { bg: 'bg-rose-100',    text: 'text-rose-700',    icon: faXmark,         label: 'Reject' },
  a_b_test: { bg: 'bg-violet-100',  text: 'text-violet-700',  icon: faEye,           label: 'A/B Test' },
};

export function PromoForecastScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [forecasts, setForecasts] = useState<PromoForecast[]>([]);
  const [summary, setSummary] = useState({
    total: 0, launch: 0, optimize: 0, reject: 0,
    totalDiscountCost: 0, totalNetRevenue: 0, avgRoi: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_PROMOFORECAST_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPromoForecastConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getActiveForecasts(db),
        getPromoForecastSummary(db),
      ]);
      setForecasts(list);
      setSummary(sum);
    } catch (err) {
      console.error('[promoforecast-report] reload failed', err);
      toast.error('Failed to load forecasts');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runPromoForecast(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.forecasts.length > 0
          ? `Forecasted ${result.forecasts.length} campaigns — avg ROI ${(result.forecasts.reduce((s, f) => s + f.est_roi, 0) / Math.max(1, result.forecasts.length)).toFixed(2)}×`
          : `No active campaigns to forecast`
      );
      await reload();
    } catch (err) {
      console.error('[promoforecast-report] analyze failed', err);
      toast.error('Forecast failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Promo Forecast", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBullhorn} className="text-amber-600" />
              Promo Campaign Forecast
            </h1>
            <p className="text-sm text-neutral-500">
              AI ROI prediction before launch — redemption forecast + cannibalization + AI recommendation (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Forecasting… (${progress.current}/${progress.total})` : 'Run forecast'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading forecasts…</p>
          </div>
        ) : forecasts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No active campaigns!</p>
            <p className="text-sm mt-1">Create coupons and click "Run forecast" to predict ROI.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faRocket} />Launch</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.launch}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Optimize</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.optimize}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">A/B Test</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total - summary.launch - summary.optimize - summary.reject}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Reject</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.reject}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Discount cost</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{withCurrency(summary.totalDiscountCost)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Net revenue</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalNetRevenue)}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Avg ROI</div>
                <div className={`text-2xl font-bold tabular-nums ${summary.avgRoi >= 1.5 ? 'text-emerald-600' : summary.avgRoi >= 0.8 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {summary.avgRoi.toFixed(2)}×
                </div>
              </div>
            </div>

            {/* Forecast list */}
            <div className="space-y-3">
              {forecasts.map((forecast, idx) => {
                const rec = forecast.ai_recommendation ?? 'a_b_test';
                const recStyle = REC_STYLE[rec] ?? REC_STYLE.a_b_test;
                const roiPositive = forecast.est_net_revenue_impact >= 0;
                const cannibalizationPct = forecast.est_discount_cost > 0
                  ? (forecast.est_cannibalization_cost / forecast.est_discount_cost) * 100
                  : 0;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${roiPositive ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'}`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faBullhorn} className="text-xl text-amber-600" />
                        <span className="font-semibold">{forecast.coupon_code ?? 'Campaign'}</span>
                        <span className="text-sm text-neutral-500 capitalize">
                          · {forecast.discount_type === 'percentage' ? `${(forecast.discount_value * 100).toFixed(0)}%` : withCurrency(forecast.discount_value)} off
                        </span>
                        <span className="text-sm text-neutral-500">· {forecast.campaign_duration_days}d</span>
                        <span className="text-sm text-neutral-500">· {forecast.est_audience_size} audience</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${recStyle.bg} ${recStyle.text}`}>
                          <FontAwesomeIcon icon={recStyle.icon} className="mr-1" />{recStyle.label}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Est. ROI</div>
                        <div className={`text-2xl font-bold tabular-nums ${forecast.est_roi >= 1.5 ? 'text-emerald-600' : forecast.est_roi >= 0.8 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {forecast.est_roi.toFixed(2)}×
                        </div>
                      </div>
                    </div>

                    {/* Revenue breakdown */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 bg-white/70 rounded p-3">
                      <div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1"><FontAwesomeIcon icon={faPercent} />Redemption rate</div>
                        <div className="font-bold tabular-nums text-neutral-700">{(forecast.est_redemption_rate * 100).toFixed(1)}%</div>
                        <div className="text-[10px] text-neutral-400">{forecast.est_redemptions} redemptions</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Discount cost</div>
                        <div className="font-bold tabular-nums text-rose-600">{withCurrency(forecast.est_discount_cost)}</div>
                        <div className="text-[10px] text-neutral-400">{withCurrency(forecast.est_avg_discount_amount)}/redemption</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Incremental rev</div>
                        <div className="font-bold tabular-nums text-emerald-600">+{withCurrency(forecast.est_incremental_revenue)}</div>
                        <div className="text-[10px] text-neutral-400">new customers</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Cannibalization</div>
                        <div className="font-bold tabular-nums text-amber-600">-{withCurrency(forecast.est_cannibalization_cost)}</div>
                        <div className="text-[10px] text-amber-500">{cannibalizationPct.toFixed(0)}% of cost</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Net impact</div>
                        <div className={`font-bold tabular-nums ${roiPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {roiPositive ? '+' : ''}{withCurrency(forecast.est_net_revenue_impact)}
                        </div>
                        <div className="text-[10px] text-neutral-400">confidence: {Math.round(forecast.confidence * 100)}%</div>
                      </div>
                    </div>

                    {/* AI insight */}
                    {forecast.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{forecast.ai_insight}
                        </p>
                      </div>
                    )}

                    {/* Cannibalization warning */}
                    {cannibalizationPct > 100 && (
                      <div className="mt-2 bg-rose-100 rounded p-2 border border-rose-300">
                        <p className="text-xs text-rose-700 font-medium">
                          <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1" />
                          High cannibalization — {cannibalizationPct.toFixed(0)}% of discount cost lost to existing customers. Consider new-customer-only targeting.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min similar: <strong>{config.minSimilar} campaigns</strong></span>
              <span>Default audience: <strong>{config.defaultAudience}</strong></span>
              <span>Launch ROI: <strong>≥ {config.goodRoiThreshold}×</strong></span>
              <span>Reject ROI: <strong>&lt; {config.rejectRoiThreshold}×</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default PromoForecastScreen;
