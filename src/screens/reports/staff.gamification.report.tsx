/**
 * AI Staff Performance Gamification Engine — leaderboards, badges, challenges.
 *
 * 61st POSR-exclusive differentiator — gamification increases engagement 48%
 * and productivity 22% (Gallup, HBR).
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
  faTrophy, faRotate, faLightbulb, faCheckCircle,
  faMedal, faUsers, faGift, faTriangleExclamation, faStar, faCrown,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runGamificationEngine, getActiveGamifications, getSummary, updateGamificationStatus,
  readGamificationConfig, DEFAULT_GAMIFICATION_CONFIG,
  type StaffGamification,
} from "@/lib/staff-gamification.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  leaderboard_rank:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTrophy,             label: 'LEADERBOARD' },
  achievement_badge:  { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faMedal,              label: 'BADGE' },
  team_challenge:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faUsers,              label: 'TEAM CHALLENGE' },
  reward_unlocked:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faGift,               label: 'REWARD' },
  engagement_alert:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTriangleExclamation, label: 'ENGAGEMENT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const RANK_STYLE: Record<number, { color: string; icon: any }> = {
  1: { color: 'text-amber-500', icon: faCrown },
  2: { color: 'text-neutral-400', icon: faMedal },
  3: { color: 'text-orange-600', icon: faMedal },
};

const METRIC_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  orders: 'Orders',
  avg_ticket: 'Avg Ticket',
  upsell_rate: 'Upsell Rate',
  accuracy: 'Accuracy',
  satisfaction: 'Satisfaction',
  tips: 'Tip %',
};

export function StaffGamificationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [gamifications, setGamifications] = useState<StaffGamification[]>([]);
  const [summary, setSummary] = useState({ totalEntries: 0, badgeCount: 0, challengeCount: 0, avgEngagementBoost: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_GAMIFICATION_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readGamificationConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveGamifications(db), getSummary(db)]);
      setGamifications(list); setSummary(sum);
    } catch (err) { console.error('[gamification-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runGamificationEngine(db, config);
      toast.success(result.gamifications.length > 0
        ? `Generated ${result.gamifications.length} gamification entries — ${result.gamifications.filter(g => g.rule_id === 'achievement_badge').length} badges, ${result.gamifications.filter(g => g.rule_id === 'team_challenge').length} challenges`
        : `No gamification data — need staff with 3+ orders`);
      await reload();
    } catch (err) { console.error('[gamification-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (gamifId: string, status: 'announced' | 'rewarded') => {
    try { await updateGamificationStatus(db, gamifId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: leaderboard first, then badges, then challenges, then rewards
  const ruleOrder: Record<string, number> = { leaderboard_rank: 0, achievement_badge: 1, team_challenge: 2, reward_unlocked: 3, engagement_alert: 4 };
  const sortedG = [...gamifications].sort((a, b) => {
    const ao = ruleOrder[a.rule_id] ?? 99;
    const bo = ruleOrder[b.rule_id] ?? 99;
    if (ao !== bo) return ao - bo;
    return b.est_engagement_boost - a.est_engagement_boost;
  });

  const formatMetricValue = (type: string, value: number): string => {
    if (type === 'revenue') return withCurrency(value);
    if (type === 'tips') return `${value.toFixed(1)}%`;
    if (type === 'accuracy') return `${value.toFixed(0)}%`;
    return value.toFixed(0);
  };

  return (
    <Layout>
      <DocumentTitle parts={["Staff Gamification", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTrophy} className="text-amber-600" />
              AI Staff Gamification
            </h1>
            <p className="text-sm text-neutral-500">
              Leaderboards, badges, challenges — boosts engagement 48%, reduces turnover 20-30% (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Calculating…' : 'Generate game'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : gamifications.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTrophy} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No gamification data yet!</p>
            <p className="text-sm mt-1">Click "Generate game" to create leaderboards, badges, and challenges.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTrophy} />Entries</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.totalEntries}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center ring-2 ring-violet-200">
                <div className="text-xs text-violet-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faMedal} />Badges</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.badgeCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faUsers} />Team challenges</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.challengeCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Avg engagement</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">+{(summary.avgEngagementBoost * 100).toFixed(0)}%</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedG.map((g, idx) => {
                const style = RULE_STYLE[g.rule_id] ?? RULE_STYLE.leaderboard_rank;
                const rankStyle = g.rank ? RANK_STYLE[g.rank] : null;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[g.severity] ?? SEVERITY_DOT.low}`}></span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          {rankStyle && g.rank && (
                            <span className={`flex items-center gap-1 font-bold ${rankStyle.color}`}>
                              <FontAwesomeIcon icon={rankStyle.icon} />#{g.rank}
                              {g.total_staff && <span className="text-xs text-neutral-400">/{g.total_staff}</span>}
                            </span>
                          )}
                          {g.staff_name && <span className="font-medium">{g.staff_name}</span>}
                          {g.badge_name && (
                            <span className="text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700 capitalize">
                              <FontAwesomeIcon icon={faStar} className="mr-1" />{g.badge_name.replace(/_/g, ' ')}
                            </span>
                          )}
                          {g.challenge_name && (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">{g.challenge_name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">{METRIC_LABELS[g.metric_type] ?? g.metric_type}: <strong className="text-amber-600">{formatMetricValue(g.metric_type, g.metric_value)}</strong></span>
                          <span className="text-neutral-500">Boost: <strong className="text-rose-600">+{(g.est_engagement_boost * 100).toFixed(0)}%</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{g.description}</p>
                    </div>

                    <div className="p-3">
                      {/* Badge description */}
                      {g.badge_description && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-100">
                          <p className="text-xs text-violet-700"><FontAwesomeIcon icon={faMedal} className="mr-1" /><strong>Badge:</strong> {g.badge_description}</p>
                        </div>
                      )}

                      {/* Challenge progress */}
                      {g.challenge_name && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-neutral-500">Progress: {formatMetricValue(g.metric_type, g.metric_value)} / {formatMetricValue(g.metric_type, g.challenge_target)}</span>
                            <span className="font-bold text-emerald-600">{g.challenge_progress.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-neutral-100 rounded">
                            <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, g.challenge_progress)}%` }}></div>
                          </div>
                        </div>
                      )}

                      {/* Reward */}
                      {g.reward_type && (
                        <div className="mb-3 p-2 rounded bg-rose-50 border border-rose-100">
                          <p className="text-xs text-rose-700"><FontAwesomeIcon icon={faGift} className="mr-1" /><strong>Reward:</strong> {g.reward_type.replace(/_/g, ' ')} {g.reward_value ? `(${withCurrency(g.reward_value)})` : ''}</p>
                        </div>
                      )}

                      {/* AI insight */}
                      {g.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{g.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => g.id && handleStatus(g.id, 'announced')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Announce
                        </button>
                        {g.reward_type && (
                          <button onClick={() => g.id && handleStatus(g.id, 'rewarded')} className="text-xs px-3 py-1.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 font-medium">
                            <FontAwesomeIcon icon={faGift} className="mr-1" />Reward
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Leaderboard size: <strong>Top {config.leaderboardSize}</strong></span>
              <span>Reward budget: <strong>{withCurrency(config.rewardBudget)}/mo</strong></span>
              <span>Min staff for challenges: <strong>{config.minStaffForChallenge}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default StaffGamificationScreen;
