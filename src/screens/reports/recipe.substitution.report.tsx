/**
 * Recipe Substitution Dashboard — AI ingredient substitution suggestions.
 *
 * 22nd POSR-exclusive differentiator — Toast and Square have recipe tracking
 * but NO substitution intelligence. POSR suggests best substitute when
 * ingredient is out of stock, expensive, or about to spoil.
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
  faExchangeAlt, faRobot, faRotate, faLightbulb,
  faCheckCircle, faXmark, faEye, faArrowRightArrowLeft,
  faTriangleExclamation, faDollarSign, faCube,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runSubstitutionAnalysis,
  getActiveSuggestions,
  getSubstitutionSummary,
  updateSubstitutionAction,
  readSubstitutionConfig,
  DEFAULT_SUBSTITUTION_CONFIG,
  type SubstitutionSuggestion,
  type SubstitutionTrigger,
  type SubstitutionRecommendation,
} from "@/lib/recipe-substitution.service.ts";

const TRIGGER_STYLE: Record<SubstitutionTrigger, { bg: string; text: string; label: string }> = {
  stockout:             { bg: 'bg-rose-100',   text: 'text-rose-700',   label: 'Stockout' },
  price_spike:          { bg: 'bg-amber-100',   text: 'text-amber-700',  label: 'Price spike' },
  spoilage_risk:        { bg: 'bg-orange-100',  text: 'text-orange-700', label: 'Spoilage risk' },
  dietary_restriction:  { bg: 'bg-violet-100',  text: 'text-violet-700', label: 'Dietary' },
};

const REC_LABEL: Record<SubstitutionRecommendation, string> = {
  use_substitute: 'Use substitute',
  order_more: 'Order more',
  reformulate: 'Reformulate',
  keep_original: 'Keep original',
};

const REC_STYLE: Record<SubstitutionRecommendation, string> = {
  use_substitute: 'bg-emerald-100 text-emerald-700',
  order_more: 'bg-amber-100 text-amber-700',
  reformulate: 'bg-violet-100 text-violet-700',
  keep_original: 'bg-neutral-100 text-neutral-600',
};

export function RecipeSubstitutionScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [suggestions, setSuggestions] = useState<SubstitutionSuggestion[]>([]);
  const [summary, setSummary] = useState({
    total: 0, stockout: 0, priceSpike: 0, spoilageRisk: 0, totalSavings: 0, highScoreCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_SUBSTITUTION_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSubstitutionConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getActiveSuggestions(db),
        getSubstitutionSummary(db),
      ]);
      setSuggestions(list);
      setSummary(sum);
    } catch (err) {
      console.error('[substitution-report] reload failed', err);
      toast.error('Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runSubstitutionAnalysis(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.suggestions.length > 0
          ? `Scanned ${result.scanned} items — ${result.suggestions.length} substitution suggestions (${withCurrency(summary.totalSavings)}/mo savings)`
          : `No items needing substitution found`
      );
      await reload();
    } catch (err) {
      console.error('[substitution-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload, summary.totalSavings]);

  const handleAction = useCallback(async (sugId: string, action: string) => {
    try {
      await updateSubstitutionAction(db, sugId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Recipe Substitution", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faExchangeAlt} className="text-violet-600" />
              Recipe Substitution
            </h1>
            <p className="text-sm text-neutral-500">
              AI ingredient substitution — flavor + cost + availability scoring + substitution ratio (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Run analysis'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading suggestions…</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No substitutions needed!</p>
            <p className="text-sm mt-1">All ingredients in stock and well-priced. Click "Run analysis" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Stockout</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.stockout}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Price spike</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.priceSpike}</div>
              </div>
              <div className="bg-orange-50 rounded-lg border border-orange-200 p-3 text-center">
                <div className="text-xs text-orange-600">Spoilage risk</div>
                <div className="text-2xl font-bold text-orange-700 tabular-nums">{summary.spoilageRisk}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">High score</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.highScoreCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Total suggestions</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Monthly savings</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalSavings)}</div>
              </div>
            </div>

            {/* Suggestion list */}
            <div className="space-y-3">
              {suggestions.map((sug, idx) => {
                const triggerStyle = TRIGGER_STYLE[sug.trigger_reason] ?? TRIGGER_STYLE.stockout;
                return (
                  <div key={idx} className="rounded-lg border-2 p-4 bg-white border-neutral-200">
                    {/* Top: original → substitute */}
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-3 flex-wrap">
                        <FontAwesomeIcon icon={faExchangeAlt} className="text-xl text-violet-600" />
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-xs text-neutral-500">Original</div>
                            <span className="font-semibold">{sug.original_item_name}</span>
                            {sug.original_category && <span className="text-xs text-neutral-400 ml-1">({sug.original_category})</span>}
                          </div>
                          <FontAwesomeIcon icon={faArrowRightArrowLeft} className="text-neutral-400 mx-2" />
                          <div>
                            <div className="text-xs text-neutral-500">Substitute</div>
                            <span className="font-semibold text-violet-700">{sug.substitute_item_name}</span>
                            {sug.substitute_category && <span className="text-xs text-neutral-400 ml-1">({sug.substitute_category})</span>}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${triggerStyle.bg} ${triggerStyle.text}`}>
                          {triggerStyle.label}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Overall score</div>
                        <div className={`text-2xl font-bold tabular-nums ${sug.overall_score >= 0.7 ? 'text-emerald-600' : sug.overall_score >= 0.5 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {Math.round(sug.overall_score * 100)}/100
                        </div>
                      </div>
                    </div>

                    {/* Score breakdown */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2 bg-neutral-50 rounded p-3 text-sm">
                      <div>
                        <div className="text-xs text-neutral-500">Category match</div>
                        <div className={`font-bold tabular-nums ${sug.category_match_score >= 0.8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {Math.round(sug.category_match_score * 100)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Cost score</div>
                        <div className={`font-bold tabular-nums ${sug.cost_score >= 0.7 ? 'text-emerald-600' : sug.cost_score >= 0.4 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {Math.round(sug.cost_score * 100)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1"><FontAwesomeIcon icon={faCube} />Availability</div>
                        <div className={`font-bold tabular-nums ${sug.availability_score >= 0.8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {Math.round(sug.availability_score * 100)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Price diff</div>
                        <div className={`font-bold tabular-nums ${sug.price_difference <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {sug.price_difference <= 0 ? '-' : '+'}{withCurrency(Math.abs(sug.price_difference))}
                        </div>
                        <div className="text-[10px] text-neutral-400">{withCurrency(sug.original_price)} → {withCurrency(sug.substitute_price)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Sub. ratio</div>
                        <div className="font-bold tabular-nums text-neutral-700">{sug.substitution_ratio.toFixed(2)}×</div>
                        <div className="text-[10px] text-neutral-400">{sug.affected_recipes} recipes affected</div>
                      </div>
                    </div>

                    {/* Monthly savings */}
                    {sug.est_monthly_savings > 0 && (
                      <div className="bg-emerald-50 rounded p-2 mb-2 border border-emerald-200">
                        <p className="text-xs text-emerald-700 font-medium">
                          <FontAwesomeIcon icon={faDollarSign} className="mr-1" />Est. monthly savings: {withCurrency(sug.est_monthly_savings)} if substitute adopted across {sug.affected_recipes} recipes
                        </p>
                      </div>
                    )}

                    {/* AI insight */}
                    {sug.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{sug.ai_insight}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 items-center flex-wrap">
                      {sug.ai_recommendation && (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${REC_STYLE[sug.ai_recommendation]}`}>
                          AI: {REC_LABEL[sug.ai_recommendation]}
                        </span>
                      )}
                      <div className="ml-auto flex gap-1 flex-wrap">
                        <button onClick={() => sug.id && handleAction(sug.id, 'substituted')}
                          className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                          <FontAwesomeIcon icon={faCheckCircle} /> Substituted
                        </button>
                        <button onClick={() => sug.id && handleAction(sug.id, 'ordered')}
                          className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200">
                          Ordered original
                        </button>
                        <button onClick={() => sug.id && handleAction(sug.id, 'reformulated')}
                          className="px-2 py-1 rounded text-xs bg-violet-100 text-violet-700 hover:bg-violet-200">
                          <FontAwesomeIcon icon={faExchangeAlt} /> Reformulated
                        </button>
                        <button onClick={() => sug.id && handleAction(sug.id, 'dismissed')}
                          className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          <FontAwesomeIcon icon={faXmark} /> Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Price spike: <strong>&gt; {(config.priceSpikePct * 100).toFixed(0)}% above median</strong></span>
              <span>Cost tolerance: <strong>±{(config.costTolerancePct * 100).toFixed(0)}%</strong></span>
              <span>Min score: <strong>{config.minScore.toFixed(2)}</strong></span>
              <span>Max candidates: <strong>{config.maxCandidates}</strong> per ingredient</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default RecipeSubstitutionScreen;
