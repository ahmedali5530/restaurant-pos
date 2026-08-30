/**
 * Abandoned Cart Recovery Dashboard — detect and recover stale open orders.
 *
 * 26th POSR-exclusive differentiator — $50B/year lost to abandoned orders.
 * Toast and Square have NO abandoned cart detection.
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
  faCartShopping, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faPhone, faClock,
  faUtensils, faDollarSign, faHandshake, faTag,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runAbandonedCartScan,
  getActiveAlerts,
  getAbandonedSummary,
  updateAbandonedAction,
  readAbandonedConfig,
  DEFAULT_ABANDONED_CONFIG,
  type AbandonedCartAlert,
  type RecoveryLevel,
  type RecoveryRecommendation,
  type AbandonedTrigger,
} from "@/lib/abandoned-cart.service.ts";

const LEVEL_STYLE: Record<RecoveryLevel, { bg: string; text: string; border: string; label: string }> = {
  high:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'High recovery' },
  medium: { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  label: 'Medium' },
  low:    { bg: 'bg-rose-50',    text: 'text-rose-700',   border: 'border-rose-500',   label: 'Low recovery' },
};

const TRIGGER_LABEL: Record<AbandonedTrigger, string> = {
  stale_open: 'Stale open order',
  partial_order: 'Partial order',
  suspended_items: 'Suspended items',
  draft_abandoned: 'Draft abandoned',
};

const REC_LABEL: Record<RecoveryRecommendation, string> = {
  call_customer: 'Call customer',
  send_reminder: 'Send reminder',
  hold_order: 'Hold order',
  cancel_and_apologize: 'Cancel + apologize',
  offer_discount: 'Offer discount',
  no_action: 'No action',
};

const REC_STYLE: Record<RecoveryRecommendation, string> = {
  call_customer: 'bg-emerald-100 text-emerald-700',
  send_reminder: 'bg-blue-100 text-blue-700',
  hold_order: 'bg-amber-100 text-amber-700',
  cancel_and_apologize: 'bg-rose-100 text-rose-700',
  offer_discount: 'bg-violet-100 text-violet-700',
  no_action: 'bg-neutral-100 text-neutral-600',
};

export function AbandonedCartScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<AbandonedCartAlert[]>([]);
  const [summary, setSummary] = useState({ total: 0, high: 0, medium: 0, low: 0, totalRecoverableRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_ABANDONED_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readAbandonedConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getActiveAlerts(db),
        getAbandonedSummary(db),
      ]);
      setAlerts(list);
      setSummary(sum);
    } catch (err) {
      console.error('[abandoned-report] reload failed', err);
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
      const result = await runAbandonedCartScan(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.alerts.length > 0
          ? `Found ${result.alerts.length} abandoned carts — ${withCurrency(summary.totalRecoverableRevenue)} recoverable`
          : `No abandoned carts detected`
      );
      await reload();
    } catch (err) {
      console.error('[abandoned-report] analyze failed', err);
      toast.error('Scan failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload, summary.totalRecoverableRevenue]);

  const handleAction = useCallback(async (alertId: string, action: string) => {
    try {
      await updateAbandonedAction(db, alertId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Abandoned Cart", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCartShopping} className="text-amber-600" />
              Abandoned Cart Recovery
            </h1>
            <p className="text-sm text-neutral-500">
              AI abandoned order detection — recovery scoring + AI recs (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Scanning… (${progress.current}/${progress.total})` : 'Scan carts'}
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
            <p className="text-lg font-medium text-emerald-600">No abandoned carts!</p>
            <p className="text-sm mt-1">All orders completing normally. Click "Scan" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">High recovery</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.high}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Medium</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.medium}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Low recovery</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.low}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Total carts</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Recoverable</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalRecoverableRevenue)}</div>
              </div>
            </div>

            {/* Alert list */}
            <div className="space-y-3">
              {alerts.map((alert, idx) => {
                const style = LEVEL_STYLE[alert.recovery_level] ?? LEVEL_STYLE.medium;
                const factors = Object.entries(alert.recovery_factors ?? {});
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faCartShopping} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">Order #{alert.order_number ?? alert.order_id?.slice(0, 8)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        <span className="text-sm text-neutral-500 capitalize">· {TRIGGER_LABEL[alert.trigger_reason] ?? alert.trigger_reason}</span>
                        {alert.customer_name && <span className="text-sm text-neutral-600">· {alert.customer_name}</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Recovery score</div>
                        <div className={`font-bold tabular-nums ${style.text}`}>{alert.recovery_score}/100</div>
                      </div>
                    </div>

                    <div className="flex gap-4 text-xs text-neutral-600 mb-2">
                      <span><FontAwesomeIcon icon={faClock} className="mr-1 text-neutral-400" />{alert.minutes_stale} min stale</span>
                      <span><FontAwesomeIcon icon={faUtensils} className="mr-1 text-neutral-400" />{alert.item_count} items</span>
                      <span><FontAwesomeIcon icon={faDollarSign} className="mr-1 text-neutral-400" />{withCurrency(alert.order_total)}</span>
                      {alert.server_name && <span>· Server: {alert.server_name}</span>}
                    </div>

                    {factors.length > 0 && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <div className="text-xs font-medium text-neutral-600 mb-1">Recovery factors ({factors.length}):</div>
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

                    {alert.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{alert.ai_insight}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 items-center flex-wrap">
                      {alert.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[alert.ai_recommendation]}`}>
                          AI: {REC_LABEL[alert.ai_recommendation]}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 flex-wrap">
                        {alert.customer_phone && (
                          <button onClick={() => alert.id && handleAction(alert.id, 'called')}
                            className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                            <FontAwesomeIcon icon={faPhone} /> Call
                          </button>
                        )}
                        <button onClick={() => alert.id && handleAction(alert.id, 'reminded')}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faClock} /> Remind
                        </button>
                        <button onClick={() => alert.id && handleAction(alert.id, 'discounted')}
                          className="px-2 py-1 rounded text-xs bg-violet-100 text-violet-700 hover:bg-violet-200">
                          <FontAwesomeIcon icon={faTag} /> Discount
                        </button>
                        <button onClick={() => alert.id && handleAction(alert.id, 'cancelled')}
                          className="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700 hover:bg-rose-200">
                          <FontAwesomeIcon icon={faXmark} /> Cancel
                        </button>
                        <button onClick={() => alert.id && handleAction(alert.id, 'recovered')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} /> Recovered
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
              <span>Stale threshold: <strong>{config.staleThresholdMin} min</strong></span>
              <span>Draft threshold: <strong>{config.draftThresholdMin} min</strong></span>
              <span>High recovery: <strong>≥ {config.highRecoveryThreshold}</strong></span>
              <span>Max alerts: <strong>{config.maxAlerts}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default AbandonedCartScreen;
