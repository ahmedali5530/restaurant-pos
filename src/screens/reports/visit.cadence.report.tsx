/**
 * Visit Cadence Dashboard — predict WHEN customers will return.
 *
 * 21st POSR-exclusive differentiator — Toast, Square, Lightspeed have visit
 * FREQUENCY (count) but NO cadence TIMING prediction.
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
  faCalendarCheck, faRobot, faRotate, faLightbulb,
  faCheckCircle, faXmark, faEye, faClock, faCalendarDay,
  faBell, faGift, faBullhorn, faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runCadenceAnalysis,
  getOverdueCustomers,
  getCadenceSummary,
  updateCadenceAction,
  readCadenceConfig,
  DEFAULT_CADENCE_CONFIG,
  type VisitCadence,
  type OverdueStatus,
  type CadenceRecommendation,
} from "@/lib/visit-cadence.service.ts";

const OVERDUE_STYLE: Record<OverdueStatus, { bg: string; text: string; border: string; label: string }> = {
  significantly_overdue: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   label: 'Significantly overdue' },
  overdue:               { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  label: 'Overdue' },
  due_soon:              { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-400',   label: 'Due soon' },
  on_track:              { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'On track' },
};

const REC_LABEL: Record<CadenceRecommendation, string> = {
  send_reminder: 'Send reminder',
  loyalty_nudge: 'Loyalty nudge',
  win_back_campaign: 'Win-back campaign',
  no_action: 'No action',
  schedule_staff: 'Schedule staff',
};

const REC_STYLE: Record<CadenceRecommendation, string> = {
  send_reminder: 'bg-blue-100 text-blue-700',
  loyalty_nudge: 'bg-violet-100 text-violet-700',
  win_back_campaign: 'bg-rose-100 text-rose-700',
  no_action: 'bg-neutral-100 text-neutral-600',
  schedule_staff: 'bg-emerald-100 text-emerald-700',
};

const formatDate = (d: Date | string): string => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function VisitCadenceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [cadences, setCadences] = useState<VisitCadence[]>([]);
  const [summary, setSummary] = useState({
    total: 0, regular: 0, occasional: 0, infrequent: 0,
    overdue: 0, significantlyOverdue: 0, totalExpectedValue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_CADENCE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCadenceConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getOverdueCustomers(db),
        getCadenceSummary(db),
      ]);
      setCadences(list);
      setSummary(sum);
    } catch (err) {
      console.error('[cadence-report] reload failed', err);
      toast.error('Failed to load cadences');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runCadenceAnalysis(db, config, (current, total) => {
        setProgress({ current, total });
      });
      const overdue = result.cadences.filter(c => c.overdue_status !== 'on_track').length;
      toast.success(
        result.cadences.length > 0
          ? `Analyzed ${result.analyzed} customers — ${overdue} overdue (${withCurrency(summary.totalExpectedValue)} expected value)`
          : `No customers with ${config.minVisits}+ visits found`
      );
      await reload();
    } catch (err) {
      console.error('[cadence-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload, summary.totalExpectedValue]);

  const handleAction = useCallback(async (cadenceId: string, action: string) => {
    try {
      await updateCadenceAction(db, cadenceId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Visit Cadence", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarCheck} className="text-blue-600" />
              Visit Cadence
            </h1>
            <p className="text-sm text-neutral-500">
              AI visit timing prediction — when will customers return? + optimal re-engagement timing (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Run analysis'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading cadences…</p>
          </div>
        ) : cadences.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No overdue customers!</p>
            <p className="text-sm mt-1">All customers on track. Click "Run analysis" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Sig. overdue</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.significantlyOverdue}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Overdue</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.overdue}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Regulars</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.regular}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Occasional</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.occasional}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Infrequent</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.infrequent}</div>
              </div>
              <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-3 text-center">
                <div className="text-xs text-neutral-600">Total</div>
                <div className="text-2xl font-bold text-neutral-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Expected value</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalExpectedValue)}</div>
              </div>
            </div>

            {/* Cadence list */}
            <div className="space-y-3">
              {cadences.map((cadence, idx) => {
                const style = OVERDUE_STYLE[cadence.overdue_status] ?? OVERDUE_STYLE.on_track;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faCalendarCheck} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{cadence.customer_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        <span className="text-sm text-neutral-500 capitalize">· {cadence.cadence_type}</span>
                        <span className="text-sm text-neutral-500">· {cadence.total_visits} visits</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Expected next visit value</div>
                        <div className="font-bold text-emerald-600 tabular-nums">{withCurrency(cadence.est_next_visit_value)}</div>
                        <div className="text-[10px] text-neutral-400">{Math.round(cadence.est_return_probability * 100)}% return prob</div>
                      </div>
                    </div>

                    {/* Cadence timeline */}
                    <div className="bg-white/70 rounded p-3 mb-2">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-neutral-500">Median interval</div>
                          <div className="font-bold tabular-nums text-neutral-700">{cadence.median_interval_days.toFixed(1)} days</div>
                          <div className="text-[10px] text-neutral-400">±{cadence.interval_stddev.toFixed(1)}d std dev</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500 flex items-center gap-1"><FontAwesomeIcon icon={faCalendarDay} />Last visit</div>
                          <div className="font-bold tabular-nums text-neutral-700">{formatDate(cadence.last_visit_date)}</div>
                          <div className="text-[10px] text-neutral-400">{cadence.days_since_last_visit}d ago</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Expected return</div>
                          <div className={`font-bold tabular-nums ${cadence.overdue_days > 0 ? 'text-rose-600' : 'text-neutral-700'}`}>
                            {formatDate(cadence.expected_return_date)}
                          </div>
                          <div className="text-[10px] text-neutral-400">
                            {cadence.overdue_days > 0 ? `${cadence.overdue_days}d overdue` : `${Math.abs(cadence.overdue_days)}d until due`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Consistency</div>
                          <div className={`font-bold tabular-nums ${cadence.consistency_score > 0.7 ? 'text-emerald-600' : cadence.consistency_score > 0.4 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {Math.round(cadence.consistency_score * 100)}%
                          </div>
                          <div className="text-[10px] text-neutral-400">visit regularity</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Overdue %</div>
                          <div className={`font-bold tabular-nums ${cadence.overdue_pct > 50 ? 'text-rose-600' : cadence.overdue_pct > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {cadence.overdue_pct > 0 ? '+' : ''}{cadence.overdue_pct.toFixed(0)}%
                          </div>
                          <div className="text-[10px] text-neutral-400">vs interval</div>
                        </div>
                      </div>
                    </div>

                    {/* AI insight */}
                    {cadence.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{cadence.ai_insight}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 items-center flex-wrap">
                      {cadence.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[cadence.ai_recommendation]}`}>
                          AI: {REC_LABEL[cadence.ai_recommendation]}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 flex-wrap">
                        <button onClick={() => cadence.id && handleAction(cadence.id, 'reminder_sent')}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faBell} /> Reminder sent
                        </button>
                        <button onClick={() => cadence.id && handleAction(cadence.id, 'nudged')}
                          className="px-2 py-1 rounded text-xs bg-violet-100 text-violet-700 hover:bg-violet-200">
                          <FontAwesomeIcon icon={faGift} /> Loyalty nudge
                        </button>
                        <button onClick={() => cadence.id && handleAction(cadence.id, 'campaign_sent')}
                          className="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700 hover:bg-rose-200">
                          <FontAwesomeIcon icon={faBullhorn} /> Campaign sent
                        </button>
                        <button onClick={() => cadence.id && handleAction(cadence.id, 'returned')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} /> Returned
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min visits: <strong>{config.minVisits}</strong></span>
              <span>Regular (≤): <strong>{config.regularMaxDays}d</strong></span>
              <span>Occasional (≤): <strong>{config.occasionalMaxDays}d</strong></span>
              <span>Sig. overdue: <strong>× {config.significantOverdueMultiplier}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default VisitCadenceScreen;
