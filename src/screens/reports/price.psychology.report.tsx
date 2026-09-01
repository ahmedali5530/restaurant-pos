/**
 * AI Menu Price Psychology Optimizer — behavioral economics dashboard.
 *
 * 70th POSR-exclusive differentiator — behavioral economics drives 15-30%
 * of menu order decisions (Cornell).
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
  faBrain, faRotate, faLightbulb, faCheckCircle,
  faTag, faAnchor, faLayerGroup, faArrowsUpDown, faFlask,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPricePsychEngine, getActiveRecommendations, getSummary, updateRecStatus,
  readPricePsychConfig, DEFAULT_PRICE_PSYCH_CONFIG,
  type PricePsychology,
} from "@/lib/price-psychology.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  charm_pricing:      { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTag,          label: 'CHARM' },
  price_anchor:       { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faAnchor,       label: 'ANCHOR' },
  decoy_effect:       { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faLayerGroup,   label: 'DECOY' },
  position_optimize:  { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faArrowsUpDown, label: 'POSITION' },
  bracketing:         { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faLayerGroup,   label: 'BRACKET' },
};

const liftColor = (pct: number): string => pct > 20 ? 'text-emerald-600' : pct > 10 ? 'text-yellow-600' : 'text-amber-600';

export function PricePsychologyScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [recs, setRecs] = useState<PricePsychology[]>([]);
  const [summary, setSummary] = useState({ recCount: 0, totalRevenueLift: 0, avgSalesLift: 0, abTestCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PRICE_PSYCH_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPricePsychConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRecommendations(db), getSummary(db)]);
      setRecs(list); setSummary(sum);
    } catch (err) { console.error('[price-psych-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPricePsychEngine(db, config);
      toast.success(result.recommendations.length > 0
        ? `Generated ${result.recommendations.length} psychology recommendations — est ${withCurrency(result.recommendations.reduce((s, r) => s + r.est_revenue_lift, 0))} revenue lift`
        : `No psychology opportunities — prices already optimized`);
      await reload();
    } catch (err) { console.error('[price-psych-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (recId: string, status: 'applied' | 'testing' | 'declined') => {
    try { await updateRecStatus(db, recId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedRecs = [...recs].sort((a, b) => b.est_revenue_lift - a.est_revenue_lift);

  return (
    <Layout>
      <DocumentTitle parts={["Price Psychology", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBrain} className="text-violet-600" />
              AI Price Psychology
            </h1>
            <p className="text-sm text-neutral-500">
              Behavioral economics for menus — charm pricing, anchoring, decoy, position (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Optimize prices'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : recs.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBrain} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No psychology opportunities!</p>
            <p className="text-sm mt-1">Click "Optimize prices" to apply behavioral economics to your menu.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faBrain} />Recommendations</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.recCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Est. revenue lift</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalRevenueLift)}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Avg sales lift</div>
                <div className={`text-2xl font-bold tabular-nums ${liftColor(summary.avgSalesLift * 100)}`}>+{(summary.avgSalesLift * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faFlask} />A/B tests</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.abTestCount}</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedRecs.map((r, idx) => {
                const style = RULE_STYLE[r.rule_id] ?? RULE_STYLE.charm_pricing;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          <span className="font-medium">{r.dish_name}</span>
                          {r.current_price > 0 && r.suggested_price && (
                            <span className="text-sm">
                              <span className="text-neutral-400 line-through">{withCurrency(r.current_price)}</span>
                              <span className="text-emerald-600 font-bold ml-1">→ {withCurrency(r.suggested_price)}</span>
                            </span>
                          )}
                          {r.ab_test_suggested && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                              <FontAwesomeIcon icon={faFlask} className="mr-1" />A/B test
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Sales: <strong className={liftColor(r.est_sales_lift_pct * 100)}>+{(r.est_sales_lift_pct * 100).toFixed(0)}%</strong></span>
                          <span className="text-neutral-500">Revenue: <strong className="text-emerald-600">{withCurrency(r.est_revenue_lift)}</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{r.description}</p>
                    </div>

                    <div className="p-3">
                      {r.psychology_effect && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-100">
                          <p className="text-xs text-violet-700"><FontAwesomeIcon icon={faBrain} className="mr-1" /><strong>Psychology:</strong> {r.psychology_effect}</p>
                        </div>
                      )}

                      {r.margin_impact !== 0 && (
                        <div className={`mb-3 p-2 rounded border ${r.margin_impact > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                          <p className={`text-xs ${r.margin_impact > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            <strong>Margin impact:</strong> {r.margin_impact > 0 ? '+' : ''}{withCurrency(r.margin_impact)} ({r.margin_impact > 0 ? 'positive' : 'slight cost'})
                          </p>
                        </div>
                      )}

                      {r.current_position && r.suggested_position && (
                        <div className="mb-3 p-2 rounded bg-blue-50 border border-blue-100">
                          <p className="text-xs text-blue-700"><strong>Reposition:</strong> #{r.current_position} → #{r.suggested_position} (top-right quadrant)</p>
                        </div>
                      )}

                      {r.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{r.ai_insight}</p>
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => r.id && handleStatus(r.id, 'applied')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Apply
                        </button>
                        {r.ab_test_suggested && (
                          <button onClick={() => r.id && handleStatus(r.id, 'testing')} className="text-xs px-3 py-1.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium">
                            <FontAwesomeIcon icon={faFlask} className="mr-1" />A/B Test
                          </button>
                        )}
                        <button onClick={() => r.id && handleStatus(r.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Charm pricing: <strong>{config.charmEnabled ? 'on' : 'off'}</strong></span>
              <span>Anchor count: <strong>{config.anchorCount}</strong></span>
              <span>A/B test: <strong>{config.abTestDuration}d</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default PricePsychologyScreen;
