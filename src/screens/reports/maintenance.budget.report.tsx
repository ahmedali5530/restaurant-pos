/**
 * AI Predictive Maintenance Budget Planner — annual maintenance budget dashboard.
 *
 * 75th POSR-exclusive differentiator — reactive repairs cost 3-5x more. 80%
 * have no maintenance budget. Planned saves 25-40% (Cornell).
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
  faCalendar, faPiggyBank, faShieldHalved, faSun, faChartBar,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runMaintBudgetEngine, getActiveBudgets, getSummary, updateBudgetStatus,
  readMaintBudgetConfig, DEFAULT_MAINT_BUDGET_CONFIG,
  type MaintenanceBudget,
} from "@/lib/maintenance-budget.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  preventive_schedule: { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faWrench,        label: 'PREVENTIVE' },
  replacement_fund:    { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faPiggyBank,     label: 'REPLACEMENT FUND' },
  emergency_reserve:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faShieldHalved,  label: 'EMERGENCY RESERVE' },
  seasonal_prep:       { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faSun,           label: 'SEASONAL PREP' },
  cost_optimization:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faChartBar,      label: 'COST SUMMARY' },
};

const SEVERITY_DOT: Record<string, string> = { critical: 'bg-rose-500', high: 'bg-amber-500', medium: 'bg-yellow-400', low: 'bg-neutral-300' };

export function MaintenanceBudgetScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [budgets, setBudgets] = useState<MaintenanceBudget[]>([]);
  const [summary, setSummary] = useState({ itemCount: 0, totalPlannedCost: 0, totalSavings: 0, emergencyReserve: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MAINT_BUDGET_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMaintBudgetConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveBudgets(db), getSummary(db)]);
      setBudgets(list); setSummary(sum);
    } catch (err) { console.error('[maint-budget-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMaintBudgetEngine(db, config);
      toast.success(result.budgets.length > 0
        ? `Generated ${result.budgets.length} budget items — est ${withCurrency(result.budgets.reduce((s, b) => s + b.est_savings, 0))} annual savings`
        : `No budget items generated`);
      await reload();
    } catch (err) { console.error('[maint-budget-report] analyze failed', err); toast.error('Engine failed'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (id: string, status: 'budgeted' | 'scheduled' | 'completed' | 'deferred') => {
    try { await updateBudgetStatus(db, id, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed'); }
  }, [db, reload]);

  const sortedBudgets = [...budgets].sort((a, b) => b.priority_score - a.priority_score);

  return (
    <Layout>
      <DocumentTitle parts={["Maintenance Budget", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWrench} className="text-amber-600" />
              AI Maintenance Budget
            </h1>
            <p className="text-sm text-neutral-500">
              Annual maintenance budget planner — saves 25-40% vs reactive repairs (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Planning…' : 'Build budget'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : budgets.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWrench} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No maintenance budget yet!</p>
            <p className="text-sm mt-1">Click "Build budget" to generate an annual maintenance plan.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faWrench} />Budget items</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.itemCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">Annual cost</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalPlannedCost)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Annual savings</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalSavings)}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faShieldHalved} />Emergency reserve</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{withCurrency(summary.emergencyReserve)}</div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faWrench} className="text-amber-600" />
                  Annual Maintenance Plan (sorted by priority)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Equipment</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-center">Month</th>
                      <th className="p-3 text-right">Planned cost</th>
                      <th className="p-3 text-right">Reactive cost</th>
                      <th className="p-3 text-right">Savings</th>
                      <th className="p-3 text-right">Priority</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBudgets.map((b, idx) => {
                      const style = RULE_STYLE[b.rule_id] ?? RULE_STYLE.preventive_schedule;
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[b.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">{b.equipment_name ?? b.action_type}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{b.description}</p>
                            {b.funding_source && <p className="text-xs text-violet-500 mt-0.5">Funding: {b.funding_source.replace(/_/g, ' ')}</p>}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">{b.scheduled_month}</span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold text-amber-600">{withCurrency(b.est_cost)}</td>
                          <td className="p-3 text-right tabular-nums text-rose-400 line-through">{withCurrency(b.est_cost_without_plan)}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">{withCurrency(b.est_savings)}</td>
                          <td className="p-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-bold tabular-nums">{b.priority_score}</span>
                              <div className="w-12 h-1.5 bg-neutral-100 rounded">
                                <div className={`h-1.5 rounded ${b.priority_score > 80 ? 'bg-rose-500' : b.priority_score > 60 ? 'bg-amber-500' : 'bg-yellow-400'}`} style={{ width: `${b.priority_score}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              <button onClick={() => b.id && handleStatus(b.id, 'budgeted')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap font-medium">
                                <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Budget
                              </button>
                              <button onClick={() => b.id && handleStatus(b.id, 'scheduled')} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">
                                Schedule
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
            {budgets.filter(b => b.ai_insight).slice(0, 5).map((b, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{b.equipment_name ?? b.action_type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[b.rule_id].bg} ${RULE_STYLE[b.rule_id].text}`}>{b.rule_id.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{b.ai_insight}</p>
              </div>
            ))}

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Revenue target: <strong>{(config.revenuePct * 100).toFixed(0)}%</strong></span>
              <span>Emergency reserve: <strong>{(config.emergencyPct * 100).toFixed(0)}%</strong></span>
              <span>Reactive multiplier: <strong>{config.reactiveMultiplier}x</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default MaintenanceBudgetScreen;
