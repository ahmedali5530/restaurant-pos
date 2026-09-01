/**
 * AI Social Media Content Generator — platform-specific post generation dashboard.
 *
 * 52nd POSR-exclusive differentiator — restaurants spend $200-$500/mo on
 * social media management (Hootsuite, Buffer, Sprout Social).
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
  faShareNodes, faRotate, faLightbulb, faCheckCircle,
  faImage, faCalendarClock, faChartLine, faHashtag,
} from "@fortawesome/free-solid-svg-icons";
import {
  runSocialEngine, getActivePosts, getSummary, updatePostStatus,
  readSocialConfig, DEFAULT_SOCIAL_CONFIG,
  type SocialPost,
} from "@/lib/social-content.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  menu_highlight:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faImage,         label: 'MENU HIGHLIGHT' },
  review_showcase:   { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faStar,          label: 'REVIEW SHOWCASE' },
  event_promotion:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCalendarClock, label: 'EVENT PROMO' },
  behind_scenes:     { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faImage,         label: 'BEHIND SCENES' },
  engagement_poll:   { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faHashtag,       label: 'ENGAGEMENT POLL' },
};

// Need faStar - check if available
import { faStar } from "@fortawesome/free-solid-svg-icons";

const PLATFORM_STYLE: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  instagram: { bg: 'bg-pink-100',   text: 'text-pink-700',   icon: '📷', label: 'Instagram' },
  facebook:  { bg: 'bg-blue-100',   text: 'text-blue-700',   icon: '👍', label: 'Facebook' },
  twitter:   { bg: 'bg-sky-100',    text: 'text-sky-700',    icon: '🐦', label: 'Twitter/X' },
  tiktok:    { bg: 'bg-neutral-100', text: 'text-neutral-800', icon: '🎵', label: 'TikTok' },
  linkedin:  { bg: 'bg-blue-200',   text: 'text-blue-800',   icon: '💼', label: 'LinkedIn' },
};

const CONTENT_TYPE_STYLE: Record<string, string> = {
  image_post: 'bg-emerald-100 text-emerald-700',
  carousel:   'bg-violet-100 text-violet-700',
  story:      'bg-amber-100 text-amber-700',
  reel:       'bg-rose-100 text-rose-700',
  text_only:  'bg-neutral-100 text-neutral-700',
};

export function SocialContentScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [summary, setSummary] = useState({ pendingCount: 0, totalEstReach: 0, avgEngagementRate: 0, platformCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SOCIAL_CONFIG);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSocialConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActivePosts(db), getSummary(db)]);
      setPosts(list); setSummary(sum);
    } catch (err) { console.error('[social-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runSocialEngine(db, config);
      toast.success(result.posts.length > 0
        ? `Generated ${result.posts.length} social posts across ${new Set(result.posts.map(p => p.platform)).size} platforms`
        : `No posts generated — need order history or reviews`);
      await reload();
    } catch (err) { console.error('[social-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (postId: string, status: 'scheduled' | 'posted' | 'declined') => {
    try { await updatePostStatus(db, postId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: high severity first, then by est_reach desc
  const sortedPosts = [...posts].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sev[a.severity] !== sev[b.severity]) return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
    return b.est_reach - a.est_reach;
  });

  const formatPostTime = (date?: Date | string): string => {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <Layout>
      <DocumentTitle parts={["Social Content", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faShareNodes} className="text-violet-600" />
              AI Social Content Generator
            </h1>
            <p className="text-sm text-neutral-500">
              Auto-generates platform-specific social posts from restaurant data (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Generating…' : 'Generate posts'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faShareNodes} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No social posts yet!</p>
            <p className="text-sm mt-1">Click "Generate posts" to auto-create platform-specific content.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faShareNodes} />Pending posts</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.pendingCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faChartLine} />Est. total reach</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.totalEstReach.toLocaleString()}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg engagement</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{(summary.avgEngagementRate * 100).toFixed(1)}%</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Platforms</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.platformCount}</div>
              </div>
            </div>

            {/* Posts list */}
            <div className="space-y-3">
              {sortedPosts.map((p, idx) => {
                const style = RULE_STYLE[p.rule_id] ?? RULE_STYLE.menu_highlight;
                const platformStyle = PLATFORM_STYLE[p.platform] ?? PLATFORM_STYLE.instagram;
                const isExpanded = expandedId === p.id;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    {/* Post header */}
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${platformStyle.bg} ${platformStyle.text}`}>
                            {platformStyle.icon} {platformStyle.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded capitalize ${CONTENT_TYPE_STYLE[p.content_type] ?? CONTENT_TYPE_STYLE.text_only}`}>
                            {p.content_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Reach: <strong className="text-emerald-600">{p.est_reach.toLocaleString()}</strong></span>
                          <span className="text-neutral-500">Eng: <strong className="text-violet-600">{(p.est_engagement_rate * 100).toFixed(1)}%</strong></span>
                          <span className="text-neutral-500"><FontAwesomeIcon icon={faCalendarClock} /> {formatPostTime(p.best_post_time)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{p.description}</p>
                    </div>

                    {/* Caption preview */}
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-violet-600 flex items-center gap-1">
                          <FontAwesomeIcon icon={faLightbulb} /> Generated Caption
                        </h3>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : p.id ?? null)}
                          className="text-xs text-violet-600 hover:underline"
                        >
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                      </div>
                      <div className={`text-sm text-neutral-700 bg-violet-50/50 p-3 rounded border border-violet-100 whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-3'}`}>
                        {p.caption}
                      </div>

                      {/* Hashtags */}
                      {p.hashtags && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.hashtags.split(/\s+/).filter(Boolean).map((tag, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">{tag}</span>
                          ))}
                        </div>
                      )}

                      {/* Image prompt */}
                      {p.suggested_image_prompt && (
                        <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-100">
                          <p className="text-xs text-amber-700"><FontAwesomeIcon icon={faImage} className="mr-1" /><strong>Image prompt:</strong> {p.suggested_image_prompt}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <button onClick={() => p.id && handleStatus(p.id, 'posted')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Posted
                        </button>
                        <button onClick={() => p.id && handleStatus(p.id, 'scheduled')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          <FontAwesomeIcon icon={faCalendarClock} className="mr-1" />Schedule
                        </button>
                        <button onClick={() => p.id && handleStatus(p.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          Skip
                        </button>
                      </div>
                    </div>

                    {/* AI insight */}
                    {p.ai_insight && (
                      <div className="px-3 pb-3">
                        <p className="text-xs text-violet-700 italic bg-violet-50/70 p-2 rounded border border-violet-200">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{p.ai_insight}
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
              <span>Max hashtags: <strong>{config.hashtagCount}</strong></span>
              <span>Max caption: <strong>{config.maxCaptionChars} chars</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default SocialContentScreen;
