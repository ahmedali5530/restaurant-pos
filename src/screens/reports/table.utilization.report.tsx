/**
 * Table Utilization Optimization Dashboard — analyze occupancy patterns.
 *
 * 40th POSR-exclusive differentiator — restaurants waste 15-25% of seating
 * capacity. POSR analyzes occupancy patterns + AI recommendations.
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
  faChair, faTriangleExclamation, faRotate, faLightbulb,
  faCheckCircle, faXmark, faEye, faClock, faUsers, faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runTableUtilScan, getOpenAlerts, getSummary, updateStatus,
  readTableUtilConfig, DEFAULT_TABLE_UTIL_CONFIG,
  type TableUtilizationAlert, type TableUtilSeverity, type TableUtilRecommendation,
} from "@/lib/table-utilization.service.ts";

const SEVERITY_STYLE: Record<TableUtilSeverity, { bg: string; text: string; border: string; icon: any }> = {
  critical: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-500', icon: faTriangleExclamation },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-400', icon: faChair },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-400', icon: faEye },
};

const REC_LABEL: Record<TableUtilRecommendation, string> = {
  reallocate_tables: 'Reallocate tables', change_capacity: 'Change capacity',
  combine_tables: 'Combine tables', remove_table: 'Remove table',
  add_tables: 'Add tables', monitor: 'Monitor',
};

const RULE_LABEL: Record<string, string> = {
  underutilized: 'Underutilized', high_idle: 'High Idle Time',
  capacity_mismatch: 'Capacity Mismatch',
};

export function TableUtilizationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<TableUtilizationAlert[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, warning: 0, totalLoss: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TABLE_UTIL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTableUtilConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getOpenAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[table-util-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTableUtilScan(db, config);
      toast.success(result.alerts.length > 0
        ? `Scanned ${result.scanned} tables — ${result.alerts.length} utilization issues, ${withCurrency(result.alerts.reduce((s, a) => s + a.est_revenue_loss, 0))} est. loss`
        : `All tables well utilized!`);
      await reload();
    } catch (err) { console.error('[table-util-report] analyze failed', err); toast.error('Scan failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: string) => {
    try { await updateStatus(db, alertId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Table Utilization", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChair} className="text-amber-600" />
              Table Utilization Optimization
            </h1>
            <p className="text-sm text-neutral-500">
              AI occupancy pattern analysis — find wasted seating capacity (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Analyze tables'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">All tables well utilized!</p>
            <p className="text-sm mt-1">No utilization issues. Click "Analyze tables" to recheck.</p>
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
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Est. loss</div>
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
                        <span className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>{alert.severity}</span>
                        {alert.table_name && <span className="text-sm text-neutral-600">· Table: {alert.table_name}</span>}
                        {alert.floor && <span className="text-sm text-neutral-500">· {alert.floor}</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Est. loss</div>
                        <div className="font-bold text-rose-600 tabular-nums">{withCurrency(alert.est_revenue_loss)}</div>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-700 mb-2">{alert.description}</p>
                    <div className="flex gap-4 text-xs text-neutral-500 mb-2">
                      <span>Utilization: <strong className="tabular-nums">{alert.utilization_pct}%</strong></span>
                      <span><FontAwesomeIcon icon={faClock} className="mr-1" />Idle: <strong className="tabular-nums">{alert.avg_idle_minutes}min</strong></span>
                      {alert.avg_party_size != null && <span><FontAwesomeIcon icon={faUsers} className="mr-1" />Party: <strong className="tabular-nums">{alert.avg_party_size}</strong></span>}
                      <span>Mismatch: <strong className="tabular-nums">{alert.mismatch_score}/100</strong></span>
                    </div>
                    {alert.ai_insight && (
                      <div className="bg-white/60 rounded p-2 mb-2">
                        <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{alert.ai_insight}</p>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      {alert.ai_recommendation && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-violet-100 text-violet-700">
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
              <span>Low utilization: <strong>&lt; {(config.lowThreshold * 100).toFixed(0)}%</strong></span>
              <span>High idle: <strong>&gt; {config.highIdleMin}min</strong></span>
              <span>3 detection rules</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default TableUtilizationScreen;
