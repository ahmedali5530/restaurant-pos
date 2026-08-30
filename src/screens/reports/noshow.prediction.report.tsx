/**
 * No-Show Prediction Dashboard — upcoming reservation risk + AI recs.
 *
 * 5th POSR-exclusive differentiator — Toast and Square have NO no-show
 * prediction. OpenTable has basic scoring only. POSR offers 10-factor
 * risk scoring + AI recommendations free.
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
  faCalendarXmark, faRobot, faRotate, faLightbulb,
  faCheckCircle, faPhone, faShieldAlt, faUserXmark,
  faUsers, faClock, faDollarSign, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runNoShowPrediction,
  getUpcomingPredictions,
  getNoShowSummary,
  updatePredictionAction,
  readNoShowConfig,
  DEFAULT_NOSHOW_CONFIG,
  type NoShowPrediction,
  type NoShowRiskLevel,
} from "@/lib/noshow-prediction.service.ts";

const LEVEL_STYLE: Record<NoShowRiskLevel, {
  bg: string; text: string; border: string; label: string; icon: any;
}> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   label: 'Critical', icon: faTriangleExclamation },
  high:     { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-400', label: 'High',     icon: faShieldAlt },
  medium:   { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  label: 'Medium',   icon: faClock },
  low:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Low',     icon: faCheckCircle },
};

const REC_LABEL: Record<string, string> = {
  confirm_now: 'Confirm now',
  require_deposit: 'Require deposit',
  call_reminder: 'Call reminder',
  overbook_slot: 'Overbook slot',
  accept_risk: 'Accept risk',
  block_customer: 'Block customer',
};

const REC_STYLE: Record<string, string> = {
  confirm_now: 'bg-blue-100 text-blue-700',
  require_deposit: 'bg-rose-100 text-rose-700',
  call_reminder: 'bg-amber-100 text-amber-700',
  overbook_slot: 'bg-violet-100 text-violet-700',
  accept_risk: 'bg-emerald-100 text-emerald-700',
  block_customer: 'bg-neutral-800 text-white',
};

const ACTION_BUTTONS: Array<{ action: string; label: string; icon: any; cls: string }> = [
  { action: 'confirmed',          label: 'Confirm',   icon: faCheckCircle, cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
  { action: 'deposit_requested',  label: 'Deposit',   icon: faDollarSign,   cls: 'bg-rose-100 text-rose-700 hover:bg-rose-200' },
  { action: 'reminder_sent',      label: 'Remind',    icon: faPhone,        cls: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
  { action: 'overbooked',         label: 'Overbook',  icon: faUsers,        cls: 'bg-violet-100 text-violet-700 hover:bg-violet-200' },
  { action: 'no_show_confirmed',  label: 'No-show',  icon: faUserXmark,    cls: 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300' },
];

const formatDate = (d: Date | string): string => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export function NoShowPredictionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<NoShowPrediction[]>([]);
  const [summary, setSummary] = useState({
    totalUpcoming: 0, critical: 0, high: 0, medium: 0, low: 0,
    revenueAtRisk: 0, chronicNoShowers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_NOSHOW_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readNoShowConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getUpcomingPredictions(db),
        getNoShowSummary(db),
      ]);
      setPredictions(list);
      setSummary(sum);
    } catch (err) {
      console.error('[noshow-report] reload failed', err);
      toast.error('Failed to load predictions');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 4 });
    try {
      const result = await runNoShowPrediction(db, config, (current, total) => {
        setProgress({ current, total });
      });
      const atRisk = result.predictions.filter(p => p.risk_score >= 35).length;
      const revenue = result.predictions.reduce((s, p) => s + p.est_revenue_at_risk, 0);
      toast.success(
        result.predictions.length > 0
          ? `Scored ${result.predictions.length} upcoming reservations — ${atRisk} at-risk (${withCurrency(revenue)} revenue at risk)`
          : `No upcoming reservations to score`
      );
      await reload();
    } catch (err) {
      console.error('[noshow-report] analyze failed', err);
      toast.error('Prediction failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleAction = useCallback(async (predId: string, action: string) => {
    try {
      await updatePredictionAction(db, predId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["No-Show Prediction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarXmark} className="text-rose-600" />
              No-Show Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              10-factor risk scoring for upcoming reservations + AI recommendations — POSR-exclusive
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Scoring… (${progress.current}/${progress.total})` : 'Score upcoming'}
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
            <p className="text-lg font-medium text-emerald-600">No at-risk reservations!</p>
            <p className="text-sm mt-1">All upcoming reservations are handled. Click "Score upcoming" to re-evaluate.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                <div className="text-xs text-violet-600">Revenue at risk</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{withCurrency(summary.revenueAtRisk)}</div>
              </div>
            </div>

            {/* Prediction list */}
            <div className="space-y-3">
              {predictions.map((pred, idx) => {
                const style = LEVEL_STYLE[pred.risk_level] ?? LEVEL_STYLE.medium;
                const factors = Object.entries(pred.risk_factors ?? {});
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    {/* Top row: name + level + revenue */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{pred.customer_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        {pred.customer_phone && (
                          <span className="text-sm text-neutral-500">· {pred.customer_phone}</span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-4">
                        <div>
                          <div className="text-xs text-neutral-500">Risk score</div>
                          <div className={`font-bold tabular-nums ${style.text}`}>{Math.round(pred.risk_score)}/100</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Revenue at risk</div>
                          <div className="font-bold text-rose-600 tabular-nums">{withCurrency(pred.est_revenue_at_risk)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Reservation meta */}
                    <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mb-2">
                      <span><FontAwesomeIcon icon={faClock} className="mr-1 text-neutral-400" />{formatDate(pred.reservation_date)}</span>
                      <span><FontAwesomeIcon icon={faUsers} className="mr-1 text-neutral-400" />Party of {pred.party_size}</span>
                      <span className="capitalize">Source: {pred.source.replace(/_/g, ' ')}</span>
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
                                {(f as any).weight > 0 ? '+' : ''}{(f as any).weight}
                              </span>
                              <span>{(f as any).detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI insight + recommendation */}
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
              <span>Large party: <strong>≥ {config.largePartySize}</strong></span>
              <span>Peak slot: <strong>{config.peakStartHour}:00–{config.peakEndHour}:00 Fri/Sat</strong></span>
              <span>Long lead: <strong>&gt; {config.longLeadDays} days</strong></span>
              <span>High threshold: <strong>{config.highRiskThreshold}</strong></span>
              <span>Critical threshold: <strong>{config.criticalRiskThreshold}</strong></span>
              <span>10 risk factors</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default NoShowPredictionScreen;
