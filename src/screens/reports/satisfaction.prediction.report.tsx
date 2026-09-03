/**
 * Satisfaction Prediction Dashboard — predict satisfaction per order in real-time.
 *
 * 25th POSR-exclusive differentiator — restaurants discover unhappy customers
 * only AFTER they leave bad reviews. POSR predicts satisfaction BEFORE.
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
  faFaceSmile, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faClock,
  faUserTie, faGift, faHandshake, faBolt,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runSatisfactionPrediction,
  getAtRiskOrders,
  getSatisfactionSummary,
  updateSatisfactionAction,
  readSatisfactionConfig,
  DEFAULT_SATISFACTION_CONFIG,
  type SatisfactionPrediction,
  type SatisfactionLevel,
  type SatisfactionRecommendation,
} from "@/lib/satisfaction-prediction.service.ts";

const LEVEL_STYLE: Record<SatisfactionLevel, { bg: string; text: string; border: string; icon: any; label: string }> = {
  critical:  { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-500',    icon: faTriangleExclamation, label: 'Critical' },
  at_risk:   { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-400',   icon: faClock,               label: 'At risk' },
  neutral:   { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-400',    icon: faFaceSmile,           label: 'Neutral' },
  satisfied: { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-400',  icon: faCheckCircle,         label: 'Satisfied' },
  delighted: { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-400',   icon: faFaceSmile,           label: 'Delighted' },
};

const REC_LABEL: Record<SatisfactionRecommendation, string> = {
  manager_checkin: 'Manager check-in',
  comp_offered: 'Comp offered',
  apologize: 'Apologize',
  expedite_order: 'Expedite order',
  thank_customer: 'Thank customer',
  no_action: 'No action',
};

const REC_STYLE: Record<SatisfactionRecommendation, string> = {
  manager_checkin: 'bg-rose-100 text-rose-700',
  comp_offered: 'bg-amber-100 text-amber-700',
  apologize: 'bg-blue-100 text-blue-700',
  expedite_order: 'bg-orange-100 text-orange-700',
  thank_customer: 'bg-violet-100 text-violet-700',
  no_action: 'bg-neutral-100 text-neutral-600',
};

export function SatisfactionPredictionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<SatisfactionPrediction[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, atRisk: 0, delighted: 0, avgScore: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_SATISFACTION_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSatisfactionConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getAtRiskOrders(db),
        getSatisfactionSummary(db),
      ]);
      setPredictions(list);
      setSummary(sum);
    } catch (err) {
      console.error('[satisfaction-report] reload failed', err);
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
      const result = await runSatisfactionPrediction(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.predictions.length > 0
          ? `Scanned ${result.scanned} orders — ${result.predictions.filter(p => p.satisfaction_level === 'critical' || p.satisfaction_level === 'at_risk').length} at-risk + ${result.predictions.filter(p => p.satisfaction_level === 'delighted').length} delighted`
          : `All recent orders look satisfactory`
      );
      await reload();
    } catch (err) {
      console.error('[satisfaction-report] analyze failed', err);
      toast.error('Prediction failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleAction = useCallback(async (predId: string, action: string) => {
    try {
      await updateSatisfactionAction(db, predId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Satisfaction Prediction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faFaceSmile} className="text-violet-600" />
              Satisfaction Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              AI real-time satisfaction prediction — 8 factors + service recovery recs BEFORE customer leaves (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Predicting… (${progress.current}/${progress.total})` : 'Predict satisfaction'}
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
            <p className="text-lg font-medium text-emerald-600">No at-risk orders!</p>
            <p className="text-sm mt-1">Recent orders look satisfactory. Click "Predict" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.critical}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faClock} />At risk</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.atRisk}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faFaceSmile} />Delighted</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.delighted}</div>
              </div>
              <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-3 text-center">
                <div className="text-xs text-neutral-600">Total flagged</div>
                <div className="text-2xl font-bold text-neutral-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Avg score</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{Math.round(summary.avgScore)}/100</div>
              </div>
            </div>

            {/* Prediction list */}
            <div className="space-y-3">
              {predictions.map((pred, idx) => {
                const style = LEVEL_STYLE[pred.satisfaction_level] ?? LEVEL_STYLE.neutral;
                const factors = Object.entries(pred.risk_factors ?? {});
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">Order #{pred.order_id?.slice(0, 8)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        {pred.customer_name && <span className="text-sm text-neutral-600">· {pred.customer_name}</span>}
                        {pred.server_name && <span className="text-sm text-neutral-500">· Server: {pred.server_name}</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Satisfaction</div>
                        <div className={`font-bold tabular-nums ${style.text}`}>{pred.satisfaction_score}/100</div>
                      </div>
                    </div>

                    <div className="flex gap-4 text-xs text-neutral-600 mb-2">
                      <span><FontAwesomeIcon icon={faClock} className="mr-1 text-neutral-400" />{pred.ticket_time_min.toFixed(0)} min ticket</span>
                      <span>Party of {pred.party_size}</span>
                      <span>{withCurrency(pred.order_total)}</span>
                    </div>

                    {factors.length > 0 && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <div className="text-xs font-medium text-neutral-600 mb-1">Factors ({factors.length}):</div>
                        <div className="space-y-0.5">
                          {factors.map(([fid, f]) => (
                            <div key={fid} className="text-xs text-neutral-700 flex gap-2">
                              <span className={`font-mono font-bold tabular-nums ${(f as any).weight > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {(f as any).weight > 0 ? '+' : ''}{(f as any).weight}
                              </span>
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
                        <button onClick={() => pred.id && handleAction(pred.id, 'manager_checked_in')}
                          className="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700 hover:bg-rose-200">
                          <FontAwesomeIcon icon={faUserTie} /> Check-in
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'comp_offered')}
                          className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200">
                          <FontAwesomeIcon icon={faGift} /> Comp
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'apologized')}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faHandshake} /> Apologize
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'thanked')}
                          className="px-2 py-1 rounded text-xs bg-violet-100 text-violet-700 hover:bg-violet-200">
                          <FontAwesomeIcon icon={faBolt} /> Thank
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
              <span>Lookback: <strong>{config.lookbackHours}h</strong></span>
              <span>Critical: <strong>&lt; {config.criticalThreshold}</strong></span>
              <span>At risk: <strong>&lt; {config.atRiskThreshold}</strong></span>
              <span>Delighted: <strong>≥ {config.delightedThreshold}</strong></span>
              <span>Max orders: <strong>{config.maxOrders}</strong></span>
              <span>8 risk factors</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default SatisfactionPredictionScreen;
