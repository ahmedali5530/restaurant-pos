/**
 * AI Loyalty ROI Predictor — predict revenue uplift from loyalty enrollment.
 *
 * 42nd POSR-exclusive differentiator — restaurants leave 20-30% revenue on
 * the table by not recruiting high-propensity prospects with the right incentive.
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
  faCrown, faRotate, faLightbulb, faCheckCircle, faUserPlus,
  faArrowTrendUp, faUserClock, faBullseye,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runLoyaltyRoiEngine, getActivePredictions, getSummary, updatePredictionStatus,
  readLoyaltyRoiConfig, DEFAULT_LOYALTY_ROI_CONFIG,
  type LoyaltyRoiPrediction,
} from "@/lib/loyalty-roi.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  high_propensity_prospect:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faUserPlus,       label: 'High-Propensity Prospect' },
  tier_upgrade_opportunity:  { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faArrowTrendUp,   label: 'Tier Upgrade' },
  incentive_roi:              { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBullseye,       label: 'Incentive ROI' },
  churned_prospect:          { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUserClock,      label: 'Churned Prospect' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

export function LoyaltyRoiScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<LoyaltyRoiPrediction[]>([]);
  const [summary, setSummary] = useState({ prospectCount: 0, memberCount: 0, avgUpliftPct: 0, totalRevenueGain: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_LOYALTY_ROI_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readLoyaltyRoiConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActivePredictions(db), getSummary(db)]);
      setPredictions(list); setSummary(sum);
    } catch (err) { console.error('[loyalty-roi-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runLoyaltyRoiEngine(db, config);
      toast.success(result.predictions.length > 0
        ? `Generated ${result.predictions.length} predictions — ${result.predictions.filter(p => p.rule_id === 'high_propensity_prospect').length} prospects, ${result.predictions.filter(p => p.rule_id === 'incentive_roi').length} incentive scenarios`
        : `No predictions — try longer lookback window`);
      await reload();
    } catch (err) { console.error('[loyalty-roi-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (predictionId: string, status: 'enrolled' | 'declined') => {
    try { await updatePredictionStatus(db, predictionId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Top prospects (filter + sort by score)
  const prospects = predictions
    .filter(p => p.rule_id === 'high_propensity_prospect' || p.rule_id === 'churned_prospect')
    .sort((a, b) => b.prospect_score - a.prospect_score)
    .slice(0, 12);

  // Incentive ROI matrix
  const incentives = predictions.filter(p => p.rule_id === 'incentive_roi');

  return (
    <Layout>
      <DocumentTitle parts={["Loyalty ROI", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCrown} className="text-amber-600" />
              Loyalty ROI Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              AI predicts revenue uplift from loyalty enrollment + identifies prospects (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Predicting…' : 'Run ROI analysis'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : predictions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCrown} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No loyalty ROI predictions yet!</p>
            <p className="text-sm mt-1">Click "Run ROI analysis" to identify prospects + project revenue uplift.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faUserPlus} />Prospects</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.prospectCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faCrown} />Members</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.memberCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowTrendUp} />Avg uplift</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.avgUpliftPct.toFixed(1)}%</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600">90-day gain</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalRevenueGain)}</div>
              </div>
            </div>

            {/* Incentive ROI matrix */}
            {incentives.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faBullseye} className="text-amber-600" />
                  Sign-up Incentive ROI Matrix
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {incentives.map((p, idx) => {
                    const isBest = idx === incentives.reduce((best, cur, i) =>
                      (cur.prospect_score > incentives[best].prospect_score ? i : best), 0);
                    return (
                      <div key={idx} className={`rounded-lg border p-3 ${isBest ? 'border-amber-400 bg-amber-50/70' : 'border-neutral-200 bg-neutral-50'}`}>
                        {isBest && <div className="text-xs font-bold text-amber-700 mb-1">★ BEST ROI</div>}
                        <div className="flex items-baseline justify-between">
                          <span className="text-3xl font-bold text-amber-700 tabular-nums">{p.suggested_incentive_pct}%</span>
                          <span className="text-xs text-neutral-500">discount</span>
                        </div>
                        <div className="mt-2 space-y-1 text-xs">
                          <div className="flex justify-between"><span className="text-neutral-500">Conversion:</span><span className="font-semibold tabular-nums">{p.est_conversion_pct}%</span></div>
                          <div className="flex justify-between"><span className="text-neutral-500">Revenue gain:</span><span className="font-semibold text-emerald-600 tabular-nums">{withCurrency(p.est_revenue_gain)}</span></div>
                          <div className="flex justify-between"><span className="text-neutral-500">ROI score:</span><span className="font-bold tabular-nums">{p.prospect_score}/100</span></div>
                        </div>
                        <p className="mt-2 text-xs text-neutral-500 italic">{p.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top prospects table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faUserPlus} className="text-emerald-600" />
                  Top Prospects (sorted by score)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Customer</th>
                      <th className="p-3 text-center">Type</th>
                      <th className="p-3 text-right">Score</th>
                      <th className="p-3 text-right">Proj. LTV</th>
                      <th className="p-3 text-right">Uplift</th>
                      <th className="p-3 text-right">Incentive</th>
                      <th className="p-3 text-right">90d gain</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.map((p, idx) => {
                      const style = RULE_STYLE[p.rule_id] ?? RULE_STYLE.high_propensity_prospect;
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[p.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">{p.customer_name ?? '—'}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{p.description}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label.split(' ')[0]}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="font-bold tabular-nums">{p.prospect_score}</div>
                            <div className="h-1 mt-1 bg-neutral-100 rounded">
                              <div className={`h-1 rounded ${p.prospect_score > 75 ? 'bg-emerald-500' : p.prospect_score > 50 ? 'bg-amber-500' : 'bg-neutral-300'}`} style={{ width: `${p.prospect_score}%` }}></div>
                            </div>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold">{withCurrency(p.projected_ltv)}</td>
                          <td className="p-3 text-right tabular-nums text-emerald-600">+{p.ltv_uplift_pct.toFixed(0)}%</td>
                          <td className="p-3 text-right tabular-nums">
                            {p.suggested_incentive_pct ? <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">{p.suggested_incentive_pct}%</span> : '—'}
                          </td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">{withCurrency(p.est_revenue_gain)}</td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => p.id && handleStatus(p.id, 'enrolled')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                                <FontAwesomeIcon icon={faCheckCircle} /> Enroll
                              </button>
                              <button onClick={() => p.id && handleStatus(p.id, 'declined')} className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                                Skip
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tier upgrade opportunities */}
            {predictions.filter(p => p.rule_id === 'tier_upgrade_opportunity').length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <FontAwesomeIcon icon={faArrowTrendUp} className="text-violet-600" />
                    Tier Upgrade Opportunities
                  </h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="p-3 text-left">Member</th>
                      <th className="p-3 text-left">Description</th>
                      <th className="p-3 text-right">Score</th>
                      <th className="p-3 text-right">Est. Gain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.filter(p => p.rule_id === 'tier_upgrade_opportunity').slice(0, 8).map((p, idx) => (
                      <tr key={idx} className="border-b border-neutral-100">
                        <td className="p-3 font-medium">{p.customer_name}</td>
                        <td className="p-3 text-xs text-neutral-600">{p.description}</td>
                        <td className="p-3 text-right tabular-nums font-bold">{p.prospect_score}</td>
                        <td className="p-3 text-right tabular-nums text-emerald-600 font-semibold">{withCurrency(p.est_revenue_gain)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* AI insights */}
            {predictions.filter(p => p.ai_insight).slice(0, 5).map((p, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{p.customer_name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Score {p.prospect_score}</span>
                  {p.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{p.ai_recommendation.replace('_', ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{p.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Min score: <strong>{config.minProspectScore}</strong></span>
              <span>Baseline uplift: <strong>+{(config.baselineUpliftPct * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default LoyaltyRoiScreen;
