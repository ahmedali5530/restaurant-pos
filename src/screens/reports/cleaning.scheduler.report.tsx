/**
 * AI Predictive Cleaning Schedule — traffic-based cleaning dashboard.
 *
 * 65th POSR-exclusive differentiator — restaurants fail 30% of health
 * inspections due to cleaning lapses (FDA).
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
  faBroom, faRotate, faLightbulb, faCheckCircle,
  faUsers, faClock, faTriangleExclamation, faUsersGear, faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import {
  runCleaningEngine, getActiveSchedules, getSummary, updateScheduleStatus,
  readCleaningConfig, DEFAULT_CLEANING_CONFIG,
  type CleaningSchedule,
} from "@/lib/cleaning-scheduler.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  traffic_triggered:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUsers,              label: 'TRAFFIC' },
  time_based:          { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faClock,              label: 'TIME' },
  inspection_prep:     { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faShieldHalved,       label: 'INSPECTION' },
  deep_clean_due:      { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faBroom,              label: 'DEEP CLEAN' },
  compliance_overdue:  { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'OVERDUE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const ZONE_ICON: Record<string, string> = {
  dining: '🍽️', kitchen: '🍳', bathroom: '🚻', bar: '🍸', storage: '📦', exterior: '🌆',
};

const urgencyColor = (score: number): string => {
  if (score >= 80) return 'text-rose-600';
  if (score >= 60) return 'text-amber-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-emerald-600';
};

const urgencyBarColor = (score: number): string => {
  if (score >= 80) return 'bg-rose-500';
  if (score >= 60) return 'bg-amber-500';
  if (score >= 40) return 'bg-yellow-400';
  return 'bg-emerald-500';
};

const formatTime = (date?: Date | string): string => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

export function CleaningSchedulerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [schedules, setSchedules] = useState<CleaningSchedule[]>([]);
  const [summary, setSummary] = useState({ overdueCount: 0, criticalCount: 0, totalTasks: 0, avgUrgency: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CLEANING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCleaningConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveSchedules(db), getSummary(db)]);
      setSchedules(list); setSummary(sum);
    } catch (err) { console.error('[cleaning-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runCleaningEngine(db, config);
      toast.success(result.schedules.length > 0
        ? `Generated ${result.schedules.length} cleaning tasks — ${result.schedules.filter(s => s.severity === 'critical').length} critical, ${result.schedules.filter(s => s.rule_id === 'compliance_overdue').length} overdue`
        : `No cleaning tasks needed — all up to date`);
      await reload();
    } catch (err) { console.error('[cleaning-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (scheduleId: string, status: 'assigned' | 'completed') => {
    try { await updateScheduleStatus(db, scheduleId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedSchedules = [...schedules].sort((a, b) => b.urgency_score - a.urgency_score);

  return (
    <Layout>
      <DocumentTitle parts={["Cleaning Schedule", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBroom} className="text-amber-600" />
              AI Cleaning Schedule
            </h1>
            <p className="text-sm text-neutral-500">
              Predictive cleaning based on traffic — reduces labor 20-30%, improves compliance (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Scheduling…' : 'Generate schedule'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : schedules.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBroom} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">All clean!</p>
            <p className="text-sm mt-1">No cleaning tasks needed right now. Click "Generate schedule" to scan.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Overdue</div>
                <div className="text-3xl font-bold text-rose-700 tabular-nums">{summary.overdueCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faShieldHalved} />Critical (inspection)</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faBroom} />Total tasks</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.totalTasks}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Avg urgency</div>
                <div className={`text-2xl font-bold tabular-nums ${urgencyColor(summary.avgUrgency)}`}>{summary.avgUrgency.toFixed(0)}/100</div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faBroom} className="text-amber-600" />
                  Cleaning Tasks (sorted by urgency)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Task</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Last cleaned</th>
                      <th className="p-3 text-right">Traffic since</th>
                      <th className="p-3 text-right">Labor</th>
                      <th className="p-3 text-right">Inspection risk</th>
                      <th className="p-3 text-right">Urgency</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSchedules.map((s, idx) => {
                      const style = RULE_STYLE[s.rule_id] ?? RULE_STYLE.time_based;
                      const zoneIcon = ZONE_ICON[s.zone ?? 'dining'] ?? '🧹';
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[s.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="text-lg">{zoneIcon}</span>
                              <span className="font-medium">{s.task_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{s.zone} — {s.description}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="tabular-nums">{s.hours_since_cleaned.toFixed(0)}h ago</div>
                            {s.last_cleaned && <div className="text-xs text-neutral-400">{formatTime(s.last_cleaned)}</div>}
                          </td>
                          <td className="p-3 text-right tabular-nums">{s.traffic_since_cleaned}</td>
                          <td className="p-3 text-right tabular-nums">{s.est_labor_minutes}min</td>
                          <td className="p-3 text-right">
                            <span className={`text-xs font-bold tabular-nums ${s.inspection_risk >= 0.9 ? 'text-rose-600' : s.inspection_risk >= 0.7 ? 'text-amber-600' : 'text-neutral-500'}`}>
                              {Math.round(s.inspection_risk * 100)}%
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-lg font-bold tabular-nums ${urgencyColor(s.urgency_score)}`}>{s.urgency_score}</span>
                              <div className="w-16 h-1.5 bg-neutral-100 rounded">
                                <div className={`h-1.5 rounded ${urgencyBarColor(s.urgency_score)}`} style={{ width: `${s.urgency_score}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              <button onClick={() => s.id && handleStatus(s.id, 'assigned')} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 whitespace-nowrap font-medium">
                                <FontAwesomeIcon icon={faUsersGear} className="mr-1" />Assign
                              </button>
                              <button onClick={() => s.id && handleStatus(s.id, 'completed')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                                <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Done
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
            {schedules.filter(s => s.ai_insight).slice(0, 5).map((s, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{ZONE_ICON[s.zone ?? 'dining'] ?? '🧹'}</span>
                  <span className="text-xs font-bold text-violet-600">{s.task_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[s.rule_id].bg} ${RULE_STYLE[s.rule_id].text}`}>{s.rule_id.replace(/_/g, ' ')}</span>
                  {s.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{s.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{s.ai_insight}</p>
              </div>
            ))}

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Traffic threshold: <strong>{config.trafficThreshold} customers</strong></span>
              <span>Time threshold: <strong>{config.timeThreshold}h</strong></span>
              <span>Inspection window: <strong>{config.inspectionWindow}d</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default CleaningSchedulerScreen;
