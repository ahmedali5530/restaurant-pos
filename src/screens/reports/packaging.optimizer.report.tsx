/**
 * AI Takeout Packaging Optimizer — right-sizing + material selection dashboard.
 *
 * 59th POSR-exclusive differentiator — takeout/delivery packaging costs
 * restaurants $300-1,200/mo per location; 15-25% is wasted.
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
  faBox, faRotate, faLightbulb, faCheckCircle,
  faBoxOpen, faTemperatureArrowUp, faDroplet, faLayerGroup,
  faLeaf, faCircleDollarToSlot, faBoxesStacked, faTriangleExclamation,
  faArrowRightArrowLeft, faSeedling,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPackagingEngine, getActiveRecommendations, getSummary, updateRecStatus,
  readPackagingConfig, DEFAULT_PACKAGING_CONFIG,
  type PackagingRecommendation,
} from "@/lib/packaging-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  oversized_container:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBoxOpen,             label: 'OVERSIZED' },
  wrong_material_temp:   { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faTemperatureArrowUp,  label: 'WRONG TEMP' },
  spill_risk_mismatch:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faDroplet,             label: 'SPILL RISK' },
  bundle_split:          { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faLayerGroup,          label: 'BUNDLE SPLIT' },
  eco_upgrade:           { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faLeaf,                label: 'ECO UPGRADE' },
  cost_overrun:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faCircleDollarToSlot,  label: 'COST OVERRUN' },
  bulk_discount_missed:  { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faBoxesStacked,        label: 'BULK MISS' },
  damaged_history:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'DAMAGE RISK' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const ecoColor = (delta: number): string => {
  if (delta >= 50) return 'text-emerald-600';
  if (delta >= 20) return 'text-lime-600';
  if (delta >= 0)  return 'text-yellow-600';
  return 'text-rose-600';
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function PackagingOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [recs, setRecs] = useState<PackagingRecommendation[]>([]);
  const [summary, setSummary] = useState({ totalRecs: 0, criticalCount: 0, totalSavings: 0, avgEcoDelta: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PACKAGING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPackagingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRecommendations(db), getSummary(db)]);
      setRecs(list); setSummary(sum);
    } catch (err) { console.error('[packaging-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPackagingEngine(db, config);
      toast.success(`Generated ${result.generated} packaging recommendations`);
      await reload();
    } catch (err) {
      console.error('[packaging-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (recId: string, status: 'adopted' | 'piloting' | 'rejected') => {
    try {
      await updateRecStatus(db, recId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[packaging-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedRecs = useMemo(() =>
    [...recs].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_savings_monthly ?? 0) - (a.est_savings_monthly ?? 0);
    }),
  [recs]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Packaging Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBox} className="text-amber-600" />
              AI Takeout Packaging Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Right-size containers, match materials, prevent spills, cut packaging cost 15-25%
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
            icon={faTriangleExclamation}
            label="Critical / spill-risk"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faBox}
            label="Open recommendations"
            value={String(summary.totalRecs)}
            color="text-amber-600"
          />
          <SummaryCard
            icon={faCircleDollarToSlot}
            label="Est. monthly savings"
            value={fmt$(summary.totalSavings)}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faSeedling}
            label="Avg eco-score delta"
            value={summary.avgEcoDelta >= 0 ? `+${Math.round(summary.avgEcoDelta)}` : `${Math.round(summary.avgEcoDelta)}`}
            color={ecoColor(summary.avgEcoDelta)}
          />
        </div>

        {/* Recommendations list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBox} spin className="text-4xl mb-3" />
            <p>Loading packaging recommendations…</p>
          </div>
        ) : sortedRecs.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No open packaging recommendations</p>
            <p className="text-sm mt-1">Run AI analysis to detect optimization opportunities.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedRecs.map((rec, idx) => {
              const style = RULE_STYLE[rec.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faBox, label: rec.rule_id.toUpperCase() };
              const unitDelta = rec.current_unit_cost - rec.suggested_unit_cost;
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
                          <span className="font-semibold text-neutral-800">{rec.item_name}</span>
                          <span className={`inline-flex items-center gap-1 text-xs ${rec.severity === 'critical' ? 'text-rose-600' : rec.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[rec.severity]}`} />
                            {rec.severity}
                          </span>
                          {rec.spill_risk && (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                              <FontAwesomeIcon icon={faDroplet} /> spill
                            </span>
                          )}
                          {rec.temp_issue && (
                            <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                              <FontAwesomeIcon icon={faTemperatureArrowUp} /> temp
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{rec.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span className="inline-flex items-center gap-1">
                            <FontAwesomeIcon icon={faArrowRightArrowLeft} />
                            {rec.current_packaging} → <span className="font-medium text-neutral-700">{rec.suggested_packaging}</span>
                          </span>
                          <span>Unit cost: {fmt$(rec.current_unit_cost)} → {fmt$(rec.suggested_unit_cost)} ({unitDelta >= 0 ? '-' : '+'}{fmt$(Math.abs(unitDelta))})</span>
                          {rec.order_count_30d != null && <span>Freq: {rec.order_count_30d}/mo</span>}
                          {rec.eco_score_delta != null && (
                            <span className={ecoColor(rec.eco_score_delta)}>
                              <FontAwesomeIcon icon={faLeaf} /> eco {rec.eco_score_delta >= 0 ? '+' : ''}{Math.round(rec.eco_score_delta)}
                            </span>
                          )}
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
          <span>Cost threshold: {config.costPctThreshold}% of order value</span>
          <span>Bulk contract threshold: {config.bulkThreshold}/mo</span>
          <span>Eco target: {config.ecoTargetPct}% compostable</span>
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

export default PackagingOptimizerScreen;
