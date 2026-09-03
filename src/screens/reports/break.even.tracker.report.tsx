/**
 * AI Break-Even & Daily Profit Target Tracker — real-time daily break-even
 * tracking + profit target pacing + loss/surplus alerts dashboard.
 *
 * 65th POSR-exclusive differentiator — 60% of restaurants don't know their
 * daily break-even point (Cornell Hospitality Research).
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
  faChartLine, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faGaugeHigh, faArrowTrendDown, faArrowTrendUp,
  faUsers, faTag, faCoins, faCalendarDays, faBullseye,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runBreakEvenEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readBreakEvenConfig, DEFAULT_BREAKEVEN_CONFIG,
  type BreakEvenAlert,
} from "@/lib/break-even-tracker.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  behind_pace:           { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGaugeHigh,         label: 'BEHIND PACE' },
  loss_risk:             { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faArrowTrendDown,    label: 'LOSS RISK' },
  surplus_opportunity:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,      label: 'SURPLUS' },
  staffing_mismatch:     { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faUsers,             label: 'STAFFING' },
  promotion_evaluation:  { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faTag,               label: 'PROMO EVAL' },
  cost_overrun:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faCoins,             label: 'COST OVERRUN' },
  seasonal_adjustment:   { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faCalendarDays,      label: 'SEASONAL' },
  profit_target_gap:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBullseye,           label: 'TARGET GAP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function BreakEvenTrackerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<BreakEvenAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalLossRisk: 0, totalSurplus: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_BREAKEVEN_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readBreakEvenConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[breakeven-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runBreakEvenEngine(db, config);
      toast.success(`Generated ${result.generated} break-even alerts`);
      await reload();
    } catch (err) {
      console.error('[breakeven-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'acknowledged' | 'actioned' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[breakeven-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_loss_today + b.est_surplus_today) - (a.est_loss_today + a.est_surplus_today);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Break-Even Tracker", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartLine} className="text-emerald-600" />
              AI Break-Even & Profit Target Tracker
            </h1>
            <p className="text-sm text-neutral-500">
              Real-time daily break-even tracking — knows if you're making money before it's too late
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Run break-even scan'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical alerts"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faArrowTrendDown}
            label="Loss risk today"
            value={fmt$(summary.totalLossRisk)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faChartLine}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-amber-600"
          />
          <SummaryCard
            icon={faArrowTrendUp}
            label="Surplus opportunities"
            value={fmt$(summary.totalSurplus)}
            color="text-emerald-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChartLine} spin className="text-4xl mb-3" />
            <p>Loading break-even alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No break-even alerts</p>
            <p className="text-sm mt-1">Run break-even scan to check today's pace.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faChartLine, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.alert_date}</span>
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span>Revenue: <span className="font-medium text-neutral-700">{fmt$(alert.current_revenue)}</span> / {fmt$(alert.break_even_point)} break-even</span>
                          <span>Projected: <span className={`font-medium ${alert.projected_close_revenue >= alert.break_even_point ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt$(alert.projected_close_revenue)}</span></span>
                          <span>Target: {fmt$(alert.profit_target)}</span>
                          <span>Hours: {alert.hours_elapsed}h elapsed / {alert.hours_remaining}h left</span>
                          <span>Fixed: {fmt$(alert.fixed_costs_daily)}/day</span>
                          <span>Variable: {alert.variable_cost_pct}%</span>
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
                      {alert.est_loss_today > 0 && (
                        <>
                          <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_loss_today)}</div>
                          <div className="text-xs text-neutral-400">est. loss today</div>
                        </>
                      )}
                      {alert.est_surplus_today > 0 && (
                        <>
                          <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_surplus_today)}</div>
                          <div className="text-xs text-neutral-400">est. surplus</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'actioned')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Actioned
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'acknowledged')}>
                      <FontAwesomeIcon icon={faRotate} /> Acknowledged
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
          <span>Monthly fixed: {fmt$(config.monthlyFixed)}</span>
          <span>Food cost: {config.foodCostPct}%</span>
          <span>Labor: {config.laborPct}%</span>
          <span>Utilities: {config.utilityPct}%</span>
          <span>Fees: {config.feePct}%</span>
          <span>Target margin: {config.targetMargin}%</span>
          <span>Pace alert: &lt;{config.paceAlertPct}%</span>
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

export default BreakEvenTrackerScreen;
