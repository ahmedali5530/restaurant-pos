/**
 * Order Fraud Detection Dashboard — internal theft/collusion alerts + AI recs.
 *
 * 6th POSR-exclusive differentiator — Toast, Square, Lightspeed have NO
 * order-level fraud detection. They only do basic void logging.
 *
 * 7 detection rules:
 *   excessive_discounts, cash_discount_pattern, after_hours_activity,
 *   duplicate_orders, high_refund_rate, split_tender_anomaly, large_cash_near_close
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
  faShieldHalved, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faEye, faUserSecret,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runFraudDetection,
  getOpenFraudAlerts,
  readFraudConfig,
  DEFAULT_FRAUD_CONFIG,
  type OrderFraudAlert,
  type FraudSeverity,
} from "@/lib/order-fraud-detection.service.ts";

const SEVERITY_STYLE: Record<FraudSeverity, { bg: string; text: string; border: string; icon: any }> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   icon: faTriangleExclamation },
  warning:  { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  icon: faShieldHalved },
  info:     { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-400',   icon: faEye },
};

const REC_LABEL: Record<string, string> = {
  investigate: 'Investigate', audit_employee: 'Audit employee',
  review_camera: 'Review camera', require_pin: 'Require PIN',
  restrict_perms: 'Restrict perms', dismiss: 'Dismiss',
};

const RULE_LABEL: Record<string, string> = {
  excessive_discounts: 'Excessive Discounts',
  cash_discount_pattern: 'Cash + Discount Pattern',
  after_hours_activity: 'After-Hours Activity',
  duplicate_orders: 'Duplicate Orders',
  high_refund_rate: 'High Refund Rate',
  split_tender_anomaly: 'Split Tender Anomaly',
  large_cash_near_close: 'Large Cash Near Close',
};

export function OrderFraudScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<OrderFraudAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_FRAUD_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readFraudConfig(settingsRows[0] ?? {}));
      const list = await getOpenFraudAlerts(db);
      setAlerts(list);
    } catch (err) {
      console.error('[fraud-report] reload failed', err);
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 7 });
    try {
      const result = await runFraudDetection(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.alerts.length > 0
          ? `Detected ${result.alerts.length} fraud alerts — estimated loss: ${withCurrency(result.alerts.reduce((s, a) => s + a.estimated_loss, 0))}`
          : `All clear — checked ${result.checked} rules, no fraud patterns detected`
      );
      await reload();
    } catch (err) {
      console.error('[fraud-report] analyze failed', err);
      toast.error('Detection failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: string) => {
    try {
      const { updateFraudStatus } = await import('@/lib/order-fraud-detection.service.ts');
      await updateFraudStatus(db, alertId, status);
      toast.success(`Alert marked as ${status}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  const stats = useMemo(() => ({
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    totalLoss: alerts.reduce((s, a) => s + a.estimated_loss, 0),
    flaggedUsers: new Set(alerts.map(a => a.user_id).filter(Boolean)).size,
  }), [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["Order Fraud Detection", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUserSecret} className="text-rose-600" />
              Order Fraud Detection
            </h1>
            <p className="text-sm text-neutral-500">
              Internal theft & collusion detection — 7 detection rules + AI investigation recommendations
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
            <p className="text-lg font-medium text-emerald-600">No fraud alerts!</p>
            <p className="text-sm mt-1">All clear. Click "Run detection" to scan again.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{stats.critical}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Warning</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{stats.warning}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Flagged staff</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{stats.flaggedUsers}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Est. loss</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(stats.totalLoss)}</div>
              </div>
            </div>

            {/* Alert list */}
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
                        {alert.user_name && (
                          <span className="text-sm text-neutral-600">
                            · <FontAwesomeIcon icon={faUserSecret} className="mr-1 text-neutral-400" />
                            {alert.user_name}
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-neutral-500">Est. loss</div>
                        <div className="font-bold text-rose-600 tabular-nums">{withCurrency(alert.estimated_loss)}</div>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-700 mb-2">{alert.description}</p>
                    <div className="flex gap-4 text-xs text-neutral-500 mb-2">
                      <span>Metric: <strong className="tabular-nums">{alert.metric_value}</strong></span>
                      <span>Expected: <strong className="tabular-nums">{alert.expected_value}</strong></span>
                      <span>Deviation: <strong className="tabular-nums">{alert.deviation_pct}%</strong></span>
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
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          alert.ai_recommendation === 'investigate' ? 'bg-amber-100 text-amber-700' :
                          alert.ai_recommendation === 'audit_employee' ? 'bg-rose-100 text-rose-700' :
                          alert.ai_recommendation === 'review_camera' ? 'bg-violet-100 text-violet-700' :
                          alert.ai_recommendation === 'require_pin' ? 'bg-blue-100 text-blue-700' :
                          alert.ai_recommendation === 'restrict_perms' ? 'bg-neutral-800 text-white' :
                          'bg-neutral-100 text-neutral-600'
                        }`}>
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

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Discount threshold: <strong>{(config.discountThreshold * 100).toFixed(1)}%</strong></span>
              <span>Refund multiplier: <strong>{config.refundMultiplier}x avg</strong></span>
              <span>After-hours: <strong>{config.afterHoursStart}:00–{config.afterHoursEnd}:00</strong></span>
              <span>Large cash: <strong>≥ {withCurrency(config.largeCashThreshold)}</strong></span>
              <span>Near-close: <strong>{config.closeMinutes} min</strong></span>
              <span>7 detection rules</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default OrderFraudScreen;
