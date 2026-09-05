/**
 * AI Bar Pour Cost Variance Predictor — predicts which bottles, cocktails, and
 * bartenders have high pour cost variance (over-pouring, theft, recipe drift).
 *
 * 145th POSR-exclusive differentiator.
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
  faWineGlass, faRotate, faBottleWater, faUser, faCocktail, faDroplet,
  faGift, faLayerGroup, faClock, faFlask, faCheckCircle,
  faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runBarPourEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readBarPourConfig, DEFAULT_BARPOUR_CONFIG,
  type BarPourAlert,
} from "@/lib/bar-pour-variance.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  high_variance_bottle:                { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faBottleWater, label: 'BOTTLE' },
  bartender_over_pour:                 { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUser,      label: 'BARTENDER' },
  cocktail_recipe_drift:               { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faCocktail,  label: 'RECIPE DRIFT' },
  free_pour_vs_jigger:                 { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faDroplet,   label: 'FREE-POUR' },
  untracked_comp_pattern:              { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faGift,      label: 'COMPS' },
  high_shrinkage_liquor_category:      { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faLayerGroup,label: 'CATEGORY' },
  shift_variance_pattern:              { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faClock,     label: 'SHIFT' },
  recipe_complexity_correlation:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faFlask,     label: 'COMPLEXITY' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function BarPourVarianceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<BarPourAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, highVarianceBottles: 0, avgVariancePct: 0, totalMonthlyWaste: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_BARPOUR_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readBarPourConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[barpour-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runBarPourEngine(db, config);
      toast.success(`Analyzed ${result.generated} pour variance signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[barpour-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[barpour-report] status failed', err);
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
      <DocumentTitle parts={["AI Bar Pour Variance", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWineGlass} className="text-fuchsia-500" />
              AI Bar Pour Cost Variance Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts over-pouring, theft, recipe drift, and comp abuse at the bar — per bottle, bartender, cocktail
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faWineGlass} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze pours'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faBottleWater} label="High-variance bottles" value={String(summary.highVarianceBottles)} color="text-rose-600" />
          <SummaryCard icon={faDroplet} label="Avg variance" value={`${summary.avgVariancePct.toFixed(0)}%`} color={summary.avgVariancePct >= 15 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Critical items" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faLightbulb} label="Monthly waste" value={fmt$(summary.totalMonthlyWaste)} color="text-rose-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWineGlass} spin className="text-4xl mb-3" />
            <p>Analyzing bar pour variance patterns…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No pour variance alerts</p>
            <p className="text-sm mt-1">Bartenders pouring accurately, no shrinkage detected.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faWineGlass, label: alert.rule_id.toUpperCase() };
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
                          {alert.bottle_name && alert.bottle_name !== 'Various' && (
                            <span className="text-sm font-semibold text-neutral-800">{alert.bottle_name}</span>
                          )}
                          {alert.cocktail_name && (
                            <span className="text-sm font-semibold text-neutral-800">{alert.cocktail_name}</span>
                          )}
                          {alert.bartender_name && (
                            <span className="text-xs font-medium text-violet-700">by {alert.bartender_name}</span>
                          )}
                          {alert.liquor_category && (
                            <span className="text-xs text-neutral-500 uppercase">{alert.liquor_category}</span>
                          )}
                          {alert.shift_window && (
                            <span className="text-xs text-amber-600 font-medium uppercase">{alert.shift_window}</span>
                          )}
                          {alert.variance_pct != null && (
                            <span className={`text-xs font-bold ${alert.variance_pct >= 25 ? 'text-rose-600' : alert.variance_pct >= 15 ? 'text-amber-600' : 'text-yellow-600'}`}>
                              {alert.variance_pct.toFixed(0)}% variance
                            </span>
                          )}
                          {alert.pour_accuracy_pct != null && (
                            <span className={`text-xs ${alert.pour_accuracy_pct < 85 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>
                              {alert.pour_accuracy_pct.toFixed(0)}% accuracy
                            </span>
                          )}
                          {alert.comp_rate_pct != null && (
                            <span className={`text-xs ${alert.comp_rate_pct >= 8 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>
                              {alert.comp_rate_pct.toFixed(1)}% comps
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.theoretical_ounces_used != null && alert.actual_ounces_used != null && (
                            <span>
                              theo: <span className="text-neutral-700">{alert.theoretical_ounces_used}oz</span>
                              <span className="text-neutral-400 mx-1">→</span>
                              <span className="text-rose-600 font-medium">actual: {alert.actual_ounces_used}oz</span>
                            </span>
                          )}
                          {alert.variance_ounces != null && alert.variance_ounces > 0 && (
                            <span className="text-rose-600">+{alert.variance_ounces}oz unaccounted</span>
                          )}
                          {alert.bartender_avg_pour_oz != null && alert.spec_pour_oz != null && (
                            <span>
                              pour: <span className="text-rose-600 font-medium">{alert.bartender_avg_pour_oz.toFixed(2)}oz</span>
                              <span className="text-neutral-400 mx-1">vs spec</span>
                              <span className="text-neutral-700">{alert.spec_pour_oz.toFixed(2)}oz</span>
                            </span>
                          )}
                          {alert.recipe_complexity_score != null && (
                            <span>complexity: <span className="text-neutral-700">{alert.recipe_complexity_score}/100</span></span>
                          )}
                          {alert.peer_avg_comp_rate_pct != null && (
                            <span>peer avg: <span className="text-neutral-700">{alert.peer_avg_comp_rate_pct.toFixed(1)}%</span></span>
                          )}
                          {alert.bottle_cost_per_oz != null && (
                            <span>cost/oz: <span className="text-neutral-700">{fmt$(alert.bottle_cost_per_oz)}</span></span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-fuchsia-50 border border-fuchsia-200 rounded px-3 py-2 text-xs text-fuchsia-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo waste</div>
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
          <span>High variance: ≥{config.highVarianceThreshold}%</span>
          <span>Over-pour: ≥{config.overPourThreshold}%</span>
          <span>Comp excess: +{config.compRateThreshold}pp vs peer</span>
          <span>Complex recipe: ≥{config.complexRecipeThreshold}/100</span>
          <span className="text-neutral-400">145th POSR-exclusive differentiator</span>
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

export default BarPourVarianceScreen;
