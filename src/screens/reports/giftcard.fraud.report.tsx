/**
 * Gift Card Fraud Detection Dashboard — suspicious activity detection + AI recs.
 *
 * 29th POSR-exclusive differentiator — Toast and Square have basic gift card
 * tracking but NO fraud pattern detection.
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
  faGiftCard, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faEye, faUserSecret,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runGiftCardFraudScan,
  getOpenAlerts,
  getSummary,
  updateStatus,
  readGiftCardFraudConfig,
  DEFAULT_GIFTCARD_FRAUD_CONFIG,
  type GiftCardFraudAlert,
  type GiftCardFraudSeverity,
  type GiftCardFraudRecommendation,
} from "@/lib/giftcard-fraud.service.ts";

const SEVERITY_STYLE: Record<GiftCardFraudSeverity, { bg: string; text: string; border: string; icon: any }> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   icon: faTriangleExclamation },
  warning:  { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  icon: faGiftCard },
  info:     { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-400',   icon: faEye },
};

const REC_LABEL: Record<GiftCardFraudRecommendation, string> = {
  freeze_card: 'Freeze card', investigate_staff: 'Investigate staff',
  refund_customer: 'Refund customer', void_transaction: 'Void transaction',
  monitor: 'Monitor', dismiss: 'Dismiss',
};

const REC_STYLE: Record<GiftCardFraudRecommendation, string> = {
  freeze_card: 'bg-rose-100 text-rose-700',
  investigate_staff: 'bg-violet-100 text-violet-700',
  refund_customer: 'bg-blue-100 text-blue-700',
  void_transaction: 'bg-orange-100 text-orange-700',
  monitor: 'bg-amber-100 text-amber-700',
  dismiss: 'bg-neutral-100 text-neutral-600',
};

const RULE_LABEL: Record<string, string> = {
  rapid_drain: 'Rapid Drain',
  balance_manipulation: 'Balance Manipulation',
  multiple_cards: 'Multiple Cards',
  high_value_first_use: 'High-Value First Use',
  after_hours_redemption: 'After-Hours Redemption',
  staff_issuance_spike: 'Staff Issuance Spike',
};

export function GiftCardFraudScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<GiftCardFraudAlert[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, warning: 0, totalLoss: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_GIFTCARD_FRAUD_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readGiftCardFraudConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getOpenAlerts(db), getSummary(db)]);
      setAlerts(list);
      setSummary(sum);
    } catch (err) {
      console.error('[giftcard-fraud-report] reload failed', err);
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 6 });
    try {
      const result = await runGiftCardFraudScan(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.alerts.length > 0
          ? `Detected ${result.alerts.length} gift card fraud alerts — ${withCurrency(result.alerts.reduce((s, a) => s + a.estimated_loss, 0))} est. loss`
          : `All clear — checked ${result.checked} rules, no fraud detected`
      );
      await reload();
    } catch (err) {
      console.error('[giftcard-fraud-report] analyze failed', err);
      toast.error('Scan failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: string) => {
    try {
      await updateStatus(db, alertId, status);
      toast.success(`Alert marked as ${status}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Gift Card Fraud Detection", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faGiftCard} className="text-rose-600" />
              Gift Card Fraud Detection
            </h1>
            <p className="text-sm text-neutral-500">
              AI suspicious activity detection — 6 rules + AI recommendations (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Detecting… (${progress.current}/${progress.total})` : 'Run detection'}
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
            <p className="text-lg font-medium text-emerald-600">No gift card fraud!</p>
            <p className="text-sm mt-1">All clear. Click "Run detection" to scan again.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.critical}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Warning</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.warning}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Open alerts</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Est. loss</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalLoss)}</div>
              </div>
            </div>

            <div className="space-y-3">
              {alerts.map((alert, idx) => {
                const style = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.warning;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{RULE_LABEL[alert.rule_id] ?? alert.rule_id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {alert.severity}
                        </span>
                        {alert.gift_card_code && <span className="text-sm text-neutral-600">· card: {alert.gift_card_code}</span>}
                        {alert.staff_name && (
                          <span className="text-sm text-neutral-600">
                            · <FontAwesomeIcon icon={faUserSecret} className="mr-1 text-neutral-400" />{alert.staff_name}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Est. loss</div>
                        <div className="font-bold text-rose-600 tabular-nums">{withCurrency(alert.estimated_loss)}</div>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-700 mb-2">{alert.description}</p>
                    <div className="flex gap-4 text-xs text-neutral-500 mb-2">
                      <span>Metric: <strong className="tabular-nums">{alert.metric_value}</strong></span>
                      <span>Expected: <strong className="tabular-nums">{alert.expected_value}</strong></span>
                    </div>
                    {alert.ai_insight && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{alert.ai_insight}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      {alert.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[alert.ai_recommendation] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          AI: {REC_LABEL[alert.ai_recommendation] ?? alert.ai_recommendation}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => alert.id && handleStatus(alert.id, 'investigating')}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faEye} /> Investigate
                        </button>
                        <button onClick={() => alert.id && handleStatus(alert.id, 'resolved')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} /> Resolve
                        </button>
                        <button onClick={() => alert.id && handleStatus(alert.id, 'false_positive')}
                          className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          <FontAwesomeIcon icon={faXmark} /> Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Rapid drain: <strong>{(config.rapidDrainPct * 100).toFixed(0)}%</strong></span>
              <span>High value: <strong>&gt; {withCurrency(config.highValueThreshold)}</strong></span>
              <span>Max cards: <strong>≥ {config.maxCardsPerCustomer}</strong></span>
              <span>6 detection rules</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default GiftCardFraudScreen;
