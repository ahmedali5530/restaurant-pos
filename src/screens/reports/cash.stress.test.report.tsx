/**
 * AI Cash Flow Stress Test — worst-case scenario simulation dashboard.
 *
 * 71st POSR-exclusive differentiator — 60% of restaurant closures are due to
 * cash flow problems (Cornell CHR).
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
  faShieldHalved, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faWrench, faUsers, faTruckFast, faGavel, faChartLine,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runStressEngine, getActiveTests, getSummary, updateTestStatus,
  readStressConfig, DEFAULT_STRESS_CONFIG,
  type CashStressTest,
} from "@/lib/cash-stress-test.service.ts";

const RULE_ICON: Record<string, any> = {
  revenue_drop: faChartLine,
  equipment_failure: faWrench,
  staff_shortage: faUsers,
  supplier_disruption: faTruckFast,
  regulatory_shutdown: faGavel,
};

const OUTCOME_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  survives:                { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '✓ Survives' },
  survives_with_difficulty:{ bg: 'bg-amber-100',   text: 'text-amber-700',   label: '⚠ Survives (difficulty)' },
  insolvent_within_30d:    { bg: 'bg-rose-100',    text: 'text-rose-700',    label: '✕ Insolvent <30d' },
  insolvent_within_7d:     { bg: 'bg-rose-200',    text: 'text-rose-900',    label: '✕ Insolvent <7d' },
  insolvent_immediately:   { bg: 'bg-rose-300',    text: 'text-rose-900',    label: '✕ Insolvent immediately' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const parseMitigations = (json?: string): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export function CashStressTestScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [tests, setTests] = useState<CashStressTest[]>([]);
  const [summary, setSummary] = useState({ criticalCount: 0, totalTests: 0, insolvencyRiskCount: 0, totalReserveGap: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_STRESS_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readStressConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveTests(db), getSummary(db)]);
      setTests(list); setSummary(sum);
    } catch (err) { console.error('[stress-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runStressEngine(db, config);
      toast.success(result.tests.length > 0
        ? `Simulated ${result.tests.length} stress scenarios — ${result.tests.filter(t => t.severity === 'critical').length} critical, ${result.tests.filter(t => t.survival_outcome === 'survives').length} survive`
        : `No stress tests — need cash balance data`);
      await reload();
    } catch (err) { console.error('[stress-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (testId: string, status: 'reviewed' | 'mitigated') => {
    try { await updateTestStatus(db, testId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedTests = [...tests].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
  });

  return (
    <Layout>
      <DocumentTitle parts={["Stress Test", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faShieldHalved} className="text-rose-600" />
              AI Cash Stress Test
            </h1>
            <p className="text-sm text-neutral-500">
              Worst-case scenario simulation — 60% of closures are predictable (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Simulating…' : 'Run stress test'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : tests.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faShieldHalved} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No stress tests run!</p>
            <p className="text-sm mt-1">Click "Run stress test" to simulate worst-case scenarios.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Critical</div>
                <div className="text-3xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Scenarios tested</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.totalTests}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Insolvency risks</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.insolvencyRiskCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Total reserve gap</div>
                <div className={`text-2xl font-bold tabular-nums ${summary.totalReserveGap < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{withCurrency(summary.totalReserveGap)}</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedTests.map((t, idx) => {
                const outcome = OUTCOME_STYLE[t.survival_outcome] ?? OUTCOME_STYLE.survives;
                const icon = RULE_ICON[t.rule_id] ?? faShieldHalved;
                const mitigations = parseMitigations(t.mitigation_actions);
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[t.severity] ?? SEVERITY_DOT.low}`}></span>
                          <FontAwesomeIcon icon={icon} className="text-neutral-500" />
                          <span className="font-medium">{t.scenario_name}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${outcome.bg} ${outcome.text}`}>
                            {outcome.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Duration: <strong>{t.duration_days}d</strong></span>
                          {t.days_until_insolvent !== undefined && (
                            <span className="text-rose-600 font-bold">⚠ Insolvent in {t.days_until_insolvent}d</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{t.description}</p>
                    </div>

                    <div className="p-3">
                      {/* Financial projection */}
                      <div className="grid grid-cols-5 gap-3 mb-3 text-center">
                        <div>
                          <div className="text-xs text-neutral-500">Current balance</div>
                          <div className="font-bold tabular-nums text-emerald-600">{withCurrency(t.current_balance)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">One-time cost</div>
                          <div className="font-bold tabular-nums text-rose-600">{t.one_time_cost > 0 ? `-${withCurrency(t.one_time_cost)}` : '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Revenue impact</div>
                          <div className="font-bold tabular-nums text-rose-600">{(t.revenue_impact_pct * 100).toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Projected end</div>
                          <div className={`font-bold tabular-nums ${t.projected_balance_end < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{withCurrency(t.projected_balance_end)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Reserve needed</div>
                          <div className="font-bold tabular-nums text-amber-600">{withCurrency(t.recommended_reserve)}</div>
                        </div>
                      </div>

                      {/* Reserve gap */}
                      <div className="mb-3 p-2 rounded border ${t.reserve_gap < 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}">
                        <p className={`text-xs ${t.reserve_gap < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                          <strong>Reserve gap:</strong> {t.reserve_gap < 0 ? `${withCurrency(t.reserve_gap)} UNDER-RESERVED` : `${withCurrency(t.reserve_gap)} surplus`}
                        </p>
                      </div>

                      {/* Mitigation actions */}
                      {mitigations.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-neutral-500 mb-1"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />Mitigation actions:</div>
                          <ul className="text-xs space-y-0.5 list-disc list-inside">
                            {mitigations.map((m, i) => <li key={i} className="text-neutral-700">{m}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* AI insight */}
                      {t.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{t.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => t.id && handleStatus(t.id, 'mitigated')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Mitigated
                        </button>
                        <button onClick={() => t.id && handleStatus(t.id, 'reviewed')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          Reviewed
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Reserve target: <strong>{config.reserveTargetDays}d</strong></span>
              <span>Avg daily revenue: <strong>{withCurrency(config.avgDailyRevenue)}</strong></span>
              <span>Avg daily cost: <strong>{withCurrency(config.avgDailyCost)}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default CashStressTestScreen;
