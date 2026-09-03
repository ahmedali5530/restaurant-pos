/**
 * AI Kitchen Prep Sheet Optimizer — daily per-ingredient prep quantities dashboard.
 *
 * 61st POSR-exclusive differentiator — restaurants waste $200-500/mo per
 * location on incorrect kitchen prep (over-prep spoilage + under-prep
 * stockouts + 30-60 min/day manager time on manual prep sheets).
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
  faUtensils, faRotate, faLightbulb, faCheckCircle,
  faChartLine, faRecycle, faCalendarCheck, faCloudSun,
  faCalendarDays, faBullhorn, faClock, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPrepEngine, getActiveRecommendations, getSummary, updateRecStatus,
  readPrepConfig, DEFAULT_PREP_CONFIG,
  type PrepRecommendation,
} from "@/lib/prep-sheet-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  demand_forecast_adjustment: { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faChartLine,          label: 'DEMAND ADJ' },
  waste_pattern_reduction:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faRecycle,            label: 'WASTE REDUCE' },
  reservation_spike:          { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faCalendarCheck,      label: 'RESERVATION' },
  weather_event_adjustment:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCloudSun,           label: 'WEATHER' },
  seasonal_pattern:           { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faCalendarDays,       label: 'SEASONAL' },
  menu_promo_spike:           { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faBullhorn,           label: 'PROMO' },
  lead_time_prep:             { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: faClock,              label: 'LEAD TIME' },
  over_prep_correction:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'OVER-PREP' },
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
  sauces: 'text-orange-700',
  dough: 'text-yellow-700',
  other: 'text-neutral-600',
};

const SHIFT_COLOR: Record<string, string> = {
  morning: 'bg-amber-100 text-amber-700',
  afternoon: 'bg-sky-100 text-sky-700',
  evening: 'bg-violet-100 text-violet-700',
  all_day: 'bg-neutral-100 text-neutral-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function PrepSheetOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [recs, setRecs] = useState<PrepRecommendation[]>([]);
  const [summary, setSummary] = useState({ totalRecs: 0, criticalCount: 0, totalSavings: 0, highWasteItems: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PREP_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPrepConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRecommendations(db), getSummary(db)]);
      setRecs(list); setSummary(sum);
    } catch (err) { console.error('[prep-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPrepEngine(db, config);
      toast.success(`Generated ${result.generated} prep recommendations`);
      await reload();
    } catch (err) {
      console.error('[prep-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (recId: string, status: 'prepped' | 'adjusted' | 'rejected') => {
    try {
      await updateRecStatus(db, recId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[prep-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedRecs = useMemo(() =>
    [...recs].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_savings_daily ?? 0) - (a.est_savings_daily ?? 0);
    }),
  [recs]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Prep Sheet Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUtensils} className="text-orange-600" />
              AI Kitchen Prep Sheet Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Daily per-ingredient prep quantities — demand-driven, waste-aware, weather-adjusted
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Generate prep sheet'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Over-prep corrections"
            value={String(summary.highWasteItems)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faLightbulb}
            label="Open recommendations"
            value={String(summary.totalRecs)}
            color="text-orange-600"
          />
          <SummaryCard
            icon={faChartLine}
            label="Est. daily savings"
            value={fmt$(summary.totalSavings)}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faCalendarCheck}
            label="Est. monthly savings"
            value={fmt$(summary.totalSavings * 30)}
            color="text-emerald-600"
          />
        </div>

        {/* Recommendations list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUtensils} spin className="text-4xl mb-3" />
            <p>Loading prep recommendations…</p>
          </div>
        ) : sortedRecs.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No open prep recommendations</p>
            <p className="text-sm mt-1">Generate prep sheet to optimize today's kitchen prep.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedRecs.map((rec, idx) => {
              const style = RULE_STYLE[rec.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faUtensils, label: rec.rule_id.toUpperCase() };
              const qtyDelta = rec.suggested_prep_qty - rec.current_prep_qty;
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
                              {rec.category}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${rec.severity === 'critical' ? 'text-rose-600' : rec.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[rec.severity]}`} />
                            {rec.severity}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${SHIFT_COLOR[rec.shift] ?? SHIFT_COLOR.all_day}`}>
                            {rec.shift}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{rec.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span>
                            <FontAwesomeIcon icon={faUtensils} className="mr-1" />
                            {rec.prep_action}: <span className="font-medium text-neutral-700">{rec.current_prep_qty}{rec.unit}</span> → <span className={`font-medium ${qtyDelta > 0 ? 'text-emerald-600' : qtyDelta < 0 ? 'text-amber-600' : 'text-neutral-700'}`}>{rec.suggested_prep_qty}{rec.unit}</span> ({qtyDelta >= 0 ? '+' : ''}{qtyDelta}{rec.unit})
                          </span>
                          <span>Forecast: {rec.forecast_demand} covers</span>
                          {rec.reservation_count != null && rec.reservation_count > 0 && (
                            <span>Reservations: {rec.reservation_count}</span>
                          )}
                          {rec.weather_factor != null && (
                            <span>Weather: ×{rec.weather_factor}</span>
                          )}
                          {rec.leftover_stock > 0 && (
                            <span>Leftover: {rec.leftover_stock}{rec.unit}</span>
                          )}
                          {rec.avg_waste_pct != null && (
                            <span className={rec.avg_waste_pct > 15 ? 'text-rose-600' : 'text-neutral-500'}>
                              Waste: {rec.avg_waste_pct}%
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
                      <div className="text-lg font-bold text-emerald-600">{fmt$(rec.est_savings_daily)}</div>
                      <div className="text-xs text-neutral-400">est. saved /day</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => rec.id && handleStatus(rec.id, 'prepped')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Prepped
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => rec.id && handleStatus(rec.id, 'adjusted')}>
                      <FontAwesomeIcon icon={faRotate} /> Adjusted
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
          <span>Waste tolerance: {config.wasteTolerancePct}%</span>
          <span>Stockout buffer: +{config.stockoutBufferPct}%</span>
          <span>Leftover max: {config.leftoverMaxPct}%</span>
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

export default PrepSheetOptimizerScreen;
