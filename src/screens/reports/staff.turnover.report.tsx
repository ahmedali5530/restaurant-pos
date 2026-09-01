/**
 * Staff Turnover Prediction Dashboard — retention risk + AI recommendations.
 *
 * 9th POSR-exclusive differentiator — Toast, Square, Lightspeed have NO
 * turnover prediction. They only do attendance logging.
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
  faUserClock, faRobot, faRotate, faLightbulb,
  faCheckCircle, faXmark, faEye, faUserXmark,
  faUsers, faCalendarDay, faDollarSign, faTriangleExclamation,
  faAward, faHandshake, faFileSignature,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runTurnoverPrediction,
  getAtRiskEmployees,
  getTurnoverSummary,
  updateTurnoverAction,
  readTurnoverConfig,
  DEFAULT_TURNOVER_CONFIG,
  type TurnoverPrediction,
  type TurnoverRiskLevel,
} from "@/lib/staff-turnover.service.ts";

const LEVEL_STYLE: Record<TurnoverRiskLevel, {
  bg: string; text: string; border: string; label: string; icon: any;
}> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   label: 'Critical', icon: faTriangleExclamation },
  high:     { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-400', label: 'High',     icon: faUserClock },
  medium:   { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  label: 'Medium',   icon: faEye },
  low:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Low',     icon: faCheckCircle },
};

const REC_LABEL: Record<string, string> = {
  schedule_check_in: 'Schedule check-in',
  review_compensation: 'Review compensation',
  offer_development: 'Offer development',
  reduce_overtime: 'Reduce overtime',
  recognize_publicly: 'Recognize publicly',
  transfer_department: 'Transfer department',
  exit_interview: 'Exit interview',
  accept_departure: 'Accept departure',
};

const REC_STYLE: Record<string, string> = {
  schedule_check_in: 'bg-blue-100 text-blue-700',
  review_compensation: 'bg-amber-100 text-amber-700',
  offer_development: 'bg-violet-100 text-violet-700',
  reduce_overtime: 'bg-orange-100 text-orange-700',
  recognize_publicly: 'bg-emerald-100 text-emerald-700',
  transfer_department: 'bg-blue-100 text-blue-700',
  exit_interview: 'bg-rose-100 text-rose-700',
  accept_departure: 'bg-neutral-800 text-white',
};

const ACTION_BUTTONS: Array<{ action: string; label: string; icon: any; cls: string }> = [
  { action: 'checked_in',        label: 'Check-in',     icon: faHandshake,    cls: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { action: 'comp_reviewed',     label: 'Comp review',  icon: faDollarSign,   cls: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
  { action: 'development_offered', label: 'Dev offer',  icon: faAward,        cls: 'bg-violet-100 text-violet-700 hover:bg-violet-200' },
  { action: 'overtime_reduced',  label: 'Cut OT',        icon: faCalendarDay,  cls: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  { action: 'recognized',        label: 'Recognized',  icon: faAward,        cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
  { action: 'exit_interviewed',  label: 'Exit',        icon: faFileSignature, cls: 'bg-rose-100 text-rose-700 hover:bg-rose-200' },
  { action: 'retained',          label: 'Retained',    icon: faCheckCircle,  cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
];

export function StaffTurnoverScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<TurnoverPrediction[]>([]);
  const [summary, setSummary] = useState({
    totalEmployees: 0, critical: 0, high: 0, medium: 0,
    atRiskCost: 0, avgRiskScore: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_TURNOVER_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTurnoverConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getAtRiskEmployees(db),
        getTurnoverSummary(db),
      ]);
      setPredictions(list);
      setSummary(sum);
    } catch (err) {
      console.error('[turnover-report] reload failed', err);
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
      const result = await runTurnoverPrediction(db, config, (current, total) => {
        setProgress({ current, total });
      });
      const atRisk = result.predictions.filter(p => p.risk_score >= 35).length;
      const cost = result.predictions.reduce((s, p) => s + p.est_replacement_cost, 0);
      toast.success(
        result.predictions.length > 0
          ? `Scored ${result.predictions.length} employees — ${atRisk} at-risk (${withCurrency(cost)} replacement cost exposure)`
          : `No active employees found to score`
      );
      await reload();
    } catch (err) {
      console.error('[turnover-report] analyze failed', err);
      toast.error('Prediction failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleAction = useCallback(async (predId: string, action: string) => {
    try {
      await updateTurnoverAction(db, predId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Staff Turnover Prediction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUserClock} className="text-orange-600" />
              Staff Turnover Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              AI retention risk scoring — 9 factors + AI retention recommendations (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Scoring… (${progress.current}/${progress.total})` : 'Score employees'}
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
            <p className="text-lg font-medium text-emerald-600">No at-risk employees!</p>
            <p className="text-sm mt-1">All staff are engaged. Click "Score employees" to re-evaluate.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Critical risk</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.critical}</div>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                <div className="text-xs text-orange-600">High risk</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{summary.high}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Medium risk</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.medium}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Replacement cost exposure</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{withCurrency(summary.atRiskCost)}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Avg risk score</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{Math.round(summary.avgRiskScore)}/100</div>
              </div>
            </div>

            {/* Prediction list */}
            <div className="space-y-3">
              {predictions.map((pred, idx) => {
                const style = LEVEL_STYLE[pred.risk_level] ?? LEVEL_STYLE.medium;
                const factors = Object.entries(pred.risk_factors ?? {});
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{pred.employee_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        {pred.position && <span className="text-sm text-neutral-600">· {pred.position}</span>}
                        {pred.department && <span className="text-sm text-neutral-500">· {pred.department}</span>}
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-4">
                        <div>
                          <div className="text-xs text-neutral-500">Risk score</div>
                          <div className={`font-bold tabular-nums ${style.text}`}>{Math.round(pred.risk_score)}/100</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Replacement cost</div>
                          <div className="font-bold text-rose-600 tabular-nums">{withCurrency(pred.est_replacement_cost)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Tenure + meta */}
                    <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mb-2">
                      <span><FontAwesomeIcon icon={faCalendarDay} className="mr-1 text-neutral-400" />{Math.round(pred.tenure_days / 30)} months tenure</span>
                      <span><FontAwesomeIcon icon={faUsers} className="mr-1 text-neutral-400" />{factors.length} risk factors</span>
                    </div>

                    {/* Risk factors */}
                    {factors.length > 0 && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <div className="text-xs font-medium text-neutral-600 mb-1">Risk factors ({factors.length}):</div>
                        <div className="space-y-0.5">
                          {factors.map(([fid, f]) => (
                            <div key={fid} className="text-xs text-neutral-700 flex gap-2">
                              <span className={`font-mono font-bold tabular-nums ${
                                (f as any).weight > 0 ? 'text-rose-600' : 'text-emerald-600'
                              }`}>
                                +{(f as any).weight}
                              </span>
                              <span>{(f as any).detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI insight */}
                    {pred.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{pred.ai_insight}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 items-center flex-wrap">
                      {pred.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[pred.ai_recommendation] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          AI: {REC_LABEL[pred.ai_recommendation] ?? pred.ai_recommendation}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 flex-wrap">
                        {ACTION_BUTTONS.map(btn => (
                          <button
                            key={btn.action}
                            onClick={() => pred.id && handleAction(pred.id, btn.action)}
                            className={`px-2 py-1 rounded text-xs ${btn.cls}`}
                            title={btn.label}
                          >
                            <FontAwesomeIcon icon={btn.icon} className="mr-1" />{btn.label}
                          </button>
                        ))}
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
              <span>Tenure threshold: <strong>&lt; {config.tenureThresholdDays} days</strong></span>
              <span>Overtime threshold: <strong>{(config.overtimePct * 100).toFixed(0)}%</strong></span>
              <span>Utilization min: <strong>{(config.utilizationMin * 100).toFixed(0)}%</strong></span>
              <span>High risk: <strong>≥ {config.highRiskThreshold}</strong></span>
              <span>Critical risk: <strong>≥ {config.criticalRiskThreshold}</strong></span>
              <span>Replacement cost: <strong>{withCurrency(config.replacementCost)}/employee</strong></span>
              <span>9 risk factors</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default StaffTurnoverScreen;
