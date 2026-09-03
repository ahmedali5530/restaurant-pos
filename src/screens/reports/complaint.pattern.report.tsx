/**
 * Complaint Pattern Detection Dashboard — find recurring complaint patterns.
 *
 * 37th POSR-exclusive differentiator — Toast, Square analyze individual
 * reviews but DON'T detect cross-review patterns. POSR finds patterns.
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
  faCommentDots, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faEye, faUtensils, faClock,
} from "@fortawesome/free-solid-svg-icons";
import {
  runComplaintPatternScan, getOpenAlerts, getSummary, updateStatus,
  readComplaintConfig, DEFAULT_COMPLAINT_CONFIG,
  type ComplaintPatternAlert, type ComplaintSeverity, type ComplaintRecommendation,
} from "@/lib/complaint-pattern.service.ts";

const SEVERITY_STYLE: Record<ComplaintSeverity, { bg: string; text: string; border: string; icon: any }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-500', icon: faTriangleExclamation },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-400', icon: faCommentDots },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-400', icon: faEye },
};

const REC_LABEL: Record<ComplaintRecommendation, string> = {
  address_root_cause: 'Address root cause', retrain_staff: 'Retrain staff',
  adjust_recipe: 'Adjust recipe', add_staffing: 'Add staffing',
  respond_now: 'Respond now', monitor: 'Monitor',
};

const REC_STYLE: Record<ComplaintRecommendation, string> = {
  address_root_cause: 'bg-rose-100 text-rose-700', retrain_staff: 'bg-blue-100 text-blue-700',
  adjust_recipe: 'bg-violet-100 text-violet-700', add_staffing: 'bg-amber-100 text-amber-700',
  respond_now: 'bg-emerald-100 text-emerald-700', monitor: 'bg-neutral-100 text-neutral-600',
};

const RULE_LABEL: Record<string, string> = {
  recurring_theme: 'Recurring Theme',
  item_complaint: 'Item Complaint',
  time_correlated: 'Time-Correlated',
  declining_trend: 'Declining Trend',
  unresponded_critical: 'Unresponded Critical',
};

export function ComplaintPatternScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ComplaintPatternAlert[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, warning: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_COMPLAINT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readComplaintConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getOpenAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[complaint-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true); setProgress({ current: 0, total: 5 });
    try {
      const result = await runComplaintPatternScan(db, config, (current, total) => setProgress({ current, total }));
      toast.success(result.alerts.length > 0
        ? `Detected ${result.alerts.length} complaint patterns — ${result.alerts.filter(a => a.severity === 'critical').length} critical`
        : `All clear — checked ${result.checked} rules, no patterns detected`);
      await reload();
    } catch (err) { console.error('[complaint-report] analyze failed', err); toast.error('Scan failed — see console'); }
    finally { setAnalyzing(false); setProgress({ current: 0, total: 0 }); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: string) => {
    try { await updateStatus(db, alertId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Complaint Pattern", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCommentDots} className="text-amber-600" />
              Complaint Pattern Detection
            </h1>
            <p className="text-sm text-neutral-500">
              AI recurring complaint pattern detection — 5 rules + AI recommendations (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Detecting… (${progress.current}/${progress.total})` : 'Detect patterns'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading…</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No complaint patterns detected!</p>
            <p className="text-sm mt-1">Reviews look clean. Click "Detect patterns" to recheck.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
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
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>{alert.severity}</span>
                        {alert.theme && <span className="text-sm text-neutral-600">· theme: {alert.theme}</span>}
                        {alert.item_name && <span className="text-sm text-neutral-600">· <FontAwesomeIcon icon={faUtensils} className="mr-1" />{alert.item_name}</span>}
                        {alert.hour_of_day != null && <span className="text-sm text-neutral-600">· <FontAwesomeIcon icon={faClock} className="mr-1" />{alert.hour_of_day}:00</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Complaints</div>
                        <div className="font-bold tabular-nums text-rose-600">{alert.complaint_count}</div>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-700 mb-2">{alert.description}</p>
                    <div className="flex gap-4 text-xs text-neutral-500 mb-2">
                      {alert.avg_rating > 0 && <span>Avg rating: <strong className="tabular-nums">{alert.avg_rating}/5</strong></span>}
                      {alert.trend_pct !== 0 && <span>Trend: <strong className={`tabular-nums ${alert.trend_pct > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{alert.trend_pct > 0 ? '+' : ''}{alert.trend_pct}%</strong></span>}
                    </div>
                    {alert.ai_insight && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{alert.ai_insight}</p>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      {alert.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[alert.ai_recommendation] ?? 'bg-neutral-100 text-neutral-600'}`}>
                          AI: {REC_LABEL[alert.ai_recommendation] ?? alert.ai_recommendation}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => alert.id && handleStatus(alert.id, 'investigating')} className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                          <FontAwesomeIcon icon={faEye} /> Investigate
                        </button>
                        <button onClick={() => alert.id && handleStatus(alert.id, 'resolved')} className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} /> Resolve
                        </button>
                        <button onClick={() => alert.id && handleStatus(alert.id, 'false_positive')} className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
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
              <span>Min count: <strong>{config.minCount} complaints</strong></span>
              <span>5 detection rules</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default ComplaintPatternScreen;
