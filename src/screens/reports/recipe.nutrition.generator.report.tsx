/**
 * AI Recipe Nutrition & Dietary Label Generator — auto-calculates nutrition
 * from recipe ingredients, detects allergens, generates dietary labels.
 *
 * 86th POSR-exclusive differentiator — restaurants spend $200-500/mo on
 * third-party nutrition analysis. FDA requires chains 20+ to post calories.
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
  faLeaf, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faTint, faIceCream, faFire,
  faBacon, faAllergies, faTags, faBalanceScale, faHeart,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runNutritionEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readNutritionConfig, DEFAULT_NUTRITION_CONFIG,
  type NutritionAlert,
} from "@/lib/recipe-nutrition-generator.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  high_sodium:                 { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTint,             label: 'HIGH SODIUM' },
  high_sugar:                  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faIceCream,        label: 'HIGH SUGAR' },
  high_calorie_density:        { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faFire,            label: 'HIGH CALORIE' },
  low_protein:                 { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faBacon,           label: 'LOW PROTEIN' },
  missing_allergen_tag:        { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faAllergies,       label: 'MISSING ALLERGEN' },
  dietary_label_conflict:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTags,            label: 'LABEL CONFLICT' },
  serving_size_mismatch:       { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faBalanceScale,    label: 'PORTION MISMATCH' },
  reformulation_opportunity:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faLeaf,            label: 'REFORMULATE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

const scoreColor = (score: number): string => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  if (score >= 40) return 'text-orange-600';
  return 'text-rose-600';
};

const parseJsonArray = (json?: string): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
};

export function RecipeNutritionGeneratorScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<NutritionAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalSavings: 0, totalComplianceRisk: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_NUTRITION_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readNutritionConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[nutrition-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runNutritionEngine(db, config);
      toast.success(`Generated ${result.generated} nutrition alerts`);
      await reload();
    } catch (err) {
      console.error('[nutrition-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[nutrition-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_compliance_risk + b.est_reformulation_savings) - (a.est_compliance_risk + a.est_reformulation_savings);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Recipe Nutrition Generator", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLeaf} className="text-emerald-600" />
              AI Recipe Nutrition & Dietary Label Generator
            </h1>
            <p className="text-sm text-neutral-500">
              Auto-calculates calories, macros, allergens, dietary labels from recipe ingredients
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Run nutrition scan'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical (allergen/label)"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faLeaf}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faLightbulb}
            label="Reformulation savings"
            value={fmt$(summary.totalSavings)}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faTriangleExclamation}
            label="Compliance risk"
            value={fmt$(summary.totalComplianceRisk)}
            color="text-rose-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLeaf} spin className="text-4xl mb-3" />
            <p>Loading nutrition alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No nutrition alerts</p>
            <p className="text-sm mt-1">Run nutrition scan to analyze all recipes.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faLeaf, label: alert.rule_id.toUpperCase() };
              const allergens = parseJsonArray(alert.allergens_detected);
              const dietary = parseJsonArray(alert.dietary_labels);
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
                          <span className="font-semibold text-neutral-800">{alert.recipe_name}</span>
                          {alert.category && <span className="text-xs text-neutral-400">{alert.category}</span>}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          {alert.health_score != null && (
                            <span className={`text-xs font-medium ${scoreColor(alert.health_score)}`}>
                              <FontAwesomeIcon icon={faHeart} className="mr-1" />
                              {alert.health_score}/100
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span>Cal: <span className="font-medium text-neutral-700">{alert.calories_per_serving}</span></span>
                          <span>P: <span className="font-medium text-neutral-700">{alert.protein_g}g</span></span>
                          <span>C: <span className="font-medium text-neutral-700">{alert.carbs_g}g</span></span>
                          <span>F: <span className="font-medium text-neutral-700">{alert.fat_g}g</span></span>
                          {alert.fiber_g != null && <span>Fiber: {alert.fiber_g}g</span>}
                          {alert.sugar_g != null && (
                            <span className={alert.sugar_g > 25 ? 'text-amber-600 font-medium' : ''}>Sugar: {alert.sugar_g}g</span>
                          )}
                          {alert.sodium_mg != null && (
                            <span className={alert.sodium_mg > 800 ? 'text-amber-600 font-medium' : ''}>Sodium: {alert.sodium_mg}mg</span>
                          )}
                        </div>
                        {allergens.length > 0 && (
                          <div className="flex items-center gap-1 mt-2 flex-wrap">
                            <span className="text-xs text-neutral-500">Allergens:</span>
                            {allergens.map(a => (
                              <span key={a} className="inline-flex items-center gap-1 text-xs text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                                <FontAwesomeIcon icon={faAllergies} /> {a.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                        {dietary.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <span className="text-xs text-neutral-500">Dietary:</span>
                            {dietary.map(d => (
                              <span key={d} className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                <FontAwesomeIcon icon={faLeaf} /> {d.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {alert.est_reformulation_savings > 0 && (
                        <>
                          <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_reformulation_savings)}</div>
                          <div className="text-xs text-neutral-400">savings/mo</div>
                        </>
                      )}
                      {alert.est_compliance_risk > 0 && (
                        <>
                          <div className="text-sm font-bold text-rose-600 mt-1">{fmt$(alert.est_compliance_risk)}</div>
                          <div className="text-xs text-neutral-400">risk</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Resolved
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

        {/* Config footer */}
        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Sodium max: {config.sodiumMaxMg}mg</span>
          <span>Sugar max: {config.sugarMaxG}g</span>
          <span>Calorie max: {config.calorieMax}</span>
          <span>Health score min: {config.healthScoreMin}</span>
          <span>Chain locations: {config.chainLocations}{config.chainLocations >= 20 ? ' (FDA compliant)' : ''}</span>
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

export default RecipeNutritionGeneratorScreen;
