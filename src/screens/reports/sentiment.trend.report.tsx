/**
 * AI Customer Sentiment Trend Predictor — track and predict sentiment trends.
 *
 * 64th POSR-exclusive differentiator — sentiment trends are leading indicators
 * of revenue (HBR).
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
  faChartLine, faRotate, faLightbulb, faCheckCircle,
  faArrowTrendUp, faArrowTrendDown, faWaveSquare, faSplit, faLink,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runSentimentTrendEngine, getActiveTrends, getSummary, updateTrendStatus,
  readSentimentTrendConfig, DEFAULT_SENTIMENT_TREND_CONFIG,
  type SentimentTrend,
} from "@/lib/sentiment-trend.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  declining_trend:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowTrendDown, label: 'DECLINING' },
  improving_trend:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,   label: 'IMPROVING' },
  volatile_sentiment: { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faWaveSquare,     label: 'VOLATILE' },
  inflection_point:   { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faSplit,          label: 'INFLECTION' },
  correlation_alert:  { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faLink,           label: 'CORRELATION' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const scoreColor = (score: number): string => {
  if (score >= 0.5) return 'text-emerald-600';
  if (score >= 0) return 'text-yellow-600';
  if (score >= -0.3) return 'text-amber-600';
  return 'text-rose-600';
};

export function SentimentTrendScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [trends, setTrends] = useState<SentimentTrend[]>([]);
  const [summary, setSummary] = useState({ alertCount: 0, criticalCount: 0, currentScore: 0, predictedScore: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SENTIMENT_TREND_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSentimentTrendConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveTrends(db), getSummary(db)]);
      setTrends(list); setSummary(sum);
    } catch (err) { console.error('[sentiment-trend-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runSentimentTrendEngine(db, config);
      toast.success(result.trends.length > 0
        ? `Generated ${result.trends.length} sentiment trend alerts — ${result.trends.filter(t => t.severity === 'critical').length} critical`
        : `No trend alerts — sentiment stable`);
      await reload();
    } catch (err) { console.error('[sentiment-trend-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (trendId: string, status: 'investigated' | 'acted') => {
    try { await updateTrendStatus(db, trendId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedTrends = [...trends].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
  });

  return (
    <Layout>
      <DocumentTitle parts={["Sentiment Trend", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-violet-600" />
              AI Sentiment Trend
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts sentiment trends — leading indicator of revenue (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Analyze trends'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : trends.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChartLine} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No trend alerts!</p>
            <p className="text-sm mt-1">Click "Analyze trends" to detect sentiment direction and predict future scores.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faChartLine} />Alerts</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.alertCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Current score</div>
                <div className={`text-2xl font-bold tabular-nums ${scoreColor(summary.currentScore)}`}>{summary.currentScore.toFixed(2)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Predicted next wk</div>
                <div className={`text-2xl font-bold tabular-nums ${scoreColor(summary.predictedScore)}`}>{summary.predictedScore.toFixed(2)}</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedTrends.map((t, idx) => {
                const style = RULE_STYLE[t.rule_id] ?? RULE_STYLE.declining_trend;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[t.severity] ?? SEVERITY_DOT.low}`}></span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          {t.trend_direction && (
                            <span className={`text-xs px-2 py-0.5 rounded capitalize ${t.trend_direction === 'improving' ? 'bg-emerald-100 text-emerald-700' : t.trend_direction === 'declining' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {t.trend_direction}
                            </span>
                          )}
                          {t.correlated_factor && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 capitalize">
                              <FontAwesomeIcon icon={faLink} className="mr-1" />{t.correlated_factor.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Confidence: <strong className="text-violet-600">{Math.round(t.confidence * 100)}%</strong></span>
                          <span className="text-neutral-500">Reviews: <strong>{t.data_points}</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{t.description}</p>
                    </div>

                    <div className="p-3">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3 text-center">
                        <div>
                          <div className="text-xs text-neutral-500">Current</div>
                          <div className={`font-bold tabular-nums ${scoreColor(t.current_score)}`}>{t.current_score.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Previous</div>
                          <div className={`font-bold tabular-nums ${scoreColor(t.previous_score)}`}>{t.previous_score.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Slope/wk</div>
                          <div className={`font-bold tabular-nums ${t.trend_slope > 0 ? 'text-emerald-600' : t.trend_slope < 0 ? 'text-rose-600' : 'text-neutral-500'}`}>
                            {t.trend_slope > 0 ? '+' : ''}{t.trend_slope.toFixed(3)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Predicted</div>
                          <div className={`font-bold tabular-nums ${scoreColor(t.predicted_score)}`}>{t.predicted_score.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Volatility</div>
                          <div className={`font-bold tabular-nums ${t.volatility > 0.3 ? 'text-rose-600' : 'text-neutral-500'}`}>{t.volatility.toFixed(2)}</div>
                        </div>
                      </div>

                      {t.est_revenue_impact !== 0 && (
                        <div className={`mb-3 p-2 rounded border ${t.est_revenue_impact > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                          <p className={`text-xs ${t.est_revenue_impact > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            <strong>Est. revenue impact:</strong> {t.est_revenue_impact > 0 ? '+' : ''}{withCurrency(t.est_revenue_impact)}/wk
                          </p>
                        </div>
                      )}

                      {t.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{t.ai_insight}</p>
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => t.id && handleStatus(t.id, 'investigated')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          Investigate
                        </button>
                        <button onClick={() => t.id && handleStatus(t.id, 'acted')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Acted
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Decline threshold: <strong>{config.declineThreshold}</strong></span>
              <span>Volatility threshold: <strong>{config.volatilityThreshold}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default SentimentTrendScreen;
