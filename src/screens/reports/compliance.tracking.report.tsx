/**
 * Compliance Tracking Dashboard — document expiry prediction + AI recs.
 *
 * 28th POSR-exclusive differentiator — Toast, Square, Lightspeed have NO
 * document expiry tracking. POSR predicts expiry + AI recommendations.
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
  faFileShield, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faClock,
  faIdCard, faUserXmark, faCalendarXmark,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runComplianceScan,
  getActiveAlerts,
  getComplianceSummary,
  updateComplianceAction,
  readComplianceConfig,
  DEFAULT_COMPLIANCE_CONFIG,
  type ComplianceAlert,
  type ComplianceStatus,
  type ComplianceRecommendation,
} from "@/lib/compliance-tracking.service.ts";

const STATUS_STYLE: Record<ComplianceStatus, { bg: string; text: string; border: string; label: string }> = {
  expired:              { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-500',    label: 'Expired' },
  expiring_critical:   { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-400', label: 'Critical (< 7d)' },
  expiring_soon:       { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  label: 'Soon (< 30d)' },
  expiring_warning:    { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-400',   label: 'Warning (< 60d)' },
  no_document:        { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-500',   label: 'No document' },
};

const REC_LABEL: Record<ComplianceRecommendation, string> = {
  renew_now: 'Renew now',
  schedule_renewal: 'Schedule renewal',
  suspend_employee: 'Suspend employee',
  notify_employee: 'Notify employee',
  no_action: 'No action',
};

const REC_STYLE: Record<ComplianceRecommendation, string> = {
  renew_now: 'bg-rose-100 text-rose-700',
  schedule_renewal: 'bg-amber-100 text-amber-700',
  suspend_employee: 'bg-neutral-800 text-white',
  notify_employee: 'bg-blue-100 text-blue-700',
  no_action: 'bg-neutral-100 text-neutral-600',
};

const formatDate = (d: Date | string): string => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export function ComplianceTrackingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [summary, setSummary] = useState({
    total: 0, expired: 0, expiringCritical: 0, expiringSoon: 0,
    expiringWarning: 0, totalFineRisk: 0, complianceRate: 100,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_COMPLIANCE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readComplianceConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getActiveAlerts(db),
        getComplianceSummary(db),
      ]);
      setAlerts(list);
      setSummary(sum);
    } catch (err) {
      console.error('[compliance-report] reload failed', err);
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
      const result = await runComplianceScan(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.alerts.length > 0
          ? `Scanned ${result.scanned} documents — ${result.alerts.filter(a => a.status === 'expired').length} expired, ${result.alerts.filter(a => a.status === 'expiring_critical').length} critical`
          : `All compliance documents up to date`
      );
      await reload();
    } catch (err) {
      console.error('[compliance-report] analyze failed', err);
      toast.error('Scan failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleAction = useCallback(async (alertId: string, action: string) => {
    try {
      await updateComplianceAction(db, alertId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Compliance Tracking", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faFileShield} className="text-emerald-600" />
              Compliance Tracking
            </h1>
            <p className="text-sm text-neutral-500">
              AI document expiry prediction — food handler certs, alcohol permits, health cards + AI recs (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Scanning… (${progress.current}/${progress.total})` : 'Scan documents'}
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
            <p className="text-lg font-medium text-emerald-600">All documents compliant!</p>
            <p className="text-sm mt-1">No expiring or expired documents. Click "Scan" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center col-span-2 md:col-span-1">
                <div className="text-xs text-emerald-600">Compliance rate</div>
                <div className={`text-3xl font-bold tabular-nums ${summary.complianceRate >= 90 ? 'text-emerald-700' : summary.complianceRate >= 70 ? 'text-amber-700' : 'text-rose-700'}`}>
                  {Math.round(summary.complianceRate)}%
                </div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Expired</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.expired}</div>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                <div className="text-xs text-orange-600">Critical</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{summary.expiringCritical}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Soon</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.expiringSoon}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Warning</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.expiringWarning}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Total alerts</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Fine risk</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalFineRisk)}</div>
              </div>
            </div>

            {/* Alert list */}
            <div className="space-y-3">
              {alerts.map((alert, idx) => {
                const style = STATUS_STYLE[alert.status] ?? STATUS_STYLE.expiring_warning;
                return (
                  <div key={idx} className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faFileShield} className={`text-xl ${style.text}`} />
                        <span className="font-semibold">{alert.employee_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                        {alert.position && <span className="text-sm text-neutral-600">· {alert.position}</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Fine risk</div>
                        <div className="font-bold text-rose-600 tabular-nums">{withCurrency(alert.est_fine_risk)}</div>
                      </div>
                    </div>

                    <div className="flex gap-4 text-xs text-neutral-600 mb-2">
                      <span><FontAwesomeIcon icon={faIdCard} className="mr-1 text-neutral-400" />{alert.document_title}</span>
                      {alert.document_category && <span className="capitalize">· {alert.document_category.replace(/_/g, ' ')}</span>}
                      <span><FontAwesomeIcon icon={faCalendarXmark} className="mr-1 text-neutral-400" />
                        {alert.expiry_date ? formatDate(alert.expiry_date) : 'No expiry date'}
                      </span>
                      <span><FontAwesomeIcon icon={faClock} className="mr-1 text-neutral-400" />
                        {alert.days_until_expiry < 0 ? `${Math.abs(alert.days_until_expiry)}d ago` : `${alert.days_until_expiry}d left`}
                      </span>
                    </div>

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
                        <button onClick={() => alert.id && handleAction(alert.id, 'renewed')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} /> Renewed
                        </button>
                        <button onClick={() => alert.id && handleAction(alert.id, 'scheduled')}
                          className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200">
                          <FontAwesomeIcon icon={faClock} /> Scheduled
                        </button>
                        <button onClick={() => alert.id && handleAction(alert.id, 'notified')}
                          className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faIdCard} /> Notified
                        </button>
                        <button onClick={() => alert.id && handleAction(alert.id, 'suspended')}
                          className="px-2 py-1 rounded text-xs bg-neutral-200 text-neutral-700 hover:bg-neutral-300">
                          <FontAwesomeIcon icon={faUserXmark} /> Suspended
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
              <span>Critical: <strong>&lt; {config.criticalDays}d</strong></span>
              <span>Soon: <strong>&lt; {config.soonDays}d</strong></span>
              <span>Warning: <strong>&lt; {config.warningDays}d</strong></span>
              <span>Avg fine: <strong>{withCurrency(config.avgFine)}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default ComplianceTrackingScreen;
