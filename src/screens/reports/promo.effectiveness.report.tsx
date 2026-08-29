/**
 * Promo Effectiveness Dashboard — measure promotion ROI + impact.
 *
 * Research finding: Toast Promo Analytics + Square Campaign Reporting
 * bundle promo performance measurement in higher tiers (~$40/mo). POSR
 * offers it free.
 *
 * Layout:
 *   1. Summary cards (total promos, total redeemed, total discount, overall ROI)
 *   2. Overall grade banner
 *   3. Promo table (sortable: ROI, revenue, discount, new customers)
 *   4. AI recommendations summary (scale/keep/rework/kill counts)
 *   5. Generate button
 *
 * Placement: new route /reports/promo-effectiveness
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
  faTags, faCheckCircle, faDollarSign, faArrowTrendUp, faRobot, faRotate,
  faLightbulb, faStar, faXmark, faScaleBalanced,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  computePromoEffectiveness,
  getPromoEffectiveness,
  readPromoConfig,
  DEFAULT_PROMO_CONFIG,
  type PromoEffectiveness,
  type PromoGrade,
  type PromoAction,
} from "@/lib/promo-analytics.service.ts";

const GRADE_STYLE: Record<PromoGrade, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'A — Excellent (ROI > 200%)' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'B — Good (100-200%)' },
  C: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'C — Marginal (0-100%)' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'D — Losing (negative)' },
  F: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'F — Kill (< -50%)' },
};

const ACTION_STYLE: Record<PromoAction, { bg: string; text: string; label: string; icon: any }> = {
  scale: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Scale', icon: faScaleBalanced },
  keep: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Keep', icon: faCheckCircle },
  rework: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Rework', icon: faRotate },
  kill: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Kill', icon: faXmark },
};

export function PromoEffectivenessScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [promos, setPromos] = useState<PromoEffectiveness[]>([]);
  const [overall, setOverall] = useState<PromoEffectiveness | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_PROMO_CONFIG);
  const [sortBy, setSortBy] = useState<'roi' | 'revenue' | 'discount' | 'redeemed' | 'name'>('roi');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPromoConfig(settingsRows[0] ?? {}));
      const { promos: promoList, overall: overallData } = await getPromoEffectiveness(db);
      setPromos(promoList);
      setOverall(overallData);
    } catch (err) {
      console.error('[promo-report] reload failed', err);
      toast.error('Failed to load promo data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleCompute = useCallback(async () => {
    setComputing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await computePromoEffectiveness(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setPromos(result.promos);
      setOverall(result.overall);
      toast.success(
        result.promos.length > 0
          ? `Analyzed ${result.promos.length} promos — overall ROI ${result.overall?.roi ?? 0}%, ${result.overall?.times_redeemed ?? 0} redemptions`
          : 'No promos found with enough redemptions to analyze'
      );
    } catch (err) {
      console.error('[promo-report] compute failed', err);
      toast.error('Computation failed — see console');
    } finally {
      setComputing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const sortedPromos = useMemo(() => {
    const sorted = [...promos];
    switch (sortBy) {
      case 'roi': sorted.sort((a, b) => b.roi - a.roi); break;
      case 'revenue': sorted.sort((a, b) => b.revenue_generated - a.revenue_generated); break;
      case 'discount': sorted.sort((a, b) => b.total_discount_given - a.total_discount_given); break;
      case 'redeemed': sorted.sort((a, b) => b.times_redeemed - a.times_redeemed); break;
      case 'name': sorted.sort((a, b) => a.promo_name.localeCompare(b.promo_name)); break;
    }
    return sorted;
  }, [promos, sortBy]);

  const actionCounts = useMemo(() => {
    const counts: Record<PromoAction, number> = { scale: 0, keep: 0, rework: 0, kill: 0 };
    for (const p of promos) {
      if (p.ai_action) counts[p.ai_action]++;
    }
    return counts;
  }, [promos]);

  return (
    <Layout>
      <DocumentTitle parts={["Promo Effectiveness", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTags} className="text-orange-600" />
              Promo Effectiveness
            </h1>
            <p className="text-sm text-neutral-500">
              Redemption rate + ROI + revenue impact per promotion + AI recommendations (scale/keep/rework/kill)
            </p>
          </div>
          <Button onClick={handleCompute} disabled={computing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={computing} />
            {computing ? `Computing… (${progress.current}/${progress.total})` : 'Compute effectiveness'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading promo data…</p>
          </div>
        ) : !overall ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTags} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No promo analytics yet</p>
            <p className="text-sm mt-1">Click "Compute effectiveness" to analyze coupon + discount performance.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faTags} label="Promos" value={promos.length} color="text-orange-600" />
              <SummaryCard icon={faCheckCircle} label="Redeemed" value={overall.times_redeemed} color="text-blue-600" />
              <SummaryCard icon={faDollarSign} label="Discount given" value={withCurrency(overall.total_discount_given)} color="text-rose-600" />
              <SummaryCard
                icon={faArrowTrendUp}
                label="Overall ROI"
                value={`${overall.roi > 0 ? '+' : ''}${overall.roi}%`}
                color={overall.roi > 100 ? 'text-emerald-600' : overall.roi > 0 ? 'text-amber-600' : 'text-rose-600'}
              />
            </div>

            {/* Overall grade banner */}
            {(() => {
              const grade = GRADE_STYLE[overall.grade];
              return (
                <div className={`rounded-lg border-2 p-4 ${grade.bg} ${grade.bg.replace('text-', 'border-').split(' ')[0]}`}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`text-4xl font-bold ${grade.text}`}>{overall.grade}</div>
                      <div>
                        <div className={`text-lg font-bold ${grade.text}`}>{grade.label}</div>
                        <div className="text-xs text-neutral-600">
                          {overall.times_redeemed} redemptions · {withCurrency(overall.revenue_generated)} revenue · {overall.new_customer_pct}% new customers
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">Revenue generated</div>
                      <div className="text-2xl font-bold text-emerald-600 tabular-nums">{withCurrency(overall.revenue_generated)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* AI recommendations summary */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <FontAwesomeIcon icon={faLightbulb} className="text-amber-500" />
                AI recommendations
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['scale', 'keep', 'rework', 'kill'] as PromoAction[]).map(action => {
                  const style = ACTION_STYLE[action];
                  return (
                    <div key={action} className={`p-3 rounded-lg ${style.bg}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <FontAwesomeIcon icon={style.icon} className={style.text} />
                        <span className={`text-sm font-medium ${style.text}`}>{style.label}</span>
                      </div>
                      <div className={`text-2xl font-bold ${style.text}`}>{actionCounts[action]}</div>
                      <div className="text-xs text-neutral-500">promos</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sort controls */}
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-neutral-500">Sort by:</span>
              {(['roi', 'revenue', 'discount', 'redeemed', 'name'] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={`px-3 py-1 rounded text-xs capitalize transition-colors ${sortBy === s ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>
                  {s === 'redeemed' ? 'Redemptions' : s === 'discount' ? 'Discount $' : s}
                </button>
              ))}
            </div>

            {/* Promo table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Promo</th>
                      <th className="text-center p-3">Grade</th>
                      <th className="text-right p-3">Redeemed</th>
                      <th className="text-right p-3">Discount $</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">ROI</th>
                      <th className="text-right p-3">Order lift</th>
                      <th className="text-right p-3">New cust %</th>
                      <th className="text-center p-3">AI action</th>
                      <th className="text-left p-3">AI insight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPromos.length === 0 ? (
                      <tr><td colSpan={10} className="p-6 text-center text-neutral-400">No promos meet the minimum redemption threshold ({config.minRedemptions}).</td></tr>
                    ) : (
                      sortedPromos.map((promo, idx) => {
                        const grade = GRADE_STYLE[promo.grade];
                        const actionStyle = promo.ai_action ? ACTION_STYLE[promo.ai_action] : null;
                        return (
                          <tr key={idx} className="border-t hover:bg-neutral-50">
                            <td className="p-3">
                              <div className="font-medium">{promo.promo_name}</div>
                              {promo.promo_code && <div className="text-xs text-neutral-500 font-mono">{promo.promo_code}</div>}
                              <div className="text-xs text-neutral-400 capitalize">{promo.promo_type} · {promo.discount_type ?? ''} {promo.discount_value ?? ''}{promo.discount_type === 'percent' ? '%' : ''}</div>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`inline-block w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center mx-auto ${grade.bg} ${grade.text}`}>
                                {promo.grade}
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums">{promo.times_redeemed}</td>
                            <td className="p-3 text-right tabular-nums text-rose-600">{withCurrency(promo.total_discount_given)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold text-emerald-600">{withCurrency(promo.revenue_generated)}</td>
                            <td className="p-3 text-right tabular-nums">
                              <span className={promo.roi > 100 ? 'text-emerald-600 font-semibold' : promo.roi > 0 ? 'text-amber-600' : 'text-rose-600 font-semibold'}>
                                {promo.roi > 0 ? '+' : ''}{promo.roi}%
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              <span className={promo.order_lift_pct > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {promo.order_lift_pct > 0 ? '+' : ''}{promo.order_lift_pct}%
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {promo.new_customer_pct > 0 ? <span className="text-blue-600">{promo.new_customer_pct}%</span> : '—'}
                            </td>
                            <td className="p-3 text-center">
                              {actionStyle && (
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${actionStyle.bg} ${actionStyle.text}`}>
                                  <FontAwesomeIcon icon={actionStyle.icon} className="text-xs" />
                                  {actionStyle.label}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-xs text-violet-600 italic max-w-xs">
                              {promo.ai_insight ? `"${promo.ai_insight}"` : <span className="text-neutral-400">—</span>}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min redemptions: <strong>{config.minRedemptions}</strong></span>
              <span>Assumed margin: <strong>{config.assumedMarginPct}%</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Promos evaluated: <strong>{promos.length}</strong></span>
              <span>Total unique customers: <strong>{overall.unique_customers}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon, label, value, color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default PromoEffectivenessScreen;
