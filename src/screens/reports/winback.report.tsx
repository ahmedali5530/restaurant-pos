/**
 * Customer Win-Back Dashboard — win-back predictions + AI offers.
 *
 * 12th POSR-exclusive differentiator — Toast, Square, Lightspeed have NO
 * win-back AI. They only do generic "we miss you" blasts.
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
  faHeartCrack, faRobot, faRotate, faLightbulb,
  faCheckCircle, faXmark, faEye, faGift, faUsers,
  faDollarSign, faCalendarDay, faTicket, faCopy,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runWinBackPrediction,
  getWinBackCandidates,
  getWinBackSummary,
  updateWinBackAction,
  readWinBackConfig,
  DEFAULT_WINBACK_CONFIG,
  type WinBackPrediction,
  type WinBackLevel,
} from "@/lib/winback.service.ts";

const LEVEL_STYLE: Record<WinBackLevel, {
  bg: string; text: string; border: string; label: string; icon: any;
}> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   label: 'Critical', icon: faHeartCrack },
  high:     { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  label: 'High',     icon: faGift },
  medium:   { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-400',   label: 'Medium',   icon: faEye },
  low:      { bg: 'bg-neutral-50', text: 'text-neutral-600', border: 'border-neutral-300', label: 'Low',   icon: faCheckCircle },
};

const OFFER_LABEL: Record<string, string> = {
  discount_15pct: '15% discount',
  free_appetizer: 'Free appetizer',
  loyalty_reactivation: 'Loyalty reactivation',
  birthday_offer: 'Birthday offer',
  apology_credit: 'Apology credit',
  vip_invitation: 'VIP invitation',
  dismiss: 'Dismiss',
};

const OFFER_STYLE: Record<string, string> = {
  discount_15pct: 'bg-amber-100 text-amber-700',
  free_appetizer: 'bg-emerald-100 text-emerald-700',
  loyalty_reactivation: 'bg-violet-100 text-violet-700',
  birthday_offer: 'bg-rose-100 text-rose-700',
  apology_credit: 'bg-blue-100 text-blue-700',
  vip_invitation: 'bg-neutral-800 text-white',
  dismiss: 'bg-neutral-100 text-neutral-600',
};

const formatDate = (d: Date | string): string => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export function WinBackScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<WinBackPrediction[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, high: 0, medium: 0, totalRecoverable: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_WINBACK_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWinBackConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getWinBackCandidates(db),
        getWinBackSummary(db),
      ]);
      setPredictions(list);
      setSummary(sum);
    } catch (err) {
      console.error('[winback-report] reload failed', err);
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
      const result = await runWinBackPrediction(db, config, (current, total) => {
        setProgress({ current, total });
      });
      const atRisk = result.predictions.filter(p => p.winback_score >= 35).length;
      const recoverable = result.predictions.reduce((s, p) => s + p.est_clv_recovered, 0);
      toast.success(
        result.predictions.length > 0
          ? `Scored ${result.predictions.length} churned customers — ${atRisk} win-backable (${withCurrency(recoverable)} recoverable CLV)`
          : `No churned customers found in last ${config.lookbackDays} days`
      );
      await reload();
    } catch (err) {
      console.error('[winback-report] analyze failed', err);
      toast.error('Prediction failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleAction = useCallback(async (predId: string, action: string) => {
    try {
      await updateWinBackAction(db, predId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  const handleCopyOffer = useCallback((text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast.success('Offer text copied to clipboard'));
  }, []);

  return (
    <Layout>
      <DocumentTitle parts={["Customer Win-Back", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faHeartCrack} className="text-rose-600" />
              Customer Win-Back
            </h1>
            <p className="text-sm text-neutral-500">
              AI win-back scoring for churned customers — 7 factors + personalized AI offers (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Scoring… (${progress.current}/${progress.total})` : 'Score churned customers'}
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
            <p className="text-lg font-medium text-emerald-600">No win-back candidates!</p>
            <p className="text-sm mt-1">No churned customers worth pursuing. Click "Score" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.critical}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">High</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.high}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Medium</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.medium}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Win-backable</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Recoverable CLV</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalRecoverable)}</div>
              </div>
            </div>

            {/* Prediction list */}
            <div className="space-y-3">
              {predictions.map((pred, idx) => {
                const style = LEVEL_STYLE[pred.winback_level] ?? LEVEL_STYLE.medium;
                const factors = Object.entries(pred.winback_factors ?? {});
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{pred.customer_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        {pred.customer_phone && <span className="text-sm text-neutral-500">· {pred.customer_phone}</span>}
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-4">
                        <div>
                          <div className="text-xs text-neutral-500">Win-back score</div>
                          <div className={`font-bold tabular-nums ${style.text}`}>{Math.round(pred.winback_score)}/100</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Recoverable CLV</div>
                          <div className="font-bold text-emerald-600 tabular-nums">{withCurrency(pred.est_clv_recovered)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Customer meta */}
                    <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mb-2">
                      <span><FontAwesomeIcon icon={faDollarSign} className="mr-1 text-neutral-400" />LTV: {withCurrency(pred.lifetime_value)}</span>
                      <span><FontAwesomeIcon icon={faCalendarDay} className="mr-1 text-neutral-400" />Last visit: {pred.last_visit_date ? formatDate(pred.last_visit_date) : 'N/A'} ({pred.days_since_last_visit}d ago)</span>
                      <span><FontAwesomeIcon icon={faUsers} className="mr-1 text-neutral-400" />{pred.visit_count_before_churn} visits before churn</span>
                    </div>

                    {/* Risk factors */}
                    {factors.length > 0 && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <div className="text-xs font-medium text-neutral-600 mb-1">Win-back factors ({factors.length}):</div>
                        <div className="space-y-0.5">
                          {factors.map(([fid, f]) => (
                            <div key={fid} className="text-xs text-neutral-700 flex gap-2">
                              <span className="font-mono font-bold tabular-nums text-emerald-600">+{(f as any).weight}</span>
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

                    {/* AI offer */}
                    {pred.ai_offer_text && (
                      <div className="bg-emerald-50 rounded p-2 mb-2 border border-emerald-200">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium text-emerald-700">
                            <FontAwesomeIcon icon={faTicket} className="mr-1" />AI offer:
                          </span>
                          <button
                            onClick={() => handleCopyOffer(pred.ai_offer_text)}
                            className="text-xs text-emerald-700 hover:text-emerald-900"
                            title="Copy offer text"
                          >
                            <FontAwesomeIcon icon={faCopy} /> Copy
                          </button>
                        </div>
                        <p className="text-xs text-emerald-800 font-medium">"{pred.ai_offer_text}"</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 items-center flex-wrap">
                      {pred.ai_offer && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${OFFER_STYLE[pred.ai_offer] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          AI: {OFFER_LABEL[pred.ai_offer] ?? pred.ai_offer}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 flex-wrap">
                        <button onClick={() => pred.id && handleAction(pred.id, 'offer_sent')}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faTicket} /> Send offer
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'won_back')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} /> Won back
                        </button>
                        <button onClick={() => pred.id && handleAction(pred.id, 'declined')}
                          className="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700 hover:bg-rose-200">
                          <FontAwesomeIcon icon={faXmark} /> Declined
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
              <span>Inactivity: <strong>{config.inactivityDays} days</strong></span>
              <span>Recent departure: <strong>{config.recentDepartureDays} days</strong></span>
              <span>High CLV threshold: <strong>{withCurrency(config.highClvThreshold)}</strong></span>
              <span>Frequent visitor: <strong>≥ {config.frequentThreshold}/mo</strong></span>
              <span>High score: <strong>≥ {config.highScoreThreshold}</strong></span>
              <span>Critical score: <strong>≥ {config.criticalThreshold}</strong></span>
              <span>7 win-back factors</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default WinBackScreen;
