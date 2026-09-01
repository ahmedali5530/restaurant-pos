/**
 * AI Local SEO Optimizer — Google Business Profile + local search dashboard.
 *
 * 69th POSR-exclusive differentiator — 46% of Google searches are local.
 * Local Pack restaurants get 4x more calls (Moz).
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
  faMagnifyingGlassLocation, faRotate, faLightbulb, faCheckCircle,
  faStar, faCamera, faLink, faTags, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runLocalSeoEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readLocalSeoConfig, DEFAULT_LOCAL_SEO_CONFIG,
  type LocalSeo,
} from "@/lib/local-seo.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  profile_incomplete:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation,        label: 'PROFILE' },
  review_velocity:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faStar,                       label: 'REVIEWS' },
  photo_stale:          { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faCamera,                     label: 'PHOTOS' },
  citation_inconsistent:{ bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faLink,                       label: 'CITATIONS' },
  keyword_optimize:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTags,                       label: 'KEYWORDS' },
};

const scoreColor = (s: number): string => {
  if (s >= 80) return 'text-emerald-600';
  if (s >= 60) return 'text-yellow-600';
  if (s >= 40) return 'text-amber-600';
  return 'text-rose-600';
};

const scoreBarColor = (s: number): string => {
  if (s >= 80) return 'bg-emerald-500';
  if (s >= 60) return 'bg-yellow-400';
  if (s >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
};

const parseKeywords = (json?: string): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export function LocalSeoScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<LocalSeo[]>([]);
  const [summary, setSummary] = useState({ alertCount: 0, criticalCount: 0, avgSeoScore: 0, totalEstImpact: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_LOCAL_SEO_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readLocalSeoConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[local-seo-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runLocalSeoEngine(db, config);
      toast.success(result.alerts.length > 0
        ? `Generated ${result.alerts.length} SEO recommendations — est +${result.alerts.reduce((s, a) => s + a.est_impact, 0)}% ranking improvement`
        : `No SEO issues — profile fully optimized!`);
      await reload();
    } catch (err) { console.error('[local-seo-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'fixed' | 'scheduled') => {
    try { await updateAlertStatus(db, alertId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedAlerts = [...alerts].sort((a, b) => b.est_impact - a.est_impact);

  return (
    <Layout>
      <DocumentTitle parts={["Local SEO", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faMagnifyingGlassLocation} className="text-blue-600" />
              AI Local SEO
            </h1>
            <p className="text-sm text-neutral-500">
              Google Business Profile + local search optimization — 4x more calls from Local Pack (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Optimize SEO'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faMagnifyingGlassLocation} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No SEO issues!</p>
            <p className="text-sm mt-1">Click "Optimize SEO" to analyze local search ranking factors.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faMagnifyingGlassLocation} />SEO alerts</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.alertCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg SEO score</div>
                <div className={`text-2xl font-bold tabular-nums ${scoreColor(summary.avgSeoScore)}`}>{summary.avgSeoScore.toFixed(0)}/100</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Est. ranking boost</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">+{summary.totalEstImpact}%</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedAlerts.map((a, idx) => {
                const style = RULE_STYLE[a.rule_id] ?? RULE_STYLE.profile_incomplete;
                const keywords = parseKeywords(a.keyword_suggestions);
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className="font-medium capitalize">{a.category.replace(/_/g, ' ')}</span>
                          {a.google_ranking && (
                            <span className={`text-xs px-2 py-0.5 rounded ${a.google_ranking <= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              Ranking: #{a.google_ranking}{a.google_ranking <= 3 ? ' (Local Pack)' : ' (Below)'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">SEO score: <strong className={scoreColor(a.seo_score)}>{a.seo_score}/100</strong></span>
                          <span className="text-neutral-500">Impact: <strong className="text-emerald-600">+{a.est_impact}%</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{a.description}</p>
                    </div>

                    <div className="p-3">
                      {/* Current state + suggested action */}
                      {a.current_state && (
                        <div className="mb-3 p-2 rounded bg-amber-50 border border-amber-100">
                          <p className="text-xs text-amber-700"><strong>Current:</strong> {a.current_state}</p>
                        </div>
                      )}
                      {a.suggested_action && (
                        <div className="mb-3 p-2 rounded bg-emerald-50 border border-emerald-100">
                          <p className="text-xs text-emerald-700"><FontAwesomeIcon icon={faLightbulb} className="mr-1" /><strong>Action:</strong> {a.suggested_action}</p>
                        </div>
                      )}

                      {/* Review stats */}
                      {(a.review_count !== undefined || a.avg_rating !== undefined) && (
                        <div className="mb-3 grid grid-cols-3 gap-3 text-center">
                          {a.review_count !== undefined && (
                            <div>
                              <div className="text-xs text-neutral-500">Reviews</div>
                              <div className="font-bold tabular-nums">{a.review_count}</div>
                            </div>
                          )}
                          {a.avg_rating !== undefined && (
                            <div>
                              <div className="text-xs text-neutral-500">Avg rating</div>
                              <div className="font-bold tabular-nums text-amber-600">{a.avg_rating.toFixed(1)}★</div>
                            </div>
                          )}
                          {a.review_velocity !== undefined && (
                            <div>
                              <div className="text-xs text-neutral-500">Reviews/wk</div>
                              <div className="font-bold tabular-nums">{a.review_velocity}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Keywords */}
                      {keywords.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-neutral-500 mb-1"><FontAwesomeIcon icon={faTags} className="mr-1" />Suggested keywords:</div>
                          <div className="flex flex-wrap gap-1">
                            {keywords.map((kw, i) => (
                              <span key={i} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">{kw}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI insight */}
                      {a.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{a.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => a.id && handleStatus(a.id, 'fixed')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Fixed
                        </button>
                        <button onClick={() => a.id && handleStatus(a.id, 'scheduled')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          Schedule
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Target reviews/wk: <strong>{config.targetReviewVelocity}</strong></span>
              <span>Photo freshness: <strong>{config.photoFreshnessDays}d</strong></span>
              <span>Target ranking: <strong>Top {config.targetRanking}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default LocalSeoScreen;
