/**
 * AI Restaurant Utility Bill Optimizer — audits electricity, gas, water bills
 * for billing errors, rate plan optimization, and savings opportunities.
 *
 * 103rd POSR-exclusive differentiator — restaurants spend $2,000-5,000/mo on
 * utilities, 15-25% wasted.
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
  faBolt, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faFileInvoice, faGaugeHigh, faMoneyBill,
  faPercent, faDollarSign, faTags, faCalendarDays, faDroplet,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runUtilityEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readUtilityConfig, DEFAULT_UTILITY_CONFIG,
  type UtilityAlert,
} from "@/lib/utility-bill-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  rate_plan_mismatch:           { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTags,            label: 'RATE PLAN' },
  demand_charge_spike:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faGaugeHigh,       label: 'DEMAND CHARGE' },
  meter_error_suspected:        { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faGaugeHigh,       label: 'METER ERROR' },
  power_factor_penalty:         { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faPercent,         label: 'POWER FACTOR' },
  hidden_fees:                  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faDollarSign,      label: 'HIDDEN FEES' },
  tariff_optimization:          { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTags,            label: 'TARIFF OPT' },
  seasonal_adjustment_missing:  { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faCalendarDays,    label: 'SEASONAL' },
  water_leak_suspicion:         { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faDroplet,         label: 'WATER LEAK' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const UTILITY_COLOR: Record<string, string> = {
  electricity: 'text-amber-600',
  gas: 'text-orange-600',
  water: 'text-sky-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function UtilityBillOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<UtilityAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOvercharge: 0, totalSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_UTILITY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readUtilityConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[utility-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runUtilityEngine(db, config);
      toast.success(`Found ${result.generated} utility alerts — ${fmt$(result.totalSavings)}/yr savings potential`);
      await reload();
    } catch (err) {
      console.error('[utility-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[utility-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_annual_savings ?? 0) - (a.est_annual_savings ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Utility Bill Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBolt} className="text-amber-600" />
              AI Restaurant Utility Bill Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Audits electricity, gas, water bills — billing errors, rate plans, savings opportunities
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Auditing…' : 'Audit bills'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Overcharge /mo" value={fmt$(summary.totalOvercharge)} color="text-rose-600" />
          <SummaryCard icon={faLightbulb} label="Annual savings" value={fmt$(summary.totalSavings)} color="text-emerald-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical/high" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faBolt} label="Open alerts" value={String(summary.totalAlerts)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBolt} spin className="text-4xl mb-3" />
            <p>Loading utility bill alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No utility bill alerts</p>
            <p className="text-sm mt-1">Run audit to check utility bills.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faBolt, label: alert.rule_id.toUpperCase() };
              return (
                <div key={alert.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-medium ${UTILITY_COLOR[alert.utility_type] ?? 'text-neutral-500'}`}>
                            {alert.utility_type}
                          </span>
                          {alert.current_rate_plan && alert.suggested_rate_plan && (
                            <span className="text-xs text-neutral-500">{alert.current_rate_plan} → <span className="font-medium text-emerald-600">{alert.suggested_rate_plan}</span></span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span>Bill: <span className="font-medium text-neutral-700">{fmt$(alert.current_monthly_bill)}/mo</span></span>
                          {alert.benchmark_monthly_bill != null && <span>Benchmark: {fmt$(alert.benchmark_monthly_bill)}/mo</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-rose-600">{fmt$(alert.overcharge_amount)}</div>
                      <div className="text-xs text-neutral-400">overcharge/mo</div>
                      <div className="text-sm font-bold text-emerald-600 mt-1">{fmt$(alert.est_annual_savings)}</div>
                      <div className="text-xs text-neutral-400">annual savings</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Resolved
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> In progress
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => alert.id && handleStatus(alert.id, 'rejected')}>
                      Skip
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Benchmark electricity: {fmt$(config.benchmarkElec)}/mo</span>
          <span>Benchmark gas: {fmt$(config.benchmarkGas)}/mo</span>
          <span>Benchmark water: {fmt$(config.benchmarkWater)}/mo</span>
          <span>Tolerance: {config.tolerancePct}% above benchmark</span>
        </div>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center gap-3">
      <FontAwesomeIcon icon={icon} className={`text-2xl ${color}`} />
      <div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export default UtilityBillOptimizerScreen;
