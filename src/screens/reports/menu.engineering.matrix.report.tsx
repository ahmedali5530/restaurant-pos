/**
 * AI Menu Engineering Matrix Analyzer — classifies every menu item into
 * Stars / Plowhorses / Puzzles / Dogs with quadrant-specific AI actions.
 *
 * 108th POSR-exclusive differentiator — restaurants lose $300-1,500/mo per
 * location from poorly-engineered menus. No POS offers BCG matrix analysis.
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
  faChartSimple, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faStar, faHorse, faPuzzlePiece, faDog,
  faArrowTrendDown, faArrowTrendUp, faTags, faCoins,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runMenuEngEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readMenuEngConfig, DEFAULT_MENUENG_CONFIG,
  type MenuEngAlert,
} from "@/lib/menu-engineering-matrix.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  star_item:            { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faStar,            label: 'STAR' },
  plowhorse_item:       { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faHorse,           label: 'PLOWHORSE' },
  puzzle_item:          { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faPuzzlePiece,     label: 'PUZZLE' },
  dog_item:             { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faDog,             label: 'DOG' },
  star_fading:          { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faArrowTrendDown,  label: 'STAR FADING' },
  dog_rising:           { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,    label: 'DOG RISING' },
  reprice_opportunity:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTags,            label: 'REPRICE' },
  cost_optimization:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCoins,           label: 'COST OPT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const QUADRANT_COLOR: Record<string, string> = {
  star: 'text-amber-600',
  plowhorse: 'text-sky-600',
  puzzle: 'text-violet-600',
  dog: 'text-rose-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function MenuEngineeringMatrixScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<MenuEngAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, stars: 0, plowhorses: 0, puzzles: 0, dogs: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MENUENG_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMenuEngConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[menueng-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMenuEngEngine(db, config);
      toast.success(`Classified ${result.generated} menu items — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[menueng-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[menueng-report] status failed', err);
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
      <DocumentTitle parts={["AI Menu Engineering Matrix", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChartSimple} className="text-violet-600" />
              AI Menu Engineering Matrix
            </h1>
            <p className="text-sm text-neutral-500">
              BCG-style Stars / Plowhorses / Puzzles / Dogs classification with AI actions
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Classifying…' : 'Classify menu'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faCoins} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-emerald-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faStar} label="Stars + Puzzles" value={`${summary.stars}/${summary.puzzles}`} color="text-amber-600" />
          <SummaryCard icon={faChartSimple} label="Open alerts" value={String(summary.totalAlerts)} color="text-violet-600" />
        </div>

        {/* Quadrant legend */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <FontAwesomeIcon icon={faStar} className="text-amber-600" />
            <div><span className="font-semibold text-amber-700">Stars</span> <span className="text-neutral-500">— popular + profitable ({summary.stars})</span></div>
          </div>
          <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded px-3 py-2">
            <FontAwesomeIcon icon={faHorse} className="text-sky-600" />
            <div><span className="font-semibold text-sky-700">Plowhorses</span> <span className="text-neutral-500">— popular, low margin ({summary.plowhorses})</span></div>
          </div>
          <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded px-3 py-2">
            <FontAwesomeIcon icon={faPuzzlePiece} className="text-violet-600" />
            <div><span className="font-semibold text-violet-700">Puzzles</span> <span className="text-neutral-500">— profitable, low pop. ({summary.puzzles})</span></div>
          </div>
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            <FontAwesomeIcon icon={faDog} className="text-rose-600" />
            <div><span className="font-semibold text-rose-700">Dogs</span> <span className="text-neutral-500">— low pop + low profit ({summary.dogs})</span></div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChartSimple} spin className="text-4xl mb-3" />
            <p>Classifying menu items…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No menu engineering alerts</p>
            <p className="text-sm mt-1">Run classification to analyze menu items.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faChartSimple, label: alert.rule_id.toUpperCase() };
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
                          {alert.quadrant && (
                            <span className={`text-xs font-medium uppercase ${QUADRANT_COLOR[alert.quadrant]}`}>
                              {alert.quadrant}
                            </span>
                          )}
                          {alert.popularity_score != null && alert.profitability_score != null && (
                            <span className="text-xs text-neutral-500">
                              pop <span className="font-medium text-neutral-700">{alert.popularity_score}</span>
                              <span className="mx-0.5">·</span>
                              prof <span className="font-medium text-neutral-700">{alert.profitability_score}</span>
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.order_count != null && <span>{alert.order_count} orders/mo</span>}
                          {alert.revenue != null && <span>Rev: {fmt$(alert.revenue)}</span>}
                          {alert.margin_pct != null && <span>Margin: {alert.margin_pct}%</span>}
                          {alert.margin_per_unit != null && <span>{fmt$(alert.margin_per_unit)}/unit</span>}
                          {alert.ingredient_cost_trend != null && alert.ingredient_cost_trend > 0 && (
                            <span className="text-rose-600">Cost ↑{alert.ingredient_cost_trend}%</span>
                          )}
                          {alert.previous_quadrant && (
                            <span className="text-violet-600">was {alert.previous_quadrant}</span>
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
                        <div className="text-xs text-neutral-400">opportunity/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Acted
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
          <span>Popularity threshold: {config.popularityThreshold}</span>
          <span>Profitability threshold: {config.profitabilityThreshold}</span>
          <span>Star fade drop: {config.starFadeDrop} pts</span>
          <span>Dog rise gain: {config.dogRiseGain} pts</span>
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

export default MenuEngineeringMatrixScreen;
