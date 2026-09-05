/**
 * AI Menu Item Retirement Predictor — predicts which menu items should be
 * retired based on declining popularity, low margin, high modification rate,
 * kitchen complexity, and waste.
 *
 * 136th POSR-exclusive differentiator — restaurants lose $300-1,000/mo per
 * location from keeping dead menu items too long.
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
  faTrashCan, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faGhost, faClock, faDollarSign,
  faWandMagicSparkles, faChartLine, faCalendarXmark, faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runMenuRetireEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readMenuRetireConfig, DEFAULT_MENURETIRE_CONFIG,
  type MenuRetireAlert,
} from "@/lib/menu-item-retirement.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  retirement_candidate:           { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTrashCan,           label: 'RETIREMENT CANDIDATE' },
  zombie_item:                    { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faGhost,              label: 'ZOMBIE' },
  optimal_retirement_window:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,              label: 'RETIREMENT WINDOW' },
  carrying_cost_excessive:        { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faDollarSign,         label: 'CARRYING COST' },
  revivable_item:                 { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faWandMagicSparkles,  label: 'REVIVABLE' },
  post_retirement_revenue_shift:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faChartLine,          label: 'REVENUE SHIFT' },
  seasonal_non_return:            { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCalendarXmark,      label: 'SEASONAL NON-RETURN' },
  retirement_blocker:             { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faShieldHalved,       label: 'BLOCKER' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function MenuItemRetirementScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<MenuRetireAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zombieCount: 0, avgRetirementScore: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MENURETIRE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMenuRetireConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[menuretire-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMenuRetireEngine(db, config);
      toast.success(`Analyzed ${result.generated} retirement candidates — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[menuretire-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[menuretire-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_opportunity ?? 0) - (a.est_monthly_opportunity ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Menu Item Retirement", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTrashCan} className="text-rose-600" />
              AI Menu Item Retirement Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts which menu items should be retired — optimal timing + carrying cost analysis
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze retirement'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faGhost} label="Zombie items" value={String(summary.zombieCount)} color="text-rose-600" />
          <SummaryCard icon={faTrashCan} label="Avg score" value={`${summary.avgRetirementScore.toFixed(0)}/100`} color="text-amber-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faTrashCan} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-rose-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTrashCan} spin className="text-4xl mb-3" />
            <p>Analyzing menu item retirement candidates…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No retirement alerts</p>
            <p className="text-sm mt-1">All menu items healthy — no retirement candidates.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faTrashCan, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.menu_item}</span>
                          {alert.retirement_score != null && (
                            <span className={`text-xs font-bold ${alert.retirement_score >= 80 ? 'text-rose-600' : alert.retirement_score >= 65 ? 'text-amber-600' : 'text-neutral-500'}`}>
                              {alert.retirement_score}/100
                            </span>
                          )}
                          {alert.decline_pct != null && alert.decline_pct > 0 && (
                            <span className="text-xs font-bold text-rose-600">-{alert.decline_pct}% from peak</span>
                          )}
                          {alert.current_order_rate != null && (
                            <span className="text-xs text-neutral-500">{alert.current_order_rate} orders/mo</span>
                          )}
                          {alert.modification_rate != null && alert.modification_rate >= 30 && (
                            <span className="text-xs text-amber-600">{alert.modification_rate}% mods</span>
                          )}
                          {alert.recommendation && (
                            <span className="text-xs font-medium text-violet-600 uppercase">{alert.recommendation.replace('_', ' ')}</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.monthly_carrying_cost != null && <span>carrying: {fmt$(alert.monthly_carrying_cost)}/mo</span>}
                          {alert.monthly_revenue != null && <span>revenue: {fmt$(alert.monthly_revenue)}/mo</span>}
                          {alert.net_cost_of_keeping != null && (
                            <span className={alert.net_cost_of_keeping > 0 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>
                              net: {alert.net_cost_of_keeping > 0 ? '-' : '+'}{fmt$(Math.abs(alert.net_cost_of_keeping))}/mo
                            </span>
                          )}
                          {alert.months_on_menu != null && <span className="text-neutral-400">{alert.months_on_menu}mo on menu</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-xs text-rose-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">savings/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Retired
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Evaluating
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
          <span>Score threshold: {config.scoreThreshold}/100</span>
          <span>Decline threshold: {config.declineThreshold}%</span>
          <span>Carrying cost min: ${config.carryingCostMin}/mo</span>
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

export default MenuItemRetirementScreen;
