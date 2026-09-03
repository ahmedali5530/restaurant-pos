/**
 * AI Review Response Generator — multi-platform, brand-aware responses dashboard.
 *
 * 51st POSR-exclusive differentiator — 89% of consumers read business responses.
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
  faCommentDots, faRotate, faLightbulb, faCheckCircle,
  faStar, faPaperPlane, faPencil, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runReviewResponseEngine, getActiveResponses, getSummary, updateResponseStatus,
  readReviewRespConfig, DEFAULT_REVIEW_RESP_CONFIG,
  type ReviewResponseRow,
} from "@/lib/review-response.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  positive_thank:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faStar,                 label: 'THANK' },
  neutral_address:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCommentDots,          label: 'ADDRESS' },
  negative_resolve:  { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faPencil,               label: 'RESOLVE' },
  mixed_acknowledge: { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faCommentDots,          label: 'ACKNOWLEDGE' },
  critical_escalate: { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTriangleExclamation,  label: 'ESCALATE' },
};

const PLATFORM_STYLE: Record<string, string> = {
  google:       'bg-blue-100 text-blue-700',
  yelp:         'bg-rose-100 text-rose-700',
  tripadvisor:  'bg-green-100 text-green-700',
  internal:     'bg-neutral-100 text-neutral-700',
  doordash:     'bg-rose-100 text-rose-700',
  ubereats:     'bg-neutral-100 text-neutral-700',
  grubhub:      'bg-orange-100 text-orange-700',
};

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-700',
  neutral:  'bg-amber-100 text-amber-700',
  negative: 'bg-rose-100 text-rose-700',
  mixed:    'bg-violet-100 text-violet-700',
};

const renderStars = (rating: number): string => '★'.repeat(rating) + '☆'.repeat(5 - rating);

export function ReviewResponseScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [responses, setResponses] = useState<ReviewResponseRow[]>([]);
  const [summary, setSummary] = useState({ pendingCount: 0, criticalCount: 0, avgImpactScore: 0, responseRate: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_REVIEW_RESP_CONFIG);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readReviewRespConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveResponses(db), getSummary(db)]);
      setResponses(list); setSummary(sum);
    } catch (err) { console.error('[review-response-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runReviewResponseEngine(db, config);
      toast.success(result.responses.length > 0
        ? `Generated ${result.responses.length} review responses — ${result.responses.filter(r => r.severity === 'critical').length} critical, ${result.responses.filter(r => r.rule_id === 'positive_thank').length} positive`
        : `No unresponded reviews found`);
      await reload();
    } catch (err) { console.error('[review-response-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (responseId: string, status: 'sent' | 'edited' | 'declined') => {
    try { await updateResponseStatus(db, responseId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: critical first, then by rating asc (lowest first)
  const sortedResponses = [...responses].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sev[a.severity] !== sev[b.severity]) return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
    return a.rating - b.rating;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Review Response", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCommentDots} className="text-violet-600" />
              AI Review Response Generator
            </h1>
            <p className="text-sm text-neutral-500">
              Generates brand-aware responses to reviews across all platforms (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Generating…' : 'Generate responses'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : responses.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCommentDots} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No pending reviews!</p>
            <p className="text-sm mt-1">All caught up. Click "Generate responses" to scan for new unresponded reviews.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faCommentDots} />Pending</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.pendingCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg impact</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.avgImpactScore.toFixed(0)}/100</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Response rate</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.responseRate.toFixed(0)}%</div>
              </div>
            </div>

            {/* Review queue */}
            <div className="space-y-3">
              {sortedResponses.map((r, idx) => {
                const style = RULE_STYLE[r.rule_id] ?? RULE_STYLE.neutral_address;
                const isExpanded = expandedId === r.id;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    {/* Review header */}
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className="text-amber-500 text-lg">{renderStars(r.rating)}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${PLATFORM_STYLE[r.platform] ?? PLATFORM_STYLE.internal}`}>
                            {r.platform}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded capitalize ${SENTIMENT_STYLE[r.sentiment] ?? SENTIMENT_STYLE.neutral}`}>
                            {r.sentiment}
                          </span>
                          <span className="text-sm font-medium">{r.customer_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-500">Impact: <strong className="text-violet-600">{r.est_impact_score}/100</strong></span>
                          {r.ai_recommendation && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{r.ai_recommendation.replace(/_/g, ' ')}</span>
                          )}
                        </div>
                      </div>
                      {r.themes && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.themes.split(',').filter(Boolean).map((theme, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-600">{theme.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      )}
                      {r.review_text && (
                        <p className="mt-2 text-sm text-neutral-700 italic bg-neutral-50 p-2 rounded border border-neutral-100">
                          "{r.review_text}"
                        </p>
                      )}
                    </div>

                    {/* Generated response */}
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-violet-600 flex items-center gap-1">
                          <FontAwesomeIcon icon={faLightbulb} /> AI Generated Response ({r.brand_voice} · {r.response_strategy})
                        </h3>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : r.id ?? null)}
                          className="text-xs text-violet-600 hover:underline"
                        >
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                      </div>
                      <div className={`text-sm text-neutral-700 bg-violet-50/50 p-3 rounded border border-violet-100 ${isExpanded ? '' : 'line-clamp-3'}`}>
                        {r.generated_response}
                      </div>
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <button onClick={() => r.id && handleStatus(r.id, 'sent')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faPaperPlane} className="mr-1" />Send as-is
                        </button>
                        <button onClick={() => r.id && handleStatus(r.id, 'edited')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          <FontAwesomeIcon icon={faPencil} className="mr-1" />Edit then send
                        </button>
                        <button onClick={() => r.id && handleStatus(r.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Skip
                        </button>
                      </div>
                    </div>

                    {/* AI insight */}
                    {r.ai_insight && (
                      <div className="px-3 pb-3">
                        <p className="text-xs text-violet-700 italic bg-violet-50/70 p-2 rounded border border-violet-200">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{r.ai_insight}
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
              <span>Brand voice: <strong className="capitalize">{config.brandVoice}</strong></span>
              <span>Language: <strong>{config.language}</strong></span>
              <span>Max chars: <strong>{config.maxResponseChars}</strong></span>
              <span>Auto-send 5★: <strong>{config.autoSendPositive ? 'yes' : 'no'}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default ReviewResponseScreen;
