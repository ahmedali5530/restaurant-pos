/**
 * AI Restaurant Tax Deduction Finder — identifies missed tax deductions.
 *
 * 93rd POSR-exclusive differentiator — restaurants miss $2,000-10,000/year
 * in tax deductions. No POS has tax deduction tracking.
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
  faFileInvoiceDollar, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faTools, faUtensils, faHandHoldingHeart,
  faBolt, faBox, faHome, faHardHat, faRocket,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runTaxEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readTaxConfig, DEFAULT_TAX_CONFIG,
  type TaxAlert,
} from "@/lib/tax-deduction-finder.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  equipment_depreciation:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTools,             label: 'SECTION 179' },
  meal_comp_deduction:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUtensils,          label: 'MEAL DEDUCTION' },
  charitable_donation:      { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faHandHoldingHeart,  label: 'CHARITABLE' },
  energy_tax_credit:        { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faBolt,              label: 'ENERGY CREDIT' },
  supplies_deduction:       { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faBox,               label: 'SUPPLIES' },
  home_office_deduction:    { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: faHome,              label: 'HOME OFFICE' },
  workers_comp_credit:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faHardHat,           label: 'SAFETY CREDIT' },
  startup_cost_deduction:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faRocket,            label: 'STARTUP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const DOC_COLOR: Record<string, string> = {
  complete: 'text-emerald-600',
  partial: 'text-amber-600',
  missing: 'text-rose-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function TaxDeductionFinderScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<TaxAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalEligible: 0, totalTaxSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TAX_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTaxConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[tax-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTaxEngine(db, config);
      toast.success(`Found ${result.generated} deductions — ${fmt$(result.totalSavings)} potential tax savings`);
      await reload();
    } catch (err) {
      console.error('[tax-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[tax-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.tax_savings ?? 0) - (a.tax_savings ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Tax Deduction Finder", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faFileInvoiceDollar} className="text-emerald-600" />
              AI Restaurant Tax Deduction Finder
            </h1>
            <p className="text-sm text-neutral-500">
              Identifies missed deductions — Section 179, meal comps, charitable, energy credits
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Scanning…' : 'Find deductions'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faFileInvoiceDollar}
            label="Eligible deductions"
            value={fmt$(summary.totalEligible)}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faLightbulb}
            label="Tax savings potential"
            value={fmt$(summary.totalTaxSavings)}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faTriangleExclamation}
            label="High-priority"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faFileInvoiceDollar}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-amber-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faFileInvoiceDollar} spin className="text-4xl mb-3" />
            <p>Loading tax deduction alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No tax deduction alerts</p>
            <p className="text-sm mt-1">Run scan to find missed deductions.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faFileInvoiceDollar, label: alert.rule_id.toUpperCase() };
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
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          {alert.documentation_status && (
                            <span className={`text-xs font-medium ${DOC_COLOR[alert.documentation_status] ?? 'text-neutral-500'}`}>
                              docs: {alert.documentation_status}
                            </span>
                          )}
                          {alert.deadline && (
                            <span className="text-xs text-neutral-400">deadline: {alert.deadline}</span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span>Eligible: <span className="font-medium text-neutral-700">{fmt$(alert.eligible_amount)}</span></span>
                          <span>Claimed: <span className="font-medium text-neutral-700">{fmt$(alert.current_claim)}</span></span>
                          <span>Unclaimed: <span className="font-medium text-rose-600">{fmt$(alert.eligible_amount - alert.current_claim)}</span></span>
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
                      <div className="text-lg font-bold text-emerald-600">{fmt$(alert.tax_savings)}</div>
                      <div className="text-xs text-neutral-400">tax savings</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Claimed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Gathering docs
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

        {/* Config footer */}
        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Corporate rate: {config.corporateRate}%</span>
          <span>Section 179 limit: {fmt$(config.section179Limit)}</span>
          <span>Meal deduction: {config.mealDeductionPct}%</span>
          <span>Filing deadline: {config.filingDeadline}</span>
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

export default TaxDeductionFinderScreen;
