/**
 * AI Equipment Maintenance Predictor — failure predictions dashboard.
 *
 * 54th POSR-exclusive differentiator — restaurants lose $15k-$30k/year to
 * unexpected equipment failures (NRA).
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
  faWrench, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faClock, faDollarSign, faGear,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runEquipMaintEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readEquipMaintConfig, DEFAULT_EQUIP_MAINT_CONFIG,
  type EquipmentMaintenanceAlert,
} from "@/lib/equipment-maintenance.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  end_of_life:          { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTriangleExclamation, label: 'END OF LIFE' },
  performance_drift:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGear,                label: 'PERFORMANCE DRIFT' },
  overdue_maintenance:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,               label: 'OVERDUE' },
  high_usage_wear:      { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faGear,                label: 'HIGH USAGE' },
  failure_pattern:      { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'FAILURE PATTERN' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const TYPE_ICON: Record<string, string> = {
  fridge: '🧊', freezer: '❄️', oven: '🔥', fryer: '🍳', dishwasher: '🍽️',
  ice_maker: '🧊', pos_terminal: '💻', printer: '🖨️', coffee_machine: '☕', hvac: '🌬️', other: '🔧',
};

export function EquipmentMaintenanceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<EquipmentMaintenanceAlert[]>([]);
  const [summary, setSummary] = useState({ criticalCount: 0, totalAlerts: 0, totalRepairCost: 0, totalSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_EQUIP_MAINT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readEquipMaintConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[equip-maint-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runEquipMaintEngine(db, config);
      toast.success(result.alerts.length > 0
        ? `Generated ${result.alerts.length} maintenance alerts — ${result.alerts.filter(a => a.severity === 'critical').length} critical, ${result.alerts.filter(a => a.severity === 'high').length} high`
        : `No maintenance alerts — all equipment healthy`);
      await reload();
    } catch (err) { console.error('[equip-maint-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'scheduled' | 'serviced') => {
    try { await updateAlertStatus(db, alertId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: critical first, then by failure_probability desc
  const sortedAlerts = [...alerts].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sev[a.severity] !== sev[b.severity]) return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
    return b.failure_probability - a.failure_probability;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Equipment Maintenance", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWrench} className="text-amber-600" />
              AI Equipment Maintenance
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts equipment failures before they happen — age, drift, overdue maintenance (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Predicting…' : 'Predict failures'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWrench} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No maintenance alerts!</p>
            <p className="text-sm mt-1">All equipment healthy. Click "Predict failures" to scan for risks.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Critical</div>
                <div className="text-3xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faWrench} />Total alerts</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.totalAlerts}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-300 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Est. repair cost</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalRepairCost)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Est. savings</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalSavings)}</div>
              </div>
            </div>

            {/* Alerts table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faWrench} className="text-amber-600" />
                  Equipment Alerts (sorted by failure probability)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Equipment</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Age</th>
                      <th className="p-3 text-right">Lifespan</th>
                      <th className="p-3 text-right">Failure prob</th>
                      <th className="p-3 text-right">Days to fail</th>
                      <th className="p-3 text-right">Last maint.</th>
                      <th className="p-3 text-right">Repair cost</th>
                      <th className="p-3 text-right">Savings</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAlerts.map((a, idx) => {
                      const style = RULE_STYLE[a.rule_id] ?? RULE_STYLE.overdue_maintenance;
                      const typeIcon = TYPE_ICON[a.equipment_type ?? 'other'] ?? '🔧';
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[a.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="text-lg">{typeIcon}</span>
                              <span className="font-medium">{a.equipment_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{a.location} — {a.description}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{a.age_months}mo</td>
                          <td className="p-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className={`tabular-nums font-semibold ${a.lifespan_pct >= 1 ? 'text-rose-600' : a.lifespan_pct >= 0.9 ? 'text-amber-600' : 'text-neutral-500'}`}>
                                {Math.round(a.lifespan_pct * 100)}%
                              </span>
                              <div className="w-12 h-1.5 bg-neutral-100 rounded">
                                <div className={`h-1.5 rounded ${a.lifespan_pct >= 1 ? 'bg-rose-500' : a.lifespan_pct >= 0.9 ? 'bg-amber-500' : a.lifespan_pct >= 0.7 ? 'bg-yellow-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, a.lifespan_pct * 100)}%` }}></div>
                              </div>
                              <span className="text-xs text-neutral-400">/ {a.expected_lifespan_months}mo</span>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <span className={`tabular-nums font-bold ${a.failure_probability > 0.5 ? 'text-rose-600' : a.failure_probability > 0.3 ? 'text-amber-600' : 'text-yellow-600'}`}>
                              {Math.round(a.failure_probability * 100)}%
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {a.days_until_failure !== undefined ? (
                              <span className={a.days_until_failure < 30 ? 'text-rose-600 font-bold' : 'text-amber-600'}>
                                {a.days_until_failure}d
                              </span>
                            ) : <span className="text-neutral-400">—</span>}
                          </td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{a.days_since_maintenance}d ago</td>
                          <td className="p-3 text-right tabular-nums text-rose-600">{withCurrency(a.est_repair_cost)}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">{withCurrency(a.est_savings)}</td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              <button onClick={() => a.id && handleStatus(a.id, 'scheduled')} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 whitespace-nowrap">
                                <FontAwesomeIcon icon={faClock} /> Schedule
                              </button>
                              <button onClick={() => a.id && handleStatus(a.id, 'serviced')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                                <FontAwesomeIcon icon={faCheckCircle} /> Done
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
                  <span className="text-lg">{TYPE_ICON[a.equipment_type ?? 'other'] ?? '🔧'}</span>
                  <span className="text-xs font-bold text-violet-600">{a.equipment_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[a.rule_id].bg} ${RULE_STYLE[a.rule_id].text}`}>{a.rule_id.replace(/_/g, ' ')}</span>
                  {a.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{a.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{a.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Critical threshold: <strong>{(config.criticalThreshold * 100).toFixed(0)}%</strong> lifespan</span>
              <span>Overdue: <strong>{config.overdueDays}d</strong></span>
              <span>Failure threshold: <strong>{(config.failureThreshold * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default EquipmentMaintenanceScreen;
