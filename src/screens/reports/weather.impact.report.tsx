/**
 * Weather Impact Analysis Dashboard — correlate weather with sales.
 *
 * 38th POSR-exclusive differentiator — weather affects revenue by 20-30%.
 * No POS system correlates weather data. POSR does.
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
  faCloudSun, faRobot, faRotate, faLightbulb,
  faCloudRain, faSun, faTemperatureHalf, faChartLine,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runWeatherAnalysis, getLatestAnalysis,
  readWeatherConfig, DEFAULT_WEATHER_CONFIG,
  type WeatherImpact,
} from "@/lib/weather-impact.service.ts";

const CONDITION_ICON: Record<string, any> = {
  sunny: faSun, cloudy: faCloudSun, rainy: faCloudRain,
  stormy: faCloudRain, snowy: faCloudRain, foggy: faCloudSun,
};

const REC_LABEL: Record<string, string> = {
  adjust_staffing: 'Adjust staffing', prepare_promo: 'Prepare promo',
  reduce_inventory: 'Reduce inventory', increase_staffing: 'Increase staffing',
  no_action: 'No action',
};

export function WeatherImpactScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [impact, setImpact] = useState<WeatherImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_WEATHER_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWeatherConfig(settingsRows[0] ?? {}));
      const w = await getLatestAnalysis(db);
      setImpact(w);
    } catch (err) { console.error('[weather-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true); setProgress({ current: 0, total: 2 });
    try {
      const result = await runWeatherAnalysis(db, config, (current, total) => setProgress({ current, total }));
      if (result.impact) {
        toast.success(`Weather analysis complete — ${result.impact.condition}, ${result.impact.avg_temp}°C, expected revenue ${withCurrency(result.impact.expected_revenue)}`);
      } else {
        toast.error('Not enough data for analysis');
      }
      await reload();
    } catch (err) { console.error('[weather-report] analyze failed', err); toast.error('Analysis failed — see console'); }
    finally { setAnalyzing(false); setProgress({ current: 0, total: 0 }); }
  }, [db, config, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Weather Impact", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCloudSun} className="text-blue-500" />
              Weather Impact Analysis
            </h1>
            <p className="text-sm text-neutral-500">
              AI weather-sales correlation — how temperature, rain, wind affect revenue (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze impact'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading…</p>
          </div>
        ) : !impact ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCloudSun} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No weather analysis yet!</p>
            <p className="text-sm mt-1">Click "Analyze impact" to correlate weather with sales.</p>
          </div>
        ) : (
          <>
            {/* Current weather card */}
            <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-4 mb-3">
                <FontAwesomeIcon icon={CONDITION_ICON[impact.condition ?? 'cloudy'] ?? faCloudSun} className="text-4xl text-blue-500" />
                <div>
                  <div className="text-xs text-neutral-500">Current Condition</div>
                  <div className="text-lg font-semibold capitalize">{impact.condition ?? 'Unknown'}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/70 rounded p-2 text-center">
                  <div className="text-xs text-neutral-500 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTemperatureHalf} />Temp</div>
                  <div className="text-lg font-bold tabular-nums">{impact.avg_temp ?? '—'}°C</div>
                </div>
                <div className="bg-white/70 rounded p-2 text-center">
                  <div className="text-xs text-neutral-500">Precipitation</div>
                  <div className="text-lg font-bold tabular-nums">{impact.precipitation_mm ?? '—'}mm</div>
                </div>
                <div className="bg-white/70 rounded p-2 text-center">
                  <div className="text-xs text-neutral-500">Wind</div>
                  <div className="text-lg font-bold tabular-nums">{impact.wind_kmh ?? '—'}km/h</div>
                </div>
              </div>
            </div>

            {/* Correlation metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                  <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faChartLine} />Temp correlation</div>
                  <div className={`text-xl font-bold tabular-nums ${(impact.temp_correlation ?? 0) > 0.3 ? 'text-emerald-700' : (impact.temp_correlation ?? 0) < -0.3 ? 'text-rose-700' : 'text-amber-700'}`}>
                    {(impact.temp_correlation ?? 0).toFixed(2)}
                  </div>
                </div>
                <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                  <div className="text-xs text-rose-600">Rain impact</div>
                  <div className={`text-xl font-bold tabular-nums ${(impact.rain_impact_pct ?? 0) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {(impact.rain_impact_pct ?? 0) > 0 ? '+' : ''}{(impact.rain_impact_pct ?? 0).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                  <div className="text-xs text-amber-600">Sunny boost</div>
                  <div className={`text-xl font-bold tabular-nums ${(impact.sunny_boost_pct ?? 0) > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {(impact.sunny_boost_pct ?? 0) > 0 ? '+' : ''}{(impact.sunny_boost_pct ?? 0).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                  <div className="text-xs text-violet-600">Optimal temp</div>
                  <div className="text-xl font-bold tabular-nums">{impact.optimal_temp_range ?? '—'}</div>
                </div>
              </div>

            {/* Expected revenue */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <div className="text-sm font-semibold text-neutral-700 mb-2">Today's Revenue Projection (weather-adjusted)</div>
              <div className="text-3xl font-bold text-blue-600 tabular-nums">{withCurrency(impact.expected_revenue)}</div>
              <div className="text-xs text-neutral-500 mt-1">Adjusted for today's weather conditions</div>
            </div>

            {/* AI insight */}
            {impact.ai_insight && (
              <div className="bg-violet-50/70 rounded-lg border border-violet-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FontAwesomeIcon icon={faLightbulb} className="text-violet-600" />
                  <span className="font-semibold text-violet-700">AI Insight</span>
                  {impact.ai_recommendation && (
                    <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-medium">
                      {REC_LABEL[impact.ai_recommendation] ?? impact.ai_recommendation}
                    </span>
                  )}
                </div>
                <p className="text-sm text-violet-700">{impact.ai_insight}</p>
              </div>
            )}

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Temp buckets: <strong>{config.tempBuckets}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default WeatherImpactScreen;
