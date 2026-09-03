/**
 * AI Inventory Reorder Point Optimizer — dynamic ROP + safety stock + EOQ dashboard.
 *
 * 60th POSR-exclusive differentiator — restaurants lose $200-800/mo per
 * location from inventory mismanagement (stockouts, overstock spoilage,
 * emergency reorder premiums).
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
  faBoxesStacked, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faArrowDownShortWide, faArrowUpShortWide,
  faClockRotateLeft, faCalendarDays, faBoxesPacking, faLeaf,
  faTruck, faBolt,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runReorderEngine, getActiveRecommendations, getSummary, updateRecStatus,
  readReorderConfig, DEFAULT_REORDER_CONFIG,
  type ReorderRecommendation,
} from "@/lib/reorder-point-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  understock_risk:            { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowDownShortWide,  label: 'UNDERSTOCK' },
  overstock_risk:             { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowUpShortWide,    label: 'OVERSTOCK' },
  lead_time_variability:      { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faClockRotateLeft,     label: 'LEAD-TIME VAR' },
  seasonal_demand_shift:      { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faCalendarDays,        label: 'SEASONAL SHIFT' },
  bulk_eoq_opportunity:       { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faBoxesPacking,        label: 'EOQ OPT' },
  spoilage_threshold:         { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faLeaf,                label: 'SPOILAGE RISK' },
  vendor_minimum_optimization:{ bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTruck,               label: 'VENDOR MIN' },
  emergency_reorder:          { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faBolt,                label: 'EMERGENCY' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const CATEGORY_COLOR: Record<string, string> = {
  produce: 'text-lime-700',
  meat: 'text-rose-700',
  dairy: 'text-sky-700',
  dry_goods: 'text-amber-700',
  frozen: 'text-cyan-700',
  beverage: 'text-violet-700',
  other: 'text-neutral-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function ReorderPointOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [recs, setRecs] = useState<ReorderRecommendation[]>([]);
  const [summary, setSummary] = useState({ totalRecs: 0, criticalCount: 0, totalSavings: 0, emergencyCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_REORDER_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readReorderConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRecommendations(db), getSummary(db)]);
      setRecs(list); setSummary(sum);
    } catch (err) { console.error('[reorder-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runReorderEngine(db, config);
      toast.success(`Generated ${result.generated} reorder recommendations`);
      await reload();
    } catch (err) {
      console.error('[reorder-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (recId: string, status: 'adopted' | 'piloting' | 'rejected') => {
    try {
      await updateRecStatus(db, recId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[reorder-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedRecs = useMemo(() =>
    [...recs].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_loss_monthly ?? 0) - (a.est_loss_monthly ?? 0);
    }),
  [recs]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Reorder Point Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBoxesStacked} className="text-sky-600" />
              AI Inventory Reorder Point Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Dynamic ROP + safety stock + EOQ per SKU — auto-adjusts for demand, lead time, spoilage
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Run AI analysis'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faBolt}
            label="Emergency reorders"
            value={String(summary.emergencyCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical / stockout risk"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faBoxesStacked}
            label="Open recommendations"
            value={String(summary.totalRecs)}
            color="text-sky-600"
          />
          <SummaryCard
            icon={faLightbulb}
            label="Est. monthly savings"
            value={fmt$(summary.totalSavings)}
            color="text-emerald-600"
          />
        </div>

        {/* Recommendations list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBoxesStacked} spin className="text-4xl mb-3" />
            <p>Loading reorder recommendations…</p>
          </div>
        ) : sortedRecs.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No open reorder recommendations</p>
            <p className="text-sm mt-1">Run AI analysis to detect inventory optimization opportunities.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedRecs.map((rec, idx) => {
              const style = RULE_STYLE[rec.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faBoxesStacked, label: rec.rule_id.toUpperCase() };
              const ropDelta = rec.suggested_reorder_point - rec.current_reorder_point;
              const ssDelta = rec.suggested_safety_stock - rec.current_safety_stock;
              return (
                <div key={rec.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-neutral-800">{rec.ingredient_name}</span>
                          {rec.category && (
                            <span className={`text-xs font-medium ${CATEGORY_COLOR[rec.category] ?? 'text-neutral-500'}`}>
                              {rec.category.replace('_', ' ')}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${rec.severity === 'critical' ? 'text-rose-600' : rec.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[rec.severity]}`} />
                            {rec.severity}
                          </span>
                          {rec.days_until_stockout != null && rec.days_until_stockout < 7 && (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                              <FontAwesomeIcon icon={faBolt} /> {rec.days_until_stockout.toFixed(1)}d to stockout
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{rec.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span>
                            ROP: <span className="font-medium text-neutral-700">{rec.current_reorder_point}</span> → <span className={`font-medium ${ropDelta > 0 ? 'text-emerald-600' : ropDelta < 0 ? 'text-amber-600' : 'text-neutral-700'}`}>{rec.suggested_reorder_point}</span> ({ropDelta >= 0 ? '+' : ''}{ropDelta})
                          </span>
                          <span>
                            Safety: <span className="font-medium text-neutral-700">{rec.current_safety_stock}</span> → <span className={`font-medium ${ssDelta > 0 ? 'text-emerald-600' : ssDelta < 0 ? 'text-amber-600' : 'text-neutral-700'}`}>{rec.suggested_safety_stock}</span>
                          </span>
                          {rec.suggested_eoq != null && rec.current_eoq != null && (
                            <span>EOQ: {rec.current_eoq} → <span className="font-medium text-neutral-700">{rec.suggested_eoq}</span></span>
                          )}
                          <span>Usage: {rec.avg_daily_usage}/day</span>
                          <span>Lead: {rec.lead_time_days}d{rec.lead_time_stddev ? ` ±${rec.lead_time_stddev}` : ''}</span>
                          {rec.shelf_life_days != null && <span>Shelf-life: {rec.shelf_life_days}d</span>}
                        </div>
                        {rec.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{rec.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-emerald-600">{fmt$(rec.est_savings_monthly)}</div>
                      <div className="text-xs text-neutral-400">est. saved /mo</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => rec.id && handleStatus(rec.id, 'adopted')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Adopt
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => rec.id && handleStatus(rec.id, 'piloting')}>
                      <FontAwesomeIcon icon={faRotate} /> Pilot 2w
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => rec.id && handleStatus(rec.id, 'rejected')}>
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
          <span>Service level: {config.serviceLevel}%</span>
          <span>Review window: {config.reviewWindowDays}d</span>
          <span>Stockout alert: &lt;{config.stockoutAlertDays}d</span>
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

export default ReorderPointOptimizerScreen;
