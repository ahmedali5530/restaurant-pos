/**
 * Customer Sentiment Dashboard — AI-powered review analysis + insights.
 *
 * Research finding: Square Customer Insights + Lightspeed Customer Engagement
 * bundle sentiment analysis in higher tiers (~$50/mo). POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (total reviews, avg rating, NPS, % positive, high-actionability count)
 *   2. Sentiment breakdown (positive/neutral/negative/mixed bar chart)
 *   3. Top positive + negative themes (side-by-side)
 *   4. Top mentioned dishes (most-discussed items)
 *   5. Recent reviews table with sentiment badge + emotion + themes + suggested response
 *   6. Analyze button (runs AI analysis on unanalyzed reviews + generates weekly summary)
 *
 * Placement: new route /reports/sentiment
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
  faStar, faHeart, faFaceFrown, faFaceMeh, faFaceSmile, faRobot, faChartLine,
  faArrowTrendUp, faArrowTrendDown, faUtensils, faLightbulb, faRotate, faComment,
} from "@fortawesome/free-solid-svg-icons";
import {
  analyzeUnanalyzedReviews,
  generateSummary,
  getRecentAnalyses,
  getLatestSummary,
  readSentimentConfig,
  DEFAULT_SENTIMENT_CONFIG,
  type CustomerReview,
  type SentimentAnalysis,
  type SentimentSummary,
  type Sentiment,
} from "@/lib/sentiment.service.ts";

const SENTIMENT_STYLE: Record<Sentiment, { bg: string; text: string; icon: any; label: string }> = {
  positive: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faFaceSmile, label: 'Positive' },
  neutral:  { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: faFaceMeh, label: 'Neutral' },
  negative: { bg: 'bg-rose-50', text: 'text-rose-700', icon: faFaceFrown, label: 'Negative' },
  mixed:    { bg: 'bg-amber-50', text: 'text-amber-700', icon: faFaceMeh, label: 'Mixed' },
};

const RATING_STARS = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

export function SentimentReportScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [reviews, setReviews] = useState<{ review: CustomerReview; analysis?: SentimentAnalysis }[]>([]);
  const [summary, setSummary] = useState<SentimentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [filter, setFilter] = useState<'all' | Sentiment>('all');
  const [config, setConfig] = useState(DEFAULT_SENTIMENT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSentimentConfig(settingsRows[0] ?? {}));

      const [list, sum] = await Promise.all([
        getRecentAnalyses(db, 50),
        getLatestSummary(db, 'weekly'),
      ]);
      setReviews(list);
      setSummary(sum);
    } catch (err) {
      console.error('[sentiment-report] reload failed', err);
      toast.error('Failed to load sentiment data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await analyzeUnanalyzedReviews(db, config);
      // Then generate fresh weekly summary
      await generateSummary(db, 'weekly');
      toast.success(
        `Analyzed ${result.analyzed} reviews — ${result.positive} positive, ${result.negative} negative, ${result.highActionability} high-actionability`
      );
      await reload();
    } catch (err) {
      console.error('[sentiment-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
    }
  }, [db, config, reload]);

  const stats = useMemo(() => {
    const analyses = reviews.map(r => r.analysis).filter(Boolean) as SentimentAnalysis[];
    const positive = analyses.filter(a => a.sentiment === 'positive').length;
    const neutral = analyses.filter(a => a.sentiment === 'neutral').length;
    const negative = analyses.filter(a => a.sentiment === 'negative').length;
    const mixed = analyses.filter(a => a.sentiment === 'mixed').length;
    const highAction = analyses.filter(a => a.actionability === 'high').length;
    const avgRating = reviews.length > 0
      ? reviews.reduce((s, r) => s + (r.review.rating ?? 0), 0) / reviews.length
      : 0;
    return {
      total: reviews.length,
      positive, neutral, negative, mixed,
      highAction,
      avgRating,
      positivePct: analyses.length > 0 ? (positive / analyses.length) * 100 : 0,
    };
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    if (filter === 'all') return reviews;
    return reviews.filter(r => r.analysis?.sentiment === filter);
  }, [reviews, filter]);

  return (
    <Layout>
      <DocumentTitle parts={["Customer Sentiment", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faHeart} className="text-rose-500" />
              Customer Sentiment
            </h1>
            <p className="text-sm text-neutral-500">
              AI-powered review analysis — sentiment, themes, NPS, actionable insights
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Analyze reviews'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading sentiment data…</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faComment} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No customer reviews yet</p>
            <p className="text-sm mt-1">Reviews collected from kiosk, tableside, SMS/email receipts, and delivery platforms will appear here.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard icon={faComment} label="Total reviews" value={stats.total} color="text-blue-600" />
              <SummaryCard icon={faStar} label="Avg rating" value={`${stats.avgRating.toFixed(1)} / 5`} color="text-amber-500" />
              <SummaryCard
                icon={summary && summary.nps_score >= 0 ? faArrowTrendUp : faArrowTrendDown}
                label="NPS score"
                value={summary ? `${summary.nps_score > 0 ? '+' : ''}${summary.nps_score}` : '—'}
                color={summary && summary.nps_score >= 0 ? 'text-emerald-600' : 'text-rose-600'}
              />
              <SummaryCard icon={faFaceSmile} label="% Positive" value={`${stats.positivePct.toFixed(0)}%`} color="text-emerald-600" />
              <SummaryCard icon={faLightbulb} label="High action" value={stats.highAction} color="text-amber-600" />
            </div>

            {/* Sentiment breakdown bar */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3">Sentiment breakdown</h3>
              <div className="flex h-8 rounded-lg overflow-hidden">
                {stats.positive > 0 && (
                  <div
                    className="bg-emerald-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(stats.positive / Math.max(stats.total, 1)) * 100}%` }}
                    title={`${stats.positive} positive`}
                  >
                    {stats.positive > 0 && `${stats.positive}`}
                  </div>
                )}
                {stats.neutral > 0 && (
                  <div
                    className="bg-neutral-400 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(stats.neutral / Math.max(stats.total, 1)) * 100}%` }}
                    title={`${stats.neutral} neutral`}
                  >
                    {stats.neutral > 0 && `${stats.neutral}`}
                  </div>
                )}
                {stats.mixed > 0 && (
                  <div
                    className="bg-amber-400 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(stats.mixed / Math.max(stats.total, 1)) * 100}%` }}
                    title={`${stats.mixed} mixed`}
                  >
                    {stats.mixed > 0 && `${stats.mixed}`}
                  </div>
                )}
                {stats.negative > 0 && (
                  <div
                    className="bg-rose-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(stats.negative / Math.max(stats.total, 1)) * 100}%` }}
                    title={`${stats.negative} negative`}
                  >
                    {stats.negative > 0 && `${stats.negative}`}
                  </div>
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                <span><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500 mr-1 align-middle" />Positive</span>
                <span><span className="inline-block w-3 h-3 rounded-sm bg-neutral-400 mr-1 align-middle" />Neutral</span>
                <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-400 mr-1 align-middle" />Mixed</span>
                <span><span className="inline-block w-3 h-3 rounded-sm bg-rose-500 mr-1 align-middle" />Negative</span>
              </div>
            </div>

            {/* Top themes + mentioned dishes */}
            {summary && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white rounded-lg border border-neutral-200 p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <FontAwesomeIcon icon={faArrowTrendUp} className="text-emerald-600" />
                    Top positive themes
                  </h3>
                  {summary.top_positive_themes.length === 0 ? (
                    <p className="text-sm text-neutral-400">No positive themes detected yet</p>
                  ) : (
                    <ul className="space-y-1">
                      {summary.top_positive_themes.map(theme => (
                        <li key={theme} className="flex items-center justify-between text-sm">
                          <span className="capitalize">{theme.replace(/_/g, ' ')}</span>
                          <span className="text-emerald-600 font-medium">↑</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="bg-white rounded-lg border border-neutral-200 p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <FontAwesomeIcon icon={faArrowTrendDown} className="text-rose-600" />
                    Top negative themes
                  </h3>
                  {summary.top_negative_themes.length === 0 ? (
                    <p className="text-sm text-neutral-400">No negative themes detected</p>
                  ) : (
                    <ul className="space-y-1">
                      {summary.top_negative_themes.map(theme => (
                        <li key={theme} className="flex items-center justify-between text-sm">
                          <span className="capitalize">{theme.replace(/_/g, ' ')}</span>
                          <span className="text-rose-600 font-medium">↓</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {summary && summary.top_mentioned_dishes.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faUtensils} className="text-violet-600" />
                  Most-mentioned dishes
                </h3>
                <div className="flex flex-wrap gap-2">
                  {summary.top_mentioned_dishes.map(dish => (
                    <span key={dish} className="bg-violet-50 text-violet-700 px-3 py-1 rounded-full text-sm">
                      {dish}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Filter chips */}
            <div className="flex gap-2 flex-wrap">
              {(['all', 'positive', 'neutral', 'negative', 'mixed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors capitalize ${
                    filter === f
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  {f === 'all' ? `All (${reviews.length})` : `${f} (${reviews.filter(r => r.analysis?.sentiment === f).length})`}
                </button>
              ))}
            </div>

            {/* Reviews table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Review</th>
                      <th className="text-center p-3">Rating</th>
                      <th className="text-center p-3">Sentiment</th>
                      <th className="text-center p-3">Emotion</th>
                      <th className="text-left p-3">Themes</th>
                      <th className="text-center p-3">Action</th>
                      <th className="text-left p-3">AI suggested response</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReviews.length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-neutral-400">No reviews match this filter.</td></tr>
                    ) : (
                      filteredReviews.map(({ review, analysis }) => {
                        const style = analysis ? SENTIMENT_STYLE[analysis.sentiment] : SENTIMENT_STYLE.neutral;
                        return (
                          <tr key={review.id} className="border-t hover:bg-neutral-50 align-top">
                            <td className="p-3 max-w-xs">
                              <div className="font-medium truncate">{review.customer_name ?? 'Anonymous'}</div>
                              <div className="text-xs text-neutral-500 mt-1">{review.comment ?? '(no comment)'}</div>
                              <div className="text-xs text-neutral-400 mt-1">
                                {review.source} · {review.submitted_at ? new Date(review.submitted_at as any).toLocaleDateString() : ''}
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <span className="text-amber-500 text-base tracking-tight">{RATING_STARS(review.rating)}</span>
                            </td>
                            <td className="p-3 text-center">
                              {analysis ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                                  <FontAwesomeIcon icon={style.icon} />
                                  {style.label}
                                </span>
                              ) : (
                                <span className="text-xs text-neutral-400">Not analyzed</span>
                              )}
                            </td>
                            <td className="p-3 text-center text-xs capitalize text-neutral-600">
                              {analysis?.emotion ?? '—'}
                            </td>
                            <td className="p-3">
                              {analysis && analysis.themes.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {analysis.themes.slice(0, 3).map(theme => (
                                    <span key={theme} className="bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded text-xs capitalize">
                                      {theme.replace(/_/g, ' ')}
                                    </span>
                                  ))}
                                  {analysis.themes.length > 3 && (
                                    <span className="text-xs text-neutral-400">+{analysis.themes.length - 3}</span>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="p-3 text-center">
                              {analysis && (
                                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                  analysis.actionability === 'high' ? 'bg-rose-100 text-rose-700'
                                  : analysis.actionability === 'medium' ? 'bg-amber-100 text-amber-700'
                                  : 'bg-neutral-100 text-neutral-500'
                                }`}>
                                  {analysis.actionability}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-xs text-neutral-600 max-w-xs italic">
                              {analysis?.suggested_response ? `"${analysis.suggested_response}"` : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Collection: <strong>{config.collectionEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>AI analysis: <strong>{config.aiEnabled ? 'enabled' : 'keyword fallback'}</strong></span>
              <span>Auto-respond threshold: <strong>≤ {config.autoRespondThreshold} stars</strong></span>
              <span>Reminder delay: <strong>{config.reminderDelayHours}h post-order</strong></span>
              {summary && (
                <span>
                  Period: <strong>{new Date(summary.period_start as any).toLocaleDateString()} → {new Date(summary.period_end as any).toLocaleDateString()}</strong>
                </span>
              )}
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

export default SentimentReportScreen;
