/**
 * AI Customer Feedback Loop Tracker — full feedback lifecycle dashboard.
 *
 * 76th POSR-exclusive differentiator — 85% never act on feedback (BrightLocal).
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
  faComments, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faRepeat, faWrench, faCircleCheck, faClock,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runFeedbackLoopEngine, getActiveLoops, getSummary, updateLoopStatus,
  readFeedbackLoopConfig, DEFAULT_FEEDBACK_LOOP_CONFIG,
  type FeedbackLoop,
} from "@/lib/feedback-loop.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  new_feedback:      { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faComments,            label: 'NEW' },
  recurring_theme:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faRepeat,             label: 'RECURRING' },
  action_needed:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faWrench,             label: 'ACTION NEEDED' },
  impact_verified:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCircleCheck,        label: 'VERIFIED' },
  loop_closed:       { bg: 'bg-emerald-100', text: 'text-emerald-800', icon: faCheckCircle,       label: 'CLOSED' },
};

const STAGE_STYLE: Record<string, string> = {
  collected: 'bg-blue-100 text-blue-700',
  analyzed: 'bg-violet-100 text-violet-700',
  action_assigned: 'bg-amber-100 text-amber-700',
  implementing: 'bg-orange-100 text-orange-700',
  implemented: 'bg-emerald-100 text-emerald-700',
  impact_verified: 'bg-emerald-200 text-emerald-800',
  closed: 'bg-neutral-100 text-neutral-500',
};

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-700',
  negative: 'bg-rose-100 text-rose-700',
  neutral: 'bg-amber-100 text-amber-700',
  mixed: 'bg-violet-100 text-violet-700',
};

export function FeedbackLoopScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [loops, setLoops] = useState<FeedbackLoop[]>([]);
  const [summary, setSummary] = useState({ openCount: 0, criticalCount: 0, overdueCount: 0, avgDaysOpen: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_FEEDBACK_LOOP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readFeedbackLoopConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveLoops(db), getSummary(db)]);
      setLoops(list); setSummary(sum);
    } catch (err) { console.error('[feedback-loop-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runFeedbackLoopEngine(db, config);
      toast.success(result.loops.length > 0
        ? `Tracked ${result.loops.length} feedback items — ${result.loops.filter(l => l.severity === 'critical').length} critical, ${result.loops.filter(l => l.rule_id === 'recurring_theme').length} recurring themes`
        : `No new feedback to process`);
      await reload();
    } catch (err) { console.error('[feedback-loop-report] analyze failed', err); toast.error('Engine failed'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (loopId: string, status: 'assigned' | 'implemented' | 'verified' | 'closed') => {
    try { await updateLoopStatus(db, loopId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed'); }
  }, [db, reload]);

  const sortedLoops = [...loops].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sev[a.severity] !== sev[b.severity]) return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
    return b.days_open - a.days_open;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Feedback Loop", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faComments} className="text-blue-600" />
              AI Feedback Loop
            </h1>
            <p className="text-sm text-neutral-500">
              Full feedback lifecycle — collect → analyze → act → verify → close (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Processing…' : 'Process feedback'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : loops.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faComments} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No open feedback!</p>
            <p className="text-sm mt-1">All caught up. Click "Process feedback" to scan recent reviews.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faComments} />Open items</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.openCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faClock} />Overdue ({'>'}7d)</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.overdueCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg days open</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.avgDaysOpen.toFixed(1)}</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedLoops.map((l, idx) => {
                const style = RULE_STYLE[l.rule_id] ?? RULE_STYLE.new_feedback;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          {l.customer_name && <span className="font-medium">{l.customer_name}</span>}
                          {l.category && <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 capitalize">{l.category.replace(/_/g, ' ')}</span>}
                          {l.sentiment && <span className={`text-xs px-2 py-0.5 rounded capitalize ${SENTIMENT_STYLE[l.sentiment] ?? SENTIMENT_STYLE.neutral}`}>{l.sentiment}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded capitalize ${STAGE_STYLE[l.stage] ?? STAGE_STYLE.collected}`}>{l.stage.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          {l.days_open > 0 && <span className={`font-bold ${l.days_open > 7 ? 'text-rose-600' : 'text-amber-600'}`}>{l.days_open}d open</span>}
                          {l.assigned_to && <span className="text-violet-600">→ {l.assigned_to}</span>}
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{l.description}</p>
                      {l.feedback_text && (
                        <p className="text-xs text-neutral-600 italic mt-1 bg-neutral-50 p-2 rounded border border-neutral-100">"{l.feedback_text}"</p>
                      )}
                    </div>

                    <div className="p-3">
                      {l.est_revenue_impact > 0 && (
                        <div className="mb-3 p-2 rounded bg-rose-50 border border-rose-100">
                          <p className="text-xs text-rose-700"><strong>Est. revenue impact:</strong> {withCurrency(l.est_revenue_impact)} (lost repeat visits)</p>
                        </div>
                      )}

                      {l.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{l.ai_insight}</p>
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap">
                        {l.stage === 'collected' && (
                          <button onClick={() => l.id && handleStatus(l.id, 'assigned')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                            <FontAwesomeIcon icon={faWrench} className="mr-1" />Assign
                          </button>
                        )}
                        {l.stage === 'action_assigned' && (
                          <button onClick={() => l.id && handleStatus(l.id, 'implemented')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                            <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Implemented
                          </button>
                        )}
                        <button onClick={() => l.id && handleStatus(l.id, 'verified')} className="text-xs px-3 py-1.5 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 font-medium">
                          <FontAwesomeIcon icon={faCircleCheck} className="mr-1" />Verify
                        </button>
                        <button onClick={() => l.id && handleStatus(l.id, 'closed')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Close loop
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Max days: <strong>{config.maxDays}d</strong></span>
              <span>Min impact: <strong>{config.minImpactScore}/100</strong></span>
              <span>Auto-assign: <strong>{config.autoAssign ? 'on' : 'off'}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default FeedbackLoopScreen;
