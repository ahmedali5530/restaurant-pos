/**
 * AI Staff Retention Program Builder — personalized retention plans dashboard.
 *
 * 73rd POSR-exclusive differentiator — 75% annual turnover, $5,864 per lost
 * employee (Cornell CHR).
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
  faHeartCircleCheck, faRotate, faLightbulb, faCheckCircle,
  faBriefcase, faDollarSign, faAward, faClock, faUserPlus,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runRetentionEngine, getActivePrograms, getSummary, updateProgramStatus,
  readRetentionConfig, DEFAULT_RETENTION_CONFIG,
  type RetentionProgram,
} from "@/lib/retention-program.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  career_path:          { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faBriefcase,       label: 'CAREER PATH' },
  compensation_review:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faDollarSign,     label: 'COMPENSATION' },
  recognition_gap:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faAward,           label: 'RECOGNITION' },
  worklife_balance:     { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faClock,           label: 'WORK-LIFE' },
  mentorship_match:     { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faUserPlus,        label: 'MENTORSHIP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const parseActions = (json?: string): string[] => {
  if (!json) return [];
  try { const p = JSON.parse(json); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
};

const formatDate = (date?: Date | string): string => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function RetentionProgramScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [programs, setPrograms] = useState<RetentionProgram[]>([]);
  const [summary, setSummary] = useState({ programCount: 0, criticalCount: 0, totalProgramCost: 0, totalReplacementSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_RETENTION_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readRetentionConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActivePrograms(db), getSummary(db)]);
      setPrograms(list); setSummary(sum);
    } catch (err) { console.error('[retention-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runRetentionEngine(db, config);
      toast.success(result.programs.length > 0
        ? `Built ${result.programs.length} retention programs — est ${withCurrency(result.programs.reduce((s, p) => s + p.est_replacement_cost - p.est_cost, 0))} savings`
        : `No retention programs needed — all staff below risk threshold`);
      await reload();
    } catch (err) { console.error('[retention-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (programId: string, status: 'in_progress' | 'retained' | 'departed') => {
    try { await updateProgramStatus(db, programId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedPrograms = [...programs].sort((a, b) => b.turnover_risk - a.turnover_risk);

  return (
    <Layout>
      <DocumentTitle parts={["Retention Program", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faHeartCircleCheck} className="text-rose-600" />
              AI Retention Programs
            </h1>
            <p className="text-sm text-neutral-500">
              Personalized retention plans — reduces 75% turnover, saves ${summary.totalReplacementSavings > 0 ? '' : '5,864'}/employee (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Building…' : 'Build programs'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : programs.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faHeartCircleCheck} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No retention programs needed!</p>
            <p className="text-sm mt-1">All staff below risk threshold. Click "Build programs" to scan.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faHeartCircleCheck} />Programs</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.programCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-300 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold">Critical risk</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Program cost</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{withCurrency(summary.totalProgramCost)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Replacement savings</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalReplacementSavings)}</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedPrograms.map((p, idx) => {
                const style = RULE_STYLE[p.rule_id] ?? RULE_STYLE.career_path;
                const actions = parseActions(p.program_actions);
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[p.severity] ?? SEVERITY_DOT.low}`}></span>
                          <span className="font-medium">{p.staff_name}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${p.turnover_risk > 0.7 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {Math.round(p.turnover_risk * 100)}% departure risk
                          </span>
                          <span className="text-xs text-neutral-500">{p.tenure_months}mo tenure</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Retention: <strong className="text-emerald-600">{Math.round(p.est_retention_probability * 100)}%</strong></span>
                          <span className="text-neutral-500">ROI: <strong className="text-emerald-600">{p.est_roi}x</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{p.description}</p>
                    </div>

                    <div className="p-3">
                      {/* Financial grid */}
                      <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                        <div>
                          <div className="text-xs text-neutral-500">Program cost</div>
                          <div className="font-bold tabular-nums text-amber-600">{withCurrency(p.est_cost)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Replacement cost</div>
                          <div className="font-bold tabular-nums text-rose-600">{withCurrency(p.est_replacement_cost)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Net savings</div>
                          <div className="font-bold tabular-nums text-emerald-600">{withCurrency(p.est_replacement_cost - p.est_cost)}</div>
                        </div>
                      </div>

                      {/* Actions */}
                      {actions.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-neutral-500 mb-1"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />Program actions:</div>
                          <ul className="text-xs space-y-0.5 list-disc list-inside">
                            {actions.map((a, i) => <li key={i} className="text-neutral-700">{a}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Mentor + review date */}
                      <div className="flex flex-wrap gap-3 mb-3 text-xs">
                        {p.mentor_assigned && (
                          <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">
                            <FontAwesomeIcon icon={faUserPlus} className="mr-1" />Mentor: {p.mentor_assigned}
                          </span>
                        )}
                        {p.review_date && (
                          <span className="px-2 py-1 rounded bg-amber-100 text-amber-700">
                            <FontAwesomeIcon icon={faClock} className="mr-1" />Review: {formatDate(p.review_date)}
                          </span>
                        )}
                      </div>

                      {/* AI insight */}
                      {p.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{p.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => p.id && handleStatus(p.id, 'in_progress')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Start
                        </button>
                        <button onClick={() => p.id && handleStatus(p.id, 'retained')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          Retained ✓
                        </button>
                        <button onClick={() => p.id && handleStatus(p.id, 'departed')} className="text-xs px-3 py-1.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200">
                          Departed
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Risk threshold: <strong>{(config.riskThreshold * 100).toFixed(0)}%</strong></span>
              <span>Replacement cost: <strong>{withCurrency(config.replacementCost)}</strong></span>
              <span>Program budget: <strong>{withCurrency(config.programBudget)}/employee</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default RetentionProgramScreen;
