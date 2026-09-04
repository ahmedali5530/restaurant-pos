/**
 * AI Menu Item Cannibalization Detector — detects when menu items compete
 * with each other for the same customer demand.
 *
 * 124th POSR-exclusive differentiator — restaurants lose $400-1,500/mo per
 * location from menu items cannibalizing each other.
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
  faScissors, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faShuffle, faArrowTrendDown, faTags,
  faLayerGroup, faDivide, faCrown, faChartLine, faListUl,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runMenuCannibEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readMenuCannibConfig, DEFAULT_MENUCANNIB_CONFIG,
  type MenuCannibAlert,
} from "@/lib/menu-cannibalization.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  substitute_cannibalization:  { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faShuffle,            label: 'SUBSTITUTE' },
  new_item_cannibalization:    { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faArrowTrendDown,     label: 'NEW ITEM CANNIBAL' },
  price_tier_overlap:          { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTags,               label: 'PRICE OVERLAP' },
  category_saturation:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faLayerGroup,         label: 'SATURATED' },
  demand_split:                { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faDivide,              label: 'DEMAND SPLIT' },
  feature_item_dominance:      { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faCrown,              label: 'DOMINANCE' },
  cannibalization_recovery:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faChartLine,          label: 'RECOVERY' },
  menu_simplification:         { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faListUl,             label: 'SIMPLIFY' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function MenuCannibalizationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<MenuCannibAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, cannibalizedPairs: 0, saturatedCategories: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MENUCANNIB_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMenuCannibConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[menucannib-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMenuCannibEngine(db, config);
      toast.success(`Detected ${result.generated} cannibalization alerts — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[menucannib-report] analyze failed', err);
      toast.error('Detection failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[menucannib-report] status failed', err);
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
      <DocumentTitle parts={["AI Menu Cannibalization", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faScissors} className="text-rose-600" />
              AI Menu Item Cannibalization Detector
            </h1>
            <p className="text-sm text-neutral-500">
              Detects menu items competing for same demand — recommends consolidation + differentiation
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Detecting…' : 'Detect cannibalization'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faShuffle} label="Cannibalized pairs" value={String(summary.cannibalizedPairs)} color="text-rose-600" />
          <SummaryCard icon={faLayerGroup} label="Saturated categories" value={String(summary.saturatedCategories)} color="text-amber-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faScissors} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-rose-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faScissors} spin className="text-4xl mb-3" />
            <p>Detecting menu cannibalization…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No cannibalization detected</p>
            <p className="text-sm mt-1">Menu items well-differentiated — no demand competition.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faScissors, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">
                            {alert.item_a}
                            <span className="mx-1 text-neutral-400">vs</span>
                            {alert.item_b}
                          </span>
                          {alert.category && (
                            <span className="text-xs text-neutral-500 uppercase">{alert.category}</span>
                          )}
                          {alert.price_gap_pct != null && (
                            <span className={`text-xs font-medium ${alert.price_gap_pct <= 5 ? 'text-rose-600' : 'text-neutral-500'}`}>
                              {alert.price_gap_pct}% price gap
                            </span>
                          )}
                          {alert.cannibalization_pct != null && alert.cannibalization_pct > 0 && (
                            <span className="text-xs font-bold text-rose-600">{alert.cannibalization_pct}% cannibalized</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.item_a_price != null && alert.item_b_price != null && (
                            <span>{fmt$(alert.item_a_price)} / {fmt$(alert.item_b_price)}</span>
                          )}
                          {alert.item_a_orders != null && alert.item_b_orders != null && (
                            <span>{alert.item_a_orders} / {alert.item_b_orders} orders</span>
                          )}
                          {alert.combined_orders != null && <span className="text-neutral-400">combined: {alert.combined_orders}</span>}
                          {alert.est_revenue_recovered != null && alert.est_revenue_recovered > 0 && (
                            <span className="text-emerald-600 font-medium">recovered: {fmt$(alert.est_revenue_recovered)}</span>
                          )}
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
                        <div className="text-xs text-neutral-400">opportunity/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Resolved
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Optimizing
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
          <span>Price gap max: {config.priceGapMax}%</span>
          <span>Cannibal threshold: {config.cannibalThreshold}%</span>
          <span>Saturation count: {config.saturationCount} items</span>
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

export default MenuCannibalizationScreen;
