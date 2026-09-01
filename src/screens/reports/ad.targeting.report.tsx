/**
 * AI Social Media Ad Targeting Optimizer — POS-integrated ad optimization dashboard.
 *
 * 68th POSR-exclusive differentiator — POS-integrated ad targeting sees 3-5x
 * ROI improvement (Meta case studies).
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
  faBullhorn, faRotate, faLightbulb, faCheckCircle,
  faUsers, faArrowTrendUp, faUserMinus, faChartBar, faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runAdEngine, getActiveRecommendations, getSummary, updateRecommendationStatus,
  readAdConfig, DEFAULT_AD_CONFIG,
  type AdTargeting,
} from "@/lib/ad-targeting.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  lookalike_audience:      { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faUsers,           label: 'LOOKALIKE' },
  high_value_retarget:     { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faArrowTrendUp,   label: 'RETARGET' },
  lapsed_customer_winback: { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUserMinus,      label: 'WINBACK' },
  demographic_optimize:    { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faChartBar,        label: 'DEMOGRAPHIC' },
  budget_optimize:         { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faDollarSign,     label: 'BUDGET' },
};

const PLATFORM_ICON: Record<string, string> = {
  facebook: '📘', instagram: '📸', tiktok: '🎵', google_ads: '🔍', twitter: '🐦', all: '🌐',
};

const roasColor = (roas: number): string => {
  if (roas >= 4) return 'text-emerald-600';
  if (roas >= 2) return 'text-yellow-600';
  if (roas >= 1) return 'text-amber-600';
  return 'text-rose-600';
};

export function AdTargetingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [recommendations, setRecommendations] = useState<AdTargeting[]>([]);
  const [summary, setSummary] = useState({ campaignCount: 0, totalBudget: 0, totalRevenue: 0, avgRoas: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_AD_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readAdConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRecommendations(db), getSummary(db)]);
      setRecommendations(list); setSummary(sum);
    } catch (err) { console.error('[ad-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runAdEngine(db, config);
      toast.success(result.recommendations.length > 0
        ? `Generated ${result.recommendations.length} ad targeting recommendations — avg ${(result.recommendations.reduce((s, r) => s + r.est_roas, 0) / result.recommendations.length).toFixed(1)}x ROAS`
        : `No ad recommendations — need customer segments from order history`);
      await reload();
    } catch (err) { console.error('[ad-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (recId: string, status: 'launched' | 'paused' | 'completed') => {
    try { await updateRecommendationStatus(db, recId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedRecs = [...recommendations].sort((a, b) => b.est_roas - a.est_roas);

  return (
    <Layout>
      <DocumentTitle parts={["Ad Targeting", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBullhorn} className="text-blue-600" />
              AI Ad Targeting
            </h1>
            <p className="text-sm text-neutral-500">
              POS-integrated ad optimization — 3-5x ROI improvement (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Optimizing…' : 'Optimize ads'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : recommendations.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBullhorn} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No ad recommendations!</p>
            <p className="text-sm mt-1">Click "Optimize ads" to generate audience targeting from POS data.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faBullhorn} />Campaigns</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.campaignCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Daily budget</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{withCurrency(summary.totalBudget)}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Est. daily revenue</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalRevenue)}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg ROAS</div>
                <div className={`text-2xl font-bold tabular-nums ${roasColor(summary.avgRoas)}`}>{summary.avgRoas.toFixed(1)}x</div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faBullhorn} className="text-blue-600" />
                  Ad Campaign Recommendations (sorted by ROAS)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Campaign</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Budget/day</th>
                      <th className="p-3 text-right">Est reach</th>
                      <th className="p-3 text-right">Est clicks</th>
                      <th className="p-3 text-right">Conversions</th>
                      <th className="p-3 text-right">Revenue/day</th>
                      <th className="p-3 text-right">ROAS</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecs.map((r, idx) => {
                      const style = RULE_STYLE[r.rule_id] ?? RULE_STYLE.lookalike_audience;
                      const platformIcon = PLATFORM_ICON[r.platform] ?? '📢';
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{platformIcon}</span>
                              <span className="font-medium">{r.audience_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{r.description}</p>
                            {r.source_segment && <p className="text-xs text-blue-500 mt-0.5">Source: {r.source_segment}</p>}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold text-amber-600">{withCurrency(r.suggested_budget)}</td>
                          <td className="p-3 text-right tabular-nums">{r.est_reach.toLocaleString()}</td>
                          <td className="p-3 text-right tabular-nums">{r.est_clicks}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">{r.est_conversions}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">{withCurrency(r.est_revenue)}</td>
                          <td className="p-3 text-right">
                            <span className={`text-lg font-bold tabular-nums ${roasColor(r.est_roas)}`}>{r.est_roas.toFixed(1)}x</span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              <button onClick={() => r.id && handleStatus(r.id, 'launched')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap font-medium">
                                <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Launch
                              </button>
                              <button onClick={() => r.id && handleStatus(r.id, 'paused')} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">
                                Pause
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

            {/* AI insights */}
            {recommendations.filter(r => r.ai_insight).slice(0, 5).map((r, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{PLATFORM_ICON[r.platform] ?? '📢'}</span>
                  <span className="text-xs font-bold text-violet-600">{r.audience_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[r.rule_id].bg} ${RULE_STYLE[r.rule_id].text}`}>{r.rule_id.replace(/_/g, ' ')}</span>
                  {r.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{r.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{r.ai_insight}</p>
              </div>
            ))}

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Default budget: <strong>{withCurrency(config.defaultBudget)}/day</strong></span>
              <span>Target ROAS: <strong>{config.targetRoas}x</strong></span>
              <span>Lookalike source: <strong className="capitalize">{config.lookalikeSource}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default AdTargetingScreen;
