/**
 * AI Menu Layout & Item Placement Optimizer — predicts optimal item placement
 * (page position, sweet-spot zone, category ordering, visual hierarchy).
 *
 * 154th POSR-exclusive differentiator.
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
  faListOl, faRotate, faStar, faLayerGroup, faArrowsUpDown,
  faArrowUp, faShuffle, faAnchor, faEye, faCakeCandles,
  faCheckCircle, faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runMenuLayoutEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readMenuLayoutConfig, DEFAULT_MENULAYOUT_CONFIG,
  type MenuLayoutAlert,
} from "@/lib/menu-layout-placement.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  star_item_not_in_sweet_spot:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faStar,           label: 'STAR BURIED' },
  menu_too_long:                 { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faListOl,         label: 'TOO LONG' },
  category_order_suboptimal:     { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faLayerGroup,     label: 'CATEGORY ORDER' },
  high_margin_item_buried:       { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faArrowUp,        label: 'MARGIN BURIED' },
  decoy_item_misplaced:          { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faShuffle,        label: 'DECOY' },
  anchor_item_missing:           { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faAnchor,         label: 'NO ANCHOR' },
  visual_hierarchy_weak:         { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faEye,            label: 'HIERARCHY' },
  dessert_section_isolated:      { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faCakeCandles,    label: 'DESSERT ISOLATED' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function MenuLayoutPlacementScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<MenuLayoutAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, itemsToMove: 0, categoriesTooLong: 0, avgItemsPerCategory: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MENULAYOUT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMenuLayoutConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[menulayout-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMenuLayoutEngine(db, config);
      toast.success(`Analyzed ${result.generated} menu layout signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[menulayout-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[menulayout-report] status failed', err);
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
      <DocumentTitle parts={["AI Menu Layout", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faListOl} className="text-violet-500" />
              AI Menu Layout & Item Placement Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts optimal item placement — top-right quadrant sells 30% more (Cornell Menu Engineering)
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faListOl} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze layout'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faArrowsUpDown} label="Items to move" value={String(summary.itemsToMove)} color="text-amber-600" />
          <SummaryCard icon={faListOl} label="Categories too long" value={String(summary.categoriesTooLong)} color="text-rose-600" />
          <SummaryCard icon={faLayerGroup} label="Avg items/category" value={summary.avgItemsPerCategory.toFixed(0)} color={summary.avgItemsPerCategory >= 8 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faListOl} spin className="text-4xl mb-3" />
            <p>Analyzing menu layout + item placement…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No menu layout alerts</p>
            <p className="text-sm mt-1">Menu layout optimized — stars in sweet spot, categories right-sized.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faListOl, label: alert.rule_id.toUpperCase() };
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
                          {alert.dish_name && (
                            <span className="text-sm font-semibold text-neutral-800">{alert.dish_name}</span>
                          )}
                          {alert.dish_category && (
                            <span className="text-xs text-neutral-500 uppercase">{alert.dish_category}</span>
                          )}
                          {alert.category_name && (
                            <span className="text-xs text-violet-600 uppercase">{alert.category_name}</span>
                          )}
                          {alert.current_position != null && alert.recommended_position != null && (
                            <span className="text-xs">
                              <span className="text-rose-600">pos {alert.current_position}</span>
                              <span className="text-neutral-400 mx-1">→</span>
                              <span className="text-emerald-600 font-medium">pos {alert.recommended_position}</span>
                            </span>
                          )}
                          {alert.current_position != null && alert.recommended_position == null && (
                            <span className="text-xs text-rose-600">pos {alert.current_position}</span>
                          )}
                          {alert.current_page != null && (
                            <span className="text-xs text-neutral-500">page {alert.current_page}</span>
                          )}
                          {alert.profit_margin_pct != null && (
                            <span className={`text-xs font-medium ${alert.profit_margin_pct >= 80 ? 'text-emerald-600' : 'text-neutral-500'}`}>{alert.profit_margin_pct}% margin</span>
                          )}
                          {alert.popularity_rank != null && (
                            <span className="text-xs text-amber-600">rank #{alert.popularity_rank}</span>
                          )}
                          {alert.items_in_category != null && (
                            <span className={`text-xs ${alert.items_in_category >= 8 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.items_in_category} items</span>
                          )}
                          {alert.predicted_sales_lift_pct != null && alert.predicted_sales_lift_pct > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">+{alert.predicted_sales_lift_pct}% sales</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.current_sales_per_day != null && (
                            <span>sales: <span className="text-neutral-700 font-medium">{alert.current_sales_per_day}/day</span></span>
                          )}
                          {alert.recommended_page != null && (
                            <span>→ page <span className="text-emerald-600 font-medium">{alert.recommended_page}</span></span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo at risk</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Action taken
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
          <span>Sweet spot: top-{config.sweetSpotPosition}</span>
          <span>Max items/category: {config.maxItemsPerCategory}</span>
          <span>Anchor multiplier: {config.minAnchorPriceMultiplier}x</span>
          <span className="text-neutral-400">154th POSR-exclusive differentiator</span>
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

export default MenuLayoutPlacementScreen;
