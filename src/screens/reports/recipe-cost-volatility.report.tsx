/**
 * AI Recipe Cost Volatility Predictor — forecasts which menu items become
 * unprofitable in next 30/60/90 days from external cost signals (weather,
 * commodity futures, supply chain, seasonal patterns).
 *
 * 140th POSR-exclusive differentiator — pre-emptive cost protection.
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
  faChartLine, faRotate, faSeedling, faCow, faFish, faWheatAwn,
  faMugHot, faOilCan, faCloudBolt, faShip, faTriangleExclamation,
  faCheckCircle, faExchangeAlt, faFlask, faLock, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runCostVolEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readCostVolConfig, DEFAULT_COSTVOL_CONFIG,
  type CostVolAlert,
} from "@/lib/recipe-cost-volatility.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  seasonal_cost_spike_predicted:        { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faSeedling,         label: 'SEASONAL' },
  commodity_market_trend_up:            { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faChartLine,        label: 'COMMODITY' },
  weather_disruption_predicted:         { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faCloudBolt,        label: 'WEATHER' },
  supply_chain_delay_predicted:         { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faShip,             label: 'SUPPLY CHAIN' },
  margin_threshold_breach_forecast:     { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faTriangleExclamation, label: 'MARGIN BREACH' },
  high_volatility_ingredient:           { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faChartLine,        label: 'VOLATILE' },
  alternative_supplier_available:       { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faExchangeAlt,      label: 'ALT SUPPLIER' },
  recipe_reformulation_recommended:     { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faFlask,            label: 'REFORMULATE' },
};

const CATEGORY_ICON: Record<string, any> = {
  produce: faSeedling,
  meat: faCow,
  seafood: faFish,
  grain: faWheatAwn,
  beverage: faMugHot,
  oil: faOilCan,
  spice: faSeedling,
  dairy: faMugHot,
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function RecipeCostVolatilityScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<CostVolAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, ingredientCount: 0, avgConfidence: 0, thresholdBreaches: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_COSTVOL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCostVolConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[costvol-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runCostVolEngine(db, config);
      toast.success(`Forecast ${result.generated} cost signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[costvol-report] analyze failed', err);
      toast.error('Forecast failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[costvol-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_opportunity ?? 0) - (a.est_monthly_opportunity ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Recipe Cost Volatility", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-violet-500" />
              AI Recipe Cost Volatility Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Forecasts ingredient cost changes 30/60/90 days ahead — pre-emptive repricing, hedging, substitution
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faChartLine} spin={analyzing} />
              {analyzing ? 'Forecasting…' : 'Run forecast'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Margin breaches" value={String(summary.thresholdBreaches)} color="text-rose-600" />
          <SummaryCard icon={faSeedling} label="Ingredients tracked" value={String(summary.ingredientCount)} color="text-amber-600" />
          <SummaryCard icon={faCheckCircle} label="Avg confidence" value={`${summary.avgConfidence.toFixed(0)}%`} color={summary.avgConfidence >= 80 ? 'text-emerald-600' : 'text-amber-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChartLine} spin className="text-4xl mb-3" />
            <p>Forecasting ingredient cost volatility…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No cost volatility alerts</p>
            <p className="text-sm mt-1">All ingredients forecast stable for the next 90 days.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faChartLine, label: alert.rule_id.toUpperCase() };
              const catIcon = alert.ingredient_category ? (CATEGORY_ICON[alert.ingredient_category] ?? faSeedling) : faSeedling;
              return (
                <div key={alert.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {alert.ingredient_name && (
                            <span className="text-sm font-semibold text-neutral-800 flex items-center gap-1.5">
                              <FontAwesomeIcon icon={catIcon} className="text-neutral-500" />
                              {alert.ingredient_name}
                            </span>
                          )}
                          {alert.ingredient_category && (
                            <span className="text-xs text-neutral-500 uppercase">{alert.ingredient_category}</span>
                          )}
                          {alert.affected_dish_count != null && alert.affected_dish_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.affected_dish_count} dish{alert.affected_dish_count > 1 ? 'es' : ''}</span>
                          )}
                          {alert.threshold_breach_days != null && (
                            <span className="text-xs font-bold text-rose-600">breach in {alert.threshold_breach_days}d</span>
                          )}
                          {alert.confidence_score != null && (
                            <span className={`text-xs font-medium ${alert.confidence_score >= 85 ? 'text-emerald-600' : alert.confidence_score >= 70 ? 'text-amber-600' : 'text-neutral-500'}`}>
                              {alert.confidence_score.toFixed(0)}% conf
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.current_price != null && alert.forecast_price_30d != null && (
                            <span>
                              {fmt$(alert.current_price)} <span className="text-neutral-400">→</span>{' '}
                              <span className="text-amber-600">{fmt$(alert.forecast_price_30d)} (30d)</span>
                              {alert.forecast_price_90d != null && (
                                <span className="text-rose-600"> · {fmt$(alert.forecast_price_90d)} (90d)</span>
                              )}
                            </span>
                          )}
                          {alert.price_change_pct_90d != null && alert.price_change_pct_90d > 0 && (
                            <span className="text-rose-600 font-medium">+{alert.price_change_pct_90d.toFixed(0)}% / 90d</span>
                          )}
                          {alert.current_margin_pct != null && alert.forecast_margin_pct != null && (
                            <span>
                              margin: <span className="text-emerald-600">{alert.current_margin_pct.toFixed(0)}%</span>
                              <span className="text-neutral-400"> → </span>
                              <span className="text-rose-600 font-medium">{alert.forecast_margin_pct.toFixed(0)}%</span>
                            </span>
                          )}
                        </div>
                        {alert.trigger_detail && (
                          <div className="mt-2 bg-neutral-50 border border-neutral-200 rounded px-3 py-1.5 text-xs text-neutral-700 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0 text-amber-500" />
                            <span><span className="font-medium">Signal:</span> {alert.trigger_detail}</span>
                          </div>
                        )}
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLock} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo at risk</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Action taken
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> In progress
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => alert.id && handleStatus(alert.id, 'rejected')}>
                      Skip
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Margin threshold: {config.marginThreshold}%</span>
          <span>Forecast horizon: {config.forecastHorizonDays} days</span>
          <span>Volatility threshold: {config.volatilityThreshold}%</span>
          <span className="text-neutral-400">140th POSR-exclusive differentiator</span>
        </div>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center gap-3">
      <FontAwesomeIcon icon={icon} className={`text-2xl ${color}`} />
      <div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export default RecipeCostVolatilityScreen;
