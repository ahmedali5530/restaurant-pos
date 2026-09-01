/**
 * Food Safety Compliance Dashboard — HACCP monitoring + AI corrective actions.
 *
 * 7th POSR-exclusive differentiator — Toast and Square have basic manual
 * temperature logging but NO AI. POSR automates HACCP compliance with
 * 7 detection rules + AI recommendations.
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
  faShieldVirus, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faEye, faThermometerHalf,
  faClock, faCube, faStethoscope,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runFoodSafetyScan,
  getOpenFoodSafetyAlerts,
  getFoodSafetySummary,
  updateFoodSafetyStatus,
  readFoodSafetyConfig,
  DEFAULT_FOODSAFETY_CONFIG,
  type FoodSafetyAlert,
  type FoodSafetySeverity,
} from "@/lib/food-safety.service.ts";

const SEVERITY_STYLE: Record<FoodSafetySeverity, { bg: string; text: string; border: string; icon: any }> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   icon: faTriangleExclamation },
  warning:  { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  icon: faShieldVirus },
  info:     { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-400',   icon: faEye },
};

const REC_LABEL: Record<string, string> = {
  discard_food: 'Discard food', repair_equipment: 'Repair equipment',
  recheck_in_30min: 'Recheck in 30min', call_maintenance: 'Call maintenance',
  retrain_staff: 'Retrain staff', document_haccp: 'Document HACCP',
  dismiss: 'Dismiss',
};

const RULE_LABEL: Record<string, string> = {
  critical_temp_breach: 'Critical Temp Breach',
  prolonged_breach: 'Prolonged Breach',
  equipment_drift: 'Equipment Drift',
  missed_check: 'Missed Check',
  repeated_breach: 'Repeated Breach',
  after_hours_breach: 'After-Hours Breach',
  expired_stock: 'Expired Stock',
};

export function FoodSafetyScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<FoodSafetyAlert[]>([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, warning: 0, activeBreaches: 0, complianceScore: 100 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_FOODSAFETY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readFoodSafetyConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getOpenFoodSafetyAlerts(db),
        getFoodSafetySummary(db),
      ]);
      setAlerts(list);
      setSummary(sum);
    } catch (err) {
      console.error('[foodsafety-report] reload failed', err);
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
      const result = await runFoodSafetyScan(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.alerts.length > 0
          ? `Detected ${result.alerts.length} food safety alerts — ${result.alerts.filter(a => a.severity === 'critical').length} critical`
          : `All clear — checked ${result.checked} rules, no violations detected`
      );
      await reload();
    } catch (err) {
      console.error('[foodsafety-report] analyze failed', err);
      toast.error('Scan failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: string) => {
    try {
      await updateFoodSafetyStatus(db, alertId, status);
      toast.success(`Alert marked as ${status}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  const complianceColor = summary.complianceScore >= 90 ? 'text-emerald-600'
    : summary.complianceScore >= 70 ? 'text-amber-600' : 'text-rose-600';

  return (
    <Layout>
      <DocumentTitle parts={["Food Safety Compliance", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faShieldVirus} className="text-rose-600" />
              Food Safety Compliance
            </h1>
            <p className="text-sm text-neutral-500">
              HACCP automation — 7 detection rules + AI corrective actions (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Scanning… (${progress.current}/${progress.total})` : 'Run scan'}
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
            <p className="text-lg font-medium text-emerald-600">No violations!</p>
            <p className="text-sm mt-1">HACCP compliance is clean. Click "Run scan" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center col-span-2 md:col-span-1">
                <div className="text-xs text-emerald-600">Compliance Score</div>
                <div className={`text-3xl font-bold tabular-nums ${complianceColor}`}>{Math.round(summary.complianceScore)}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.critical}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Warning</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.warning}</div>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                <div className="text-xs text-orange-600">Active breaches (24h)</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{summary.activeBreaches}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Open alerts</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
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
                        {alert.zone_name && (
                          <span className="text-sm text-neutral-600">
                            · <FontAwesomeIcon icon={faThermometerHalf} className="mr-1 text-neutral-400" />
                            {alert.zone_name}
                          </span>
                        )}
                        {alert.item_name && (
                          <span className="text-sm text-neutral-600">
                            · <FontAwesomeIcon icon={faCube} className="mr-1 text-neutral-400" />
                            {alert.item_name}
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-neutral-500">Risk score</div>
                        <div className={`font-bold tabular-nums ${style.text}`}>{Math.round(alert.estimated_risk)}/100</div>
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
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          alert.ai_recommendation === 'discard_food' ? 'bg-rose-100 text-rose-700' :
                          alert.ai_recommendation === 'repair_equipment' ? 'bg-amber-100 text-amber-700' :
                          alert.ai_recommendation === 'recheck_in_30min' ? 'bg-blue-100 text-blue-700' :
                          alert.ai_recommendation === 'call_maintenance' ? 'bg-orange-100 text-orange-700' :
                          alert.ai_recommendation === 'retrain_staff' ? 'bg-violet-100 text-violet-700' :
                          alert.ai_recommendation === 'document_haccp' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-neutral-100 text-neutral-600'
                        }`}>
                          <FontAwesomeIcon icon={faStethoscope} className="mr-1" />AI: {REC_LABEL[alert.ai_recommendation] ?? alert.ai_recommendation}
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
              <span>Check interval: <strong>{config.checkIntervalMin} min</strong></span>
              <span>Prolonged threshold: <strong>{config.prolongedThresholdMin} min</strong></span>
              <span>Repeated threshold: <strong>{config.repeatedThreshold}×/7d</strong></span>
              <span>Fridge ≤: <strong>{config.fridgeMax}°C</strong></span>
              <span>Freezer ≤: <strong>{config.freezerMax}°C</strong></span>
              <span>Hot-hold ≥: <strong>{config.hotHoldMin}°C</strong></span>
              <span>7 detection rules</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default FoodSafetyScreen;
