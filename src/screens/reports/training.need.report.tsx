/**
 * Training Need Dashboard — proactive skill gap detection + AI recs.
 *
 * 23rd POSR-exclusive differentiator — Toast, Square, Lightspeed have
 * attendance tracking but NO skill-gap prediction.
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
  faGraduationCap, faRobot, faRotate, faLightbulb,
  faCheckCircle, faXmark, faEye, faUserClock, faCalendarDay,
  faTriangleExclamation, faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runTrainingNeedAnalysis,
  getTrainingNeeds,
  getTrainingSummary,
  updateTrainingAction,
  readTrainingConfig,
  DEFAULT_TRAINING_CONFIG,
  type TrainingNeedPrediction,
  type TrainingNeedLevel,
  type TrainingRecommendation,
} from "@/lib/training-need.service.ts";

const LEVEL_STYLE: Record<TrainingNeedLevel, { bg: string; text: string; border: string; icon: any; label: string }> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   icon: faTriangleExclamation, label: 'Critical' },
  high:     { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-400', label: 'High',     icon: faUserClock },
  medium:   { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  label: 'Medium',   icon: faEye },
  low:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Low',     icon: faCheckCircle },
};

const REC_LABEL: Record<TrainingRecommendation, string> = {
  specific_training: 'Specific training',
  cross_training: 'Cross-training',
  refresher: 'Refresher',
  mentor_assignment: 'Mentor assignment',
  performance_review: 'Performance review',
  no_action: 'No action',
};

const REC_STYLE: Record<TrainingRecommendation, string> = {
  specific_training: 'bg-blue-100 text-blue-700',
  cross_training: 'bg-violet-100 text-violet-700',
  refresher: 'bg-amber-100 text-amber-700',
  mentor_assignment: 'bg-emerald-100 text-emerald-700',
  performance_review: 'bg-rose-100 text-rose-700',
  no_action: 'bg-neutral-100 text-neutral-600',
};

export function TrainingNeedScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<TrainingNeedPrediction[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, high: 0, medium: 0, totalCostOfInaction: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_TRAINING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTrainingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getTrainingNeeds(db),
        getTrainingSummary(db),
      ]);
      setPredictions(list);
      setSummary(sum);
    } catch (err) {
      console.error('[training-report] reload failed', err);
      toast.error('Failed to load predictions');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runTrainingNeedAnalysis(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.predictions.length > 0
          ? `Analyzed ${result.scanned} employees — ${result.predictions.length} need training (${withCurrency(summary.totalCostOfInaction)} cost of inaction)`
          : `No employees needing training found`
      );
      await reload();
    } catch (err) {
      console.error('[training-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload, summary.totalCostOfInaction]);

  const handleAction = useCallback(async (predId: string, action: string) => {
    try {
      await updateTrainingAction(db, predId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Training Need", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faGraduationCap} className="text-blue-600" />
              Training Need Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              AI proactive skill gap detection — 8 risk factors + AI training recommendations (POSR-exclusive)
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
            <p>Loading predictions…</p>
          </div>
        ) : predictions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No training needs detected!</p>
            <p className="text-sm mt-1">All staff performing well. Click "Run analysis" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.critical}</div>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                <div className="text-xs text-orange-600">High</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{summary.high}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Medium</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.medium}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Total needs</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Cost of inaction</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalCostOfInaction)}</div>
              </div>
            </div>

            {/* Prediction list */}
            <div className="space-y-3">
              {predictions.map((pred, idx) => {
                const style = LEVEL_STYLE[pred.need_level] ?? LEVEL_STYLE.medium;
                const factors = Object.entries(pred.risk_factors ?? {});
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{pred.employee_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        {pred.position && <span className="text-sm text-neutral-600">· {pred.position}</span>}
                        {pred.department && <span className="text-sm text-neutral-500">· {pred.department}</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Need score</div>
                        <div className={`font-bold tabular-nums ${style.text}`}>{Math.round(pred.need_score)}/100</div>
                      </div>
                    </div>

                    <div className="flex gap-4 text-xs text-neutral-600 mb-2">
                      <span><FontAwesomeIcon icon={faCalendarDay} className="mr-1 text-neutral-400" />{Math.round(pred.tenure_days / 30)} months tenure</span>
                      <span>{factors.length} risk factors</span>
                    </div>

                    {factors.length > 0 && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <div className="text-xs font-medium text-neutral-600 mb-1">Risk factors ({factors.length}):</div>
                        <div className="space-y-0.5">
                          {factors.map(([fid, f]) => (
                            <div key={fid} className="text-xs text-neutral-700 flex gap-2">
                              <span className="font-mono font-bold tabular-nums text-rose-600">+{(f as any).weight}</span>
                              <span>{(f as any).detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {pred.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{pred.ai_insight}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 items-center flex-wrap">
                      {pred.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[pred.ai_recommendation]}`}>
                          AI: {REC_LABEL[pred.ai_recommendation]}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 flex-wrap">
                        <button onClick={() => pred.id && handleAction(pred.id, 'training_scheduled')}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faGraduationCap} /> Schedule
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'mentor_assigned')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          Mentor
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'reviewed')}
                          className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200">
                          Review
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'dismissed')}
                          className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          <FontAwesomeIcon icon={faXmark} /> Dismiss
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
              <span>No training threshold: <strong>{config.noTrainingDays} days</strong></span>
              <span>High need: <strong>≥ {config.highNeedThreshold}</strong></span>
              <span>Critical: <strong>≥ {config.criticalThreshold}</strong></span>
              <span>Peer gap: <strong>{(config.peerGapPct * 100).toFixed(0)}% below median</strong></span>
              <span>8 risk factors</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default TrainingNeedScreen;
