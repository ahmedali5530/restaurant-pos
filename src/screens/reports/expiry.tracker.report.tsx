/**
 * AI Inventory Expiry Tracker — proactive expiry management dashboard.
 *
 * 67th POSR-exclusive differentiator — 40% of food waste happens because
 * items expire before use (ReFED).
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
  faClock, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faTag, faUtensils, faTruckFast, faHandHoldingHeart, faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runExpiryEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readExpiryConfig, DEFAULT_EXPIRY_CONFIG,
  type ExpiryTracker,
} from "@/lib/expiry-tracker.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  critical_3d:  { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTriangleExclamation, label: 'CRITICAL (≤3d)' },
  urgent_7d:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,               label: 'URGENT (≤7d)' },
  warning_14d:  { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faClock,               label: 'WARNING (≤14d)' },
  expired:      { bg: 'bg-rose-200',   text: 'text-rose-900',    icon: faTriangleExclamation, label: 'EXPIRED' },
  batch_recall: { bg: 'bg-rose-300',   text: 'text-rose-900',    icon: faTriangleExclamation, label: 'BATCH RECALL' },
};

const ACTION_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  markdown_30pct: { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: faTag,            label: 'Markdown 30%' },
  daily_special:  { bg: 'bg-violet-100',   text: 'text-violet-700',  icon: faUtensils,       label: 'Daily Special' },
  prep_priority:  { bg: 'bg-blue-100',    text: 'text-blue-700',   icon: faUtensils,       label: 'Prep Priority' },
  transfer_busy:  { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: faTruckFast,      label: 'Transfer Busy' },
  donate:         { bg: 'bg-pink-100',    text: 'text-pink-700',   icon: faHandHoldingHeart, label: 'Donate' },
  discard:        { bg: 'bg-rose-100',    text: 'text-rose-700',   icon: faTrash,          label: 'Discard' },
  monitor:        { bg: 'bg-neutral-100',  text: 'text-neutral-600', icon: faClock,         label: 'Monitor' },
};

const daysColor = (days: number): string => {
  if (days < 0) return 'text-rose-700';
  if (days <= 3) return 'text-rose-600';
  if (days <= 7) return 'text-amber-600';
  if (days <= 14) return 'text-yellow-600';
  return 'text-neutral-500';
};

export function ExpiryTrackerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ExpiryTracker[]>([]);
  const [summary, setSummary] = useState({ criticalCount: 0, totalAlerts: 0, totalCostAtRisk: 0, totalSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_EXPIRY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readExpiryConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[expiry-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runExpiryEngine(db, config);
      toast.success(result.alerts.length > 0
        ? `Found ${result.alerts.length} expiry alerts — ${result.alerts.filter(a => a.severity === 'critical').length} critical, ${withCurrency(result.alerts.reduce((s, a) => s + a.cost_at_risk, 0))} at risk`
        : `No expiry risks — all inventory fresh`);
      await reload();
    } catch (err) { console.error('[expiry-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'actioned' | 'used' | 'expired' | 'recalled') => {
    try { await updateAlertStatus(db, alertId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedAlerts = [...alerts].sort((a, b) => a.days_until_expiry - b.days_until_expiry);

  return (
    <Layout>
      <DocumentTitle parts={["Expiry Tracker", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faClock} className="text-rose-600" />
              AI Expiry Tracker
            </h1>
            <p className="text-sm text-neutral-500">
              Proactive expiry management — markdowns, specials, prep priority (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Scanning…' : 'Scan inventory'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faClock} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No expiry risks!</p>
            <p className="text-sm mt-1">All inventory is fresh. Click "Scan inventory" to check expiry dates.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Critical</div>
                <div className="text-3xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faClock} />Total alerts</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.totalAlerts}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-300 p-3 text-center">
                <div className="text-xs text-rose-600">Cost at risk</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalCostAtRisk)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Potential savings</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalSavings)}</div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faClock} className="text-rose-600" />
                  Expiry Timeline (sorted by urgency)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Item</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Quantity</th>
                      <th className="p-3 text-right">Days left</th>
                      <th className="p-3 text-right">Cost at risk</th>
                      <th className="p-3 text-left">Suggested action</th>
                      <th className="p-3 text-right">Est. savings</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAlerts.map((a, idx) => {
                      const ruleStyle = RULE_STYLE[a.rule_id] ?? RULE_STYLE.warning_14d;
                      const actionStyle = ACTION_STYLE[a.suggested_action ?? 'monitor'] ?? ACTION_STYLE.monitor;
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${a.severity === 'critical' ? 'bg-rose-500' : a.severity === 'high' ? 'bg-amber-500' : 'bg-yellow-400'}`}></span>
                              <span className="font-medium">{a.item_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{a.description}</p>
                            {a.batch_number && <p className="text-xs text-rose-500 mt-0.5">Batch: {a.batch_number}</p>}
                            {a.will_expire_before_used && <p className="text-xs text-amber-600 mt-0.5">⚠ Won't be consumed at current rate ({a.consumption_rate}/day)</p>}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${ruleStyle.bg} ${ruleStyle.text}`}>
                              <FontAwesomeIcon icon={ruleStyle.icon} className="mr-1" />{ruleStyle.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{a.quantity} {a.unit}</td>
                          <td className={`p-3 text-right tabular-nums font-bold ${daysColor(a.days_until_expiry)}`}>
                            {a.days_until_expiry < 0 ? `${Math.abs(a.days_until_expiry)}d ago` : `${a.days_until_expiry}d`}
                          </td>
                          <td className="p-3 text-right tabular-nums font-bold text-rose-600">{withCurrency(a.cost_at_risk)}</td>
                          <td className="p-3">
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${actionStyle.bg} ${actionStyle.text}`}>
                              <FontAwesomeIcon icon={actionStyle.icon} className="mr-1" />{actionStyle.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">
                            {a.est_savings > 0 ? withCurrency(a.est_savings) : '—'}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              {a.suggested_action === 'discard' ? (
                                <button onClick={() => a.id && handleStatus(a.id, 'expired')} className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 whitespace-nowrap font-medium">
                                  <FontAwesomeIcon icon={faTrash} className="mr-1" />Discard
                                </button>
                              ) : (
                                <button onClick={() => a.id && handleStatus(a.id, 'actioned')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap font-medium">
                                  <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Action
                                </button>
                              )}
                              <button onClick={() => a.id && handleStatus(a.id, 'used')} className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                                Used
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI insights */}
            {alerts.filter(a => a.ai_insight).slice(0, 5).map((a, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{a.item_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[a.rule_id].bg} ${RULE_STYLE[a.rule_id].text}`}>{a.rule_id.replace(/_/g, ' ')}</span>
                  {a.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{a.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{a.ai_insight}</p>
              </div>
            ))}

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Critical: <strong>{config.criticalDays}d</strong></span>
              <span>Urgent: <strong>{config.urgentDays}d</strong></span>
              <span>Warning: <strong>{config.warningDays}d</strong></span>
              <span>Markdown: <strong>{(config.markdownPct * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default ExpiryTrackerScreen;
