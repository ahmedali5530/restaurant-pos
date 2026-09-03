/**
 * AI Server Skill Matrix & Coaching Path — multi-dimensional coaching dashboard.
 *
 * 45th POSR-exclusive differentiator — 73% of servers want more coaching but
 * managers lack time (NRA workforce research).
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
  faUserGraduate, faRotate, faLightbulb, faCheckCircle,
  faArrowTrendUp, faArrowTrendDown, faAward, faHandshake,
} from "@fortawesome/free-solid-svg-icons";
import {
  runServerCoachEngine, getActivePlans, getSummary, updatePlanStatus,
  readServerCoachConfig, DEFAULT_SERVER_COACH_CONFIG,
  type ServerCoachingPlan,
} from "@/lib/server-coach.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  skill_gap:           { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowTrendDown, label: 'SKILL GAP' },
  top_strength:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faAward,         label: 'TOP STRENGTH' },
  mentor_match:        { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faHandshake,     label: 'MENTOR MATCH' },
  trajectory_warning:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown, label: 'TRAJECTORY' },
  coaching_impact:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCheckCircle,   label: 'IMPACT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const TRAJECTORY_STYLE: Record<string, { color: string; icon: any }> = {
  improving: { color: 'text-emerald-600', icon: faArrowTrendUp },
  declining:  { color: 'text-rose-600',   icon: faArrowTrendDown },
  stable:     { color: 'text-neutral-500', icon: faArrowTrendUp },
  new:        { color: 'text-violet-600', icon: faUserGraduate },
};

// Bar color by score (0-100)
const scoreColor = (s: number): string => {
  if (s >= 85) return 'bg-emerald-500';
  if (s >= 70) return 'bg-emerald-400';
  if (s >= 50) return 'bg-yellow-400';
  if (s >= 30) return 'bg-amber-500';
  return 'bg-rose-500';
};

// Try to parse JSON actions safely
const parseActions = (json?: string): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export function ServerCoachScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [plans, setPlans] = useState<ServerCoachingPlan[]>([]);
  const [summary, setSummary] = useState({ gapCount: 0, topPerformerCount: 0, decliningCount: 0, mentorAvailableCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SERVER_COACH_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readServerCoachConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActivePlans(db), getSummary(db)]);
      setPlans(list); setSummary(sum);
    } catch (err) { console.error('[server-coach-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runServerCoachEngine(db, config);
      toast.success(result.plans.length > 0
        ? `Generated ${result.plans.length} coaching plans — ${result.plans.filter(p => p.rule_id === 'skill_gap').length} skill gaps, ${result.plans.filter(p => p.rule_id === 'mentor_match').length} mentor matches`
        : `No coaching plans — need ≥3 orders per server`);
      await reload();
    } catch (err) { console.error('[server-coach-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (planId: string, status: 'coaching_applied' | 'declined') => {
    try { await updatePlanStatus(db, planId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: skill_gap critical → trajectory → mentor_match → top_strength
  const ruleOrder: Record<string, number> = { skill_gap: 0, trajectory_warning: 1, mentor_match: 2, top_strength: 3, coaching_impact: 4 };
  const sortedPlans = [...plans].sort((a, b) => {
    const ao = ruleOrder[a.rule_id] ?? 99;
    const bo = ruleOrder[b.rule_id] ?? 99;
    if (ao !== bo) return ao - bo;
    return a.overall_score - b.overall_score;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Server Coach", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUserGraduate} className="text-violet-600" />
              AI Server Skill Matrix
            </h1>
            <p className="text-sm text-neutral-500">
              Multi-dimensional coaching — skill matrix per server, mentor matching, trajectory prediction (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Run analysis'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : plans.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUserGraduate} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No coaching plans yet!</p>
            <p className="text-sm mt-1">Click "Run analysis" to generate skill matrices and coaching recommendations.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowTrendDown} />Skill gaps</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.gapCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowTrendDown} />Declining</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.decliningCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faHandshake} />Mentors available</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.mentorAvailableCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faAward} />Top performers</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.topPerformerCount}</div>
              </div>
            </div>

            {/* Coaching plans table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faUserGraduate} className="text-violet-600" />
                  Coaching Plans (sorted by urgency)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Server</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-center">Skill Matrix (5 dimensions)</th>
                      <th className="p-3 text-right">Overall</th>
                      <th className="p-3 text-center">Trajectory</th>
                      <th className="p-3 text-left">Coaching Actions</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlans.map((p, idx) => {
                      const style = RULE_STYLE[p.rule_id] ?? RULE_STYLE.skill_gap;
                      const traj = TRAJECTORY_STYLE[p.trajectory ?? 'stable'] ?? TRAJECTORY_STYLE.stable;
                      const actions = parseActions(p.development_actions);
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[p.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">{p.server_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{p.description}</p>
                            {p.suggested_mentor && (
                              <p className="text-xs text-violet-600 mt-0.5">→ Mentor: {p.suggested_mentor}</p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="space-y-1 min-w-32">
                              {[
                                { name: 'upsell', score: p.upsell_score },
                                { name: 'accuracy', score: p.accuracy_score },
                                { name: 'speed', score: p.speed_score },
                                { name: 'tip', score: p.tip_score },
                                { name: 'satisfaction', score: p.satisfaction_score },
                              ].map((d, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="text-xs w-20 text-neutral-500">{d.name}</span>
                                  <div className="flex-1 h-2 bg-neutral-100 rounded overflow-hidden">
                                    <div className={`h-2 ${scoreColor(d.score)}`} style={{ width: `${d.score}%` }}></div>
                                  </div>
                                  <span className="text-xs tabular-nums w-8 text-right">{d.score}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-2xl font-bold tabular-nums">{p.overall_score}</span>
                              <div className="w-16 h-1.5 bg-neutral-100 rounded">
                                <div className={`h-1.5 rounded ${scoreColor(p.overall_score)}`} style={{ width: `${p.overall_score}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-semibold ${traj.color} capitalize flex items-center gap-1 justify-center`}>
                              <FontAwesomeIcon icon={traj.icon} />{p.trajectory ?? '—'}
                            </span>
                          </td>
                          <td className="p-3">
                            {actions.length > 0 ? (
                              <ul className="text-xs space-y-0.5 list-disc list-inside">
                                {actions.map((a, i) => <li key={i} className="text-neutral-600">{a}</li>)}
                              </ul>
                            ) : <span className="text-xs text-neutral-400">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              {p.rule_id === 'skill_gap' && (
                                <button onClick={() => p.id && handleStatus(p.id, 'coaching_applied')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap">
                                  <FontAwesomeIcon icon={faCheckCircle} /> Apply
                                </button>
                              )}
                              <button onClick={() => p.id && handleStatus(p.id, 'declined')} className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                                Skip
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI insights */}
            {plans.filter(p => p.ai_insight).slice(0, 5).map((p, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{p.server_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[p.rule_id].bg} ${RULE_STYLE[p.rule_id].text}`}>{p.rule_id.replace(/_/g, ' ')}</span>
                  {p.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{p.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{p.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Gap threshold: <strong>{config.gapThreshold}</strong></span>
              <span>Top threshold: <strong>{config.topThreshold}</strong></span>
              <span>Trajectory window: <strong>{config.trajectoryWindow}d</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default ServerCoachScreen;
