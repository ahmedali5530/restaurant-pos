/**
 * Chargeback Risk Detection Dashboard — predictive chargeback prevention.
 *
 * 13th POSR-exclusive differentiator — Toast and Square have REACTIVE
 * chargeback management (respond after dispute). POSR predicts BEFORE.
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
  faCreditCard, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faEye, faShieldHalved,
  faIdCard, faPhone, faCamera, faReceipt,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runChargebackRiskScan,
  getOpenChargebackAlerts,
  getChargebackSummary,
  updateChargebackAction,
  readChargebackConfig,
  DEFAULT_CHARGEBACK_CONFIG,
  type ChargebackRiskAlert,
  type ChargebackRiskLevel,
} from "@/lib/chargeback-risk.service.ts";

const LEVEL_STYLE: Record<ChargebackRiskLevel, {
  bg: string; text: string; border: string; label: string; icon: any;
}> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   label: 'Critical', icon: faTriangleExclamation },
  high:     { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-400', label: 'High',     icon: faShieldHalved },
  medium:   { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  label: 'Medium',   icon: faEye },
  low:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Low',     icon: faCheckCircle },
};

const REC_LABEL: Record<string, string> = {
  require_signature: 'Require signature',
  verify_id: 'Verify ID',
  call_confirm: 'Call to confirm',
  photo_on_delivery: 'Photo on delivery',
  decline_transaction: 'Decline transaction',
  review_manually: 'Review manually',
  accept: 'Accept',
};

const REC_STYLE: Record<string, string> = {
  require_signature: 'bg-blue-100 text-blue-700',
  verify_id: 'bg-violet-100 text-violet-700',
  call_confirm: 'bg-amber-100 text-amber-700',
  photo_on_delivery: 'bg-emerald-100 text-emerald-700',
  decline_transaction: 'bg-rose-100 text-rose-700',
  review_manually: 'bg-orange-100 text-orange-700',
  accept: 'bg-neutral-100 text-neutral-600',
};

const REC_ICON: Record<string, any> = {
  require_signature: faIdCard,
  verify_id: faIdCard,
  call_confirm: faPhone,
  photo_on_delivery: faCamera,
  decline_transaction: faXmark,
  review_manually: faEye,
  accept: faCheckCircle,
};

const FACTOR_LABEL: Record<string, string> = {
  large_first_order: 'Large first order',
  late_night_high_value: 'Late-night high value',
  split_payment_high: 'Split payment',
  rush_delivery: 'Rush delivery',
  new_address: 'New address',
  prior_chargeback: 'Prior chargeback',
  cash_refund_pattern: 'Cash refund pattern',
};

export function ChargebackRiskScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ChargebackRiskAlert[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, high: 0, medium: 0, totalExposure: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_CHARGEBACK_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readChargebackConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getOpenChargebackAlerts(db),
        getChargebackSummary(db),
      ]);
      setAlerts(list);
      setSummary(sum);
    } catch (err) {
      console.error('[chargeback-report] reload failed', err);
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runChargebackRiskScan(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.alerts.length > 0
          ? `Scanned ${result.scanned} orders — ${result.alerts.length} at-risk (${withCurrency(result.alerts.length * config.avgCost)} exposure)`
          : `All clear — scanned ${result.scanned} orders, no chargeback risk detected`
      );
      await reload();
    } catch (err) {
      console.error('[chargeback-report] analyze failed', err);
      toast.error('Scan failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleAction = useCallback(async (alertId: string, action: string) => {
    try {
      await updateChargebackAction(db, alertId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Chargeback Risk Detection", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCreditCard} className="text-rose-600" />
              Chargeback Risk Detection
            </h1>
            <p className="text-sm text-neutral-500">
              AI predictive chargeback prevention — 7 risk factors + AI recs (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Scanning… (${progress.current}/${progress.total})` : 'Scan recent orders'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading alerts…</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No chargeback risk!</p>
            <p className="text-sm mt-1">All recent transactions look safe. Click "Scan" to recheck.</p>
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
                <div className="text-xs text-violet-600">At-risk orders</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Total exposure</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalExposure)}</div>
              </div>
            </div>

            {/* Alert list */}
            <div className="space-y-3">
              {alerts.map((alert, idx) => {
                const style = LEVEL_STYLE[alert.risk_level] ?? LEVEL_STYLE.medium;
                const factors = Object.entries(alert.risk_factors ?? {});
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">Order #{alert.order_number ?? alert.order_id?.slice(0, 8)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        {alert.customer_name && <span className="text-sm text-neutral-600">· {alert.customer_name}</span>}
                        {alert.payment_method && <span className="text-sm text-neutral-500 capitalize">· {alert.payment_method}</span>}
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-4">
                        <div>
                          <div className="text-xs text-neutral-500">Risk score</div>
                          <div className={`font-bold tabular-nums ${style.text}`}>{Math.round(alert.risk_score)}/100</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Order total</div>
                          <div className="font-bold text-neutral-700 tabular-nums">{withCurrency(alert.order_total)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Exposure</div>
                          <div className="font-bold text-rose-600 tabular-nums">{withCurrency(alert.est_chargeback_cost)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Risk factors */}
                    {factors.length > 0 && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <div className="text-xs font-medium text-neutral-600 mb-1">Risk factors ({factors.length}):</div>
                        <div className="space-y-0.5">
                          {factors.map(([fid, f]) => (
                            <div key={fid} className="text-xs text-neutral-700 flex gap-2">
                              <span className="font-mono font-bold tabular-nums text-rose-600">+{(f as any).weight}</span>
                              <span><strong>{FACTOR_LABEL[fid] ?? fid}:</strong> {(f as any).detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI insight */}
                    {alert.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{alert.ai_insight}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 items-center flex-wrap">
                      {alert.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[alert.ai_recommendation] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          <FontAwesomeIcon icon={REC_ICON[alert.ai_recommendation] ?? faEye} className="mr-1" />AI: {REC_LABEL[alert.ai_recommendation] ?? alert.ai_recommendation}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 flex-wrap">
                        <button onClick={() => alert.id && handleAction(alert.id, 'reviewed')}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faEye} /> Review
                        </button>
                        <button onClick={() => alert.id && handleAction(alert.id, 'accepted')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} /> Accept
                        </button>
                        <button onClick={() => alert.id && handleAction(alert.id, 'declined')}
                          className="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700 hover:bg-rose-200">
                          <FontAwesomeIcon icon={faXmark} /> Decline
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
              <span>Large order: <strong>&gt; {withCurrency(config.largeOrderThreshold)}</strong></span>
              <span>Late-night threshold: <strong>&gt; {withCurrency(config.lateNightThreshold)}</strong></span>
              <span>Split count: <strong>≥ {config.splitCountThreshold}</strong></span>
              <span>High risk: <strong>≥ {config.highRiskThreshold}</strong></span>
              <span>Critical risk: <strong>≥ {config.criticalThreshold}</strong></span>
              <span>Avg chargeback cost: <strong>{withCurrency(config.avgCost)}</strong></span>
              <span>7 risk factors</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default ChargebackRiskScreen;
