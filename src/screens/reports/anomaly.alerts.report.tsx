/**
 * Anomaly Detection Dashboard — real-time operational alerts.
 *
 * Research finding: Toast Smart Alerts $40+/mo (higher tier), Square
 * Anomaly Detection in Plus. POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (open critical, open warning, open info, resolved today)
 *   2. Filter chips (all/open/acknowledged/resolved)
 *   3. Alert list — each with severity badge, rule name, description, metric
 *      vs expected, AI insight + action, Acknowledge/Resolve buttons
 *   4. Run detection button (manually triggers all 9 rules)
 *
 * Placement: new route /reports/anomaly-alerts
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
  faBell, faTriangleExclamation, faInfoCircle, faCheckCircle,
  faRobot, faRotate, faLightbulb, faCheck, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  runAnomalyDetection,
  getOpenAlerts,
  getAllAlerts,
  updateAlertStatus,
  readAnomalyConfig,
  DEFAULT_ANOMALY_CONFIG,
  type OperationalAlert,
  type AlertSeverity,
  type AlertStatus,
} from "@/lib/anomaly-detection.service.ts";
import { useSecurity } from "@/hooks/useSecurity.ts";

const SEVERITY_STYLE: Record<AlertSeverity, { bg: string; text: string; border: string; icon: any }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-400', icon: faTriangleExclamation },
  warning:  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-400', icon: faBell },
  info:     { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-400', icon: faInfoCircle },
};

const STATUS_STYLE: Record<AlertStatus, string> = {
  open: 'bg-rose-100 text-rose-700',
  acknowledged: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  false_positive: 'bg-neutral-100 text-neutral-500',
};

export function AnomalyAlertsScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const { user } = useSecurity() as any;
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [filter, setFilter] = useState<'open' | 'all' | 'resolved'>('open');
  const [config, setConfig] = useState(DEFAULT_ANOMALY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readAnomalyConfig(settingsRows[0] ?? {}));
      const list = filter === 'open'
        ? await getOpenAlerts(db)
        : await getAllAlerts(db, 50);
      setAlerts(list);
    } catch (err) {
      console.error('[anomaly-report] reload failed', err);
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [db, filter]);

  useMemo(() => { reload(); }, [reload]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setProgress({ current: 0, total: 9 });
    try {
      const result = await runAnomalyDetection(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.triggered > 0
          ? `Detected ${result.triggered} new alert(s) — checked ${result.checked} rules`
          : `All clear — checked ${result.checked} rules, no anomalies detected`
      );
      await reload();
    } catch (err) {
      console.error('[anomaly-report] run failed', err);
      toast.error('Detection failed — see console');
    } finally {
      setRunning(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleAcknowledge = useCallback(async (alertId: string) => {
    try {
      await updateAlertStatus(db, alertId, 'acknowledged', user?.id?.toString?.());
      toast.success('Alert acknowledged');
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to acknowledge');
    }
  }, [db, user, reload]);

  const handleResolve = useCallback(async (alertId: string) => {
    try {
      await updateAlertStatus(db, alertId, 'resolved', user?.id?.toString?.(), 'Resolved by manager');
      toast.success('Alert resolved');
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to resolve');
    }
  }, [db, user, reload]);

  const stats = useMemo(() => {
    const open = alerts.filter(a => a.status === 'open');
    return {
      critical: open.filter(a => a.severity === 'critical').length,
      warning: open.filter(a => a.severity === 'warning').length,
      info: open.filter(a => a.severity === 'info').length,
      resolved: alerts.filter(a => a.status === 'resolved' || a.status === 'false_positive').length,
    };
  }, [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["Anomaly Alerts", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBell} className="text-rose-600" />
              Anomaly Alerts
            </h1>
            <p className="text-sm text-neutral-500">
              Real-time operational monitoring — 9 detection rules + AI insights for each alert
            </p>
          </div>
          <Button onClick={handleRun} disabled={running} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={running} />
            {running ? `Checking… (${progress.current}/${progress.total})` : 'Run detection'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading alerts…</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faTriangleExclamation} label="Critical" value={stats.critical} color="text-rose-600" />
              <SummaryCard icon={faBell} label="Warning" value={stats.warning} color="text-amber-600" />
              <SummaryCard icon={faInfoCircle} label="Info" value={stats.info} color="text-blue-600" />
              <SummaryCard icon={faCheckCircle} label="Resolved" value={stats.resolved} color="text-emerald-600" />
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 items-center">
              {(['open', 'all', 'resolved'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded text-sm capitalize transition-colors ${filter === f ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>
                  {f === 'open' ? `Open (${stats.critical + stats.warning + stats.info})` : f === 'all' ? 'All' : 'Resolved'}
                </button>
              ))}
            </div>

            {/* Alert list */}
            {alerts.length === 0 ? (
              <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
                <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
                <p className="text-lg font-medium text-emerald-600">All clear!</p>
                <p className="text-sm mt-1">No anomalies detected. Click "Run detection" to check again.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert, idx) => {
                  const style = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info;
                  return (
                    <div key={alert.id ?? idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <FontAwesomeIcon icon={style.icon} className={`text-xl ${style.text}`} />
                          <span className="font-semibold text-sm">{alert.rule_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[alert.status] ?? STATUS_STYLE.open}`}>
                            {alert.status}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${style.bg} ${style.text}`}>
                            {alert.severity}
                          </span>
                          <span className="text-xs text-neutral-500 capitalize">{alert.category}</span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-neutral-500">
                            {new Date(alert.detected_at as any).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-neutral-800 mb-2">{alert.description}</p>
                      <div className="flex gap-4 text-xs text-neutral-600 mb-2">
                        <span>Current: <strong className="tabular-nums">{alert.metric_value}</strong></span>
                        <span>Expected: <strong className="tabular-nums">{alert.expected_value}</strong></span>
                        <span>Threshold: <strong className="tabular-nums">{alert.threshold}</strong></span>
                        <span className={alert.deviation_pct < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          Deviation: <strong>{alert.deviation_pct > 0 ? '+' : ''}{alert.deviation_pct}%</strong>
                        </span>
                      </div>
                      {alert.ai_insight && (
                        <div className="bg-white/60 rounded p-2 mb-2">
                          <p className="text-xs text-violet-700 italic mb-1">💡 {alert.ai_insight}</p>
                          {alert.ai_action && (
                            <p className="text-xs text-neutral-600">→ {alert.ai_action}</p>
                          )}
                        </div>
                      )}
                      {alert.status === 'open' && (
                        <div className="flex gap-2">
                          <button onClick={() => alert.id && handleAcknowledge(alert.id)}
                            className="px-3 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                            <FontAwesomeIcon icon={faCheck} /> Acknowledge
                          </button>
                          <button onClick={() => alert.id && handleResolve(alert.id)}
                            className="px-3 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                            <FontAwesomeIcon icon={faCheckCircle} /> Resolve
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Detection: <strong>{config.enabled ? 'enabled' : 'disabled'}</strong></span>
              <span>AI insights: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Sales drop threshold: <strong>&lt; {config.salesDropPct}% of avg</strong></span>
              <span>Waste spike: <strong>&gt; {config.wasteSpikeMultiplier}× avg</strong></span>
              <span>Dedup window: <strong>{config.dedupWindowHours}h</strong></span>
              <span>9 detection rules: sales/waste/cashflow/inventory/sentiment/noshow/vendor/staffing/forecast</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon, label, value, color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default AnomalyAlertsScreen;
