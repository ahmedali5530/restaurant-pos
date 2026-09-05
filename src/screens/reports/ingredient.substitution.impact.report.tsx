/**
 * AI Ingredient Substitution Impact Analyzer — analyzes the full impact of
 * ingredient substitutions before they're made.
 *
 * 126th POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from unanalyzed ingredient substitutions.
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
  faExchangeAlt, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faDollarSign, faArrowTrendDown, faAllergies,
  faClock, faEye, faThumbsUp, faStar, faBuilding,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runSubImpactEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readSubImpactConfig, DEFAULT_SUBIMPACT_CONFIG,
  type SubImpactAlert,
} from "@/lib/ingredient-substitution-impact.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  false_economy:            { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faDollarSign,        label: 'FALSE ECONOMY' },
  taste_degradation_risk:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown,    label: 'TASTE RISK' },
  allergen_introduction:    { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faAllergies,         label: 'ALLERGEN RISK' },
  prep_time_increase:       { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,             label: 'PREP TIME+' },
  customer_perception_risk: { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faEye,               label: 'PERCEPTION RISK' },
  cost_saving_positive:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faThumbsUp,          label: 'COST SAVING+' },
  quality_neutral_saving:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faStar,              label: 'IDEAL SAVING' },
  brand_erosion_risk:       { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBuilding,          label: 'BRAND EROSION' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const RECOMMENDATION_COLOR: Record<string, string> = {
  approve: 'text-emerald-600',
  reject: 'text-rose-600',
  test_first: 'text-amber-600',
  modify: 'text-sky-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function IngredientSubstitutionImpactScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<SubImpactAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, falseEconomyCount: 0, approvedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SUBIMPACT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSubImpactConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[subimpact-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runSubImpactEngine(db, config);
      toast.success(`Analyzed ${result.generated} substitution impacts — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[subimpact-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[subimpact-report] status failed', err);
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
      <DocumentTitle parts={["AI Substitution Impact", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faExchangeAlt} className="text-amber-600" />
              AI Ingredient Substitution Impact Analyzer
            </h1>
            <p className="text-sm text-neutral-500">
              Evaluates cost vs taste vs perception tradeoffs before substitutions are made
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze impacts'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faDollarSign} label="False economies" value={String(summary.falseEconomyCount)} color="text-rose-600" />
          <SummaryCard icon={faThumbsUp} label="Approved savings" value={String(summary.approvedCount)} color="text-emerald-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faExchangeAlt} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faExchangeAlt} spin className="text-4xl mb-3" />
            <p>Analyzing substitution impacts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No substitution impact alerts</p>
            <p className="text-sm mt-1">No pending substitutions to evaluate.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faExchangeAlt, label: alert.rule_id.toUpperCase() };
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
                          <span className="text-xs">
                            <span className="text-neutral-500">{alert.original_ingredient}</span>
                            <span className="mx-1 text-neutral-400">→</span>
                            <span className="font-medium text-amber-600">{alert.substitute_ingredient}</span>
                          </span>
                          {alert.recommendation && (
                            <span className={`text-xs font-bold uppercase ${RECOMMENDATION_COLOR[alert.recommendation] ?? 'text-neutral-500'}`}>
                              → {alert.recommendation.replace('_', ' ')}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.monthly_cost_saving != null && (
                            <span className="text-emerald-600">saving: {fmt$(alert.monthly_cost_saving)}/mo</span>
                          )}
                          {alert.revenue_loss_per_month != null && alert.revenue_loss_per_month > 0 && (
                            <span className="text-rose-600">revenue loss: {fmt$(alert.revenue_loss_per_month)}/mo</span>
                          )}
                          {alert.net_financial_impact != null && (
                            <span className={`font-bold ${alert.net_financial_impact >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              net: {alert.net_financial_impact >= 0 ? '+' : ''}{fmt$(alert.net_financial_impact)}/mo
                            </span>
                          )}
                          {alert.taste_degradation_pct != null && alert.taste_degradation_pct > 0 && (
                            <span className="text-amber-600">taste: -{alert.taste_degradation_pct}%</span>
                          )}
                          {alert.customer_perception_risk && (
                            <span className={alert.customer_perception_risk === 'high' ? 'text-rose-600 font-medium' : ''}>perception: {alert.customer_perception_risk}</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Decided
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Testing
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
          <span>Taste threshold: {config.tasteThreshold}%</span>
          <span>Reorder threshold: {config.reorderThreshold}%</span>
          <span>Perception threshold: {config.perceptionThreshold}</span>
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

export default IngredientSubstitutionImpactScreen;
