/**
 * Energy Optimization Dashboard — energy waste detection + AI savings recs.
 *
 * 8th POSR-exclusive differentiator — Toast, Square, Lightspeed have ZERO
 * energy tracking. POSR surfaces savings opportunities managers would miss.
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
  faBolt, faTriangleExclamation, faRobot, faRotate,
  faLightbulb, faCheckCircle, faXmark, faEye, faPiggyBank,
  faThermometerHalf, faClock, faPlugCircleXmark, faFileInvoice,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runEnergyScan,
  getOpenEnergyAlerts,
  getEnergySummary,
  updateEnergyStatus,
  readEnergyConfig,
  DEFAULT_ENERGY_CONFIG,
  type EnergyAlert,
  type EnergySeverity,
} from "@/lib/energy-optimization.service.ts";

const SEVERITY_STYLE: Record<EnergySeverity, { bg: string; text: string; border: string; icon: any }> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-500',   icon: faTriangleExclamation },
  warning:  { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-400',  icon: faBolt },
  info:     { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-400',   icon: faEye },
};

const REC_LABEL: Record<string, string> = {
  adjust_thermostat: 'Adjust thermostat',
  install_occupancy_sensor: 'Install occupancy sensor',
  repair_hvac: 'Repair HVAC',
  shift_to_off_peak: 'Shift to off-peak',
  power_down_equipment: 'Power down equipment',
  review_tariff_plan: 'Review tariff plan',
  dismiss: 'Dismiss',
};

const REC_STYLE: Record<string, string> = {
  adjust_thermostat: 'bg-blue-100 text-blue-700',
  install_occupancy_sensor: 'bg-violet-100 text-violet-700',
  repair_hvac: 'bg-amber-100 text-amber-700',
  shift_to_off_peak: 'bg-emerald-100 text-emerald-700',
  power_down_equipment: 'bg-orange-100 text-orange-700',
  review_tariff_plan: 'bg-rose-100 text-rose-700',
  dismiss: 'bg-neutral-100 text-neutral-600',
};

const RULE_LABEL: Record<string, string> = {
  after_hours_consumption: 'After-Hours Consumption',
  peak_rate_overspend: 'Peak Rate Overspend',
  weekend_anomaly: 'Weekend Anomaly',
  baseline_deviation: 'Baseline Deviation',
  hvac_drift: 'HVAC Drift',
  equipment_left_on: 'Equipment Left On',
  tariff_mismatch: 'Tariff Mismatch',
};

export function EnergyOptimizationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<EnergyAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, critical: 0, warning: 0, totalWaste: 0, potentialSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_ENERGY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readEnergyConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getOpenEnergyAlerts(db),
        getEnergySummary(db),
      ]);
      setAlerts(list);
      setSummary(sum);
    } catch (err) {
      console.error('[energy-report] reload failed', err);
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
      const result = await runEnergyScan(db, config, (current, total) => {
        setProgress({ current, total });
      });
      const waste = result.alerts.reduce((s, a) => s + a.estimated_waste, 0);
      toast.success(
        result.alerts.length > 0
          ? `Detected ${result.alerts.length} energy-waste alerts — ${withCurrency(waste)}/yr potential waste`
          : `All clear — checked ${result.checked} rules, no waste detected`
      );
      await reload();
    } catch (err) {
      console.error('[energy-report] analyze failed', err);
      toast.error('Scan failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: string) => {
    try {
      await updateEnergyStatus(db, alertId, status);
      toast.success(`Alert marked as ${status}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Energy Optimization", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBolt} className="text-amber-500" />
              Energy Optimization
            </h1>
            <p className="text-sm text-neutral-500">
              AI energy waste detection — 7 rules + AI savings recommendations (POSR-exclusive)
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
            <p className="text-lg font-medium text-emerald-600">No energy waste detected!</p>
            <p className="text-sm mt-1">All clear. Click "Run scan" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center col-span-2 md:col-span-1">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1">
                  <FontAwesomeIcon icon={faPiggyBank} />Potential savings
                </div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.potentialSavings)}</div>
                <div className="text-[10px] text-emerald-500">/year</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.critical}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Warning</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.warning}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Total waste</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{withCurrency(summary.totalWaste)}</div>
                <div className="text-[10px] text-violet-500">/year</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Open alerts</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.totalAlerts}</div>
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
                        {alert.zone && <span className="text-sm text-neutral-600">· {alert.zone.replace(/_/g, ' ')}</span>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-neutral-500">Est. waste/yr</div>
                        <div className="font-bold text-rose-600 tabular-nums">{withCurrency(alert.estimated_waste)}</div>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-700 mb-2">{alert.description}</p>
                    <div className="flex gap-4 text-xs text-neutral-500 mb-2">
                      <span>Metric: <strong className="tabular-nums">{typeof alert.metric_value === 'number' ? alert.metric_value.toFixed(2) : alert.metric_value}</strong></span>
                      <span>Expected: <strong className="tabular-nums">{typeof alert.expected_value === 'number' ? alert.expected_value.toFixed(2) : alert.expected_value}</strong></span>
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

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>After-hours: <strong>{config.afterHoursStart}:00–{config.afterHoursEnd}:00</strong></span>
              <span>Baseline deviation: <strong>{(config.baselineDeviationPct * 100).toFixed(0)}%</strong></span>
              <span>Weekend multiplier: <strong>{config.weekendMultiplier}x</strong></span>
              <span>Drift window: <strong>{config.driftDays} days</strong></span>
              <span>Peak rate threshold: <strong>{(config.peakRateThreshold * 100).toFixed(0)}%</strong></span>
              <span>Avg rate: <strong>${config.avgRatePerKwh.toFixed(2)}/kWh</strong></span>
              <span>7 detection rules</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default EnergyOptimizationScreen;
