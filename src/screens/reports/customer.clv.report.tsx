/**
 * Customer Lifetime Value Dashboard — RFM segmentation + CLV prediction.
 *
 * Research finding: Toast Customer 360 + Square Customer Insights bundle
 * CLV prediction in higher tiers (~$45/mo). POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (total customers, total CLV, avg CLV, at-risk count)
 *   2. Segment distribution (champion/loyal/potential/new/at_risk/cant_lose/hibernating)
 *   3. Filter by segment chips
 *   4. Top customers table (CLV, RFM, churn risk, AI recommendation)
 *   5. Generate button
 *
 * Placement: new route /reports/customer-clv
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
  faUsers, faDollarSign, faArrowTrendUp, faTriangleExclamation, faRobot,
  faRotate, faCrown, faHeart, faSeedling, faUserPlus, faClock, faSkull,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  computeAllCLV,
  getCLVList,
  readCLVConfig,
  DEFAULT_CLV_CONFIG,
  type CustomerCLV,
  type CustomerSegment,
  type CLVRecommendation,
} from "@/lib/clv.service.ts";

const SEGMENT_META: Record<CustomerSegment, { icon: any; color: string; bg: string; label: string }> = {
  champion:    { icon: faCrown,    color: 'text-amber-600',    bg: 'bg-amber-100',    label: 'Champions' },
  loyal:       { icon: faHeart,    color: 'text-rose-600',    bg: 'bg-rose-100',     label: 'Loyal' },
  potential:   { icon: faSeedling, color: 'text-emerald-600', bg: 'bg-emerald-100',  label: 'Potential' },
  new:         { icon: faUserPlus, color: 'text-blue-600',    bg: 'bg-blue-100',     label: 'New' },
  at_risk:     { icon: faClock,    color: 'text-orange-600',  bg: 'bg-orange-100',   label: 'At Risk' },
  cant_lose:   { icon: faTriangleExclamation, color: 'text-rose-700', bg: 'bg-rose-200', label: "Can't Lose" },
  hibernating: { icon: faSkull,   color: 'text-neutral-500', bg: 'bg-neutral-100',  label: 'Hibernating' },
};

const REC_LABEL: Record<CLVRecommendation, string> = {
  vip_treatment: 'VIP Treatment',
  retention: 'Retention',
  reactivate: 'Reactivate',
  upsell: 'Upsell',
  monitor: 'Monitor',
};

export function CustomerCLVScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [clvList, setCLVList] = useState<CustomerCLV[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_CLV_CONFIG);
  const [filterSegment, setFilterSegment] = useState<CustomerSegment | 'all'>('all');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCLVConfig(settingsRows[0] ?? {}));
      const list = await getCLVList(db, 200);
      setCLVList(list);
    } catch (err) {
      console.error('[clv-report] reload failed', err);
      toast.error('Failed to load CLV data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleCompute = useCallback(async () => {
    setComputing(true);
    setProgress({ current: 0, total: 4 });
    try {
      const result = await computeAllCLV(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        `Analyzed ${result.evaluated} customers — total CLV ${withCurrency(result.totalHistoricalCLV + result.totalPredictiveCLV)}, avg ${withCurrency(result.avgCLV)}`
      );
      await reload();
    } catch (err) {
      console.error('[clv-report] compute failed', err);
      toast.error('CLV computation failed — see console');
    } finally {
      setComputing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const stats = useMemo(() => {
    const totalCLV = clvList.reduce((s, c) => s + c.total_clv, 0);
    const avgCLV = clvList.length > 0 ? totalCLV / clvList.length : 0;
    const atRisk = clvList.filter(c => c.segment === 'at_risk' || c.segment === 'cant_lose').length;
    const segmentCounts: Record<string, number> = {};
    for (const c of clvList) {
      segmentCounts[c.segment] = (segmentCounts[c.segment] ?? 0) + 1;
    }
    return { totalCLV, avgCLV, atRisk, segmentCounts };
  }, [clvList]);

  const filteredList = useMemo(() => {
    if (filterSegment === 'all') return clvList;
    return clvList.filter(c => c.segment === filterSegment);
  }, [clvList, filterSegment]);

  return (
    <Layout>
      <DocumentTitle parts={["Customer CLV", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUsers} className="text-violet-600" />
              Customer Lifetime Value
            </h1>
            <p className="text-sm text-neutral-500">
              RFM segmentation + predictive CLV + churn risk + AI recommendations per customer
            </p>
          </div>
          <Button onClick={handleCompute} disabled={computing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={computing} />
            {computing ? `Computing… (${progress.current}/${progress.total})` : 'Compute CLV'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading CLV data…</p>
          </div>
        ) : clvList.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUsers} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No CLV data yet</p>
            <p className="text-sm mt-1">Click "Compute CLV" to analyze customer purchase history.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faUsers} label="Customers" value={clvList.length} color="text-blue-600" />
              <SummaryCard icon={faDollarSign} label="Total CLV" value={withCurrency(stats.totalCLV)} color="text-emerald-600" />
              <SummaryCard icon={faArrowTrendUp} label="Avg CLV" value={withCurrency(stats.avgCLV)} color="text-violet-600" />
              <SummaryCard icon={faTriangleExclamation} label="At risk" value={stats.atRisk} color="text-rose-600" />
            </div>

            {/* Segment distribution */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3">Customer segments</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {(Object.keys(SEGMENT_META) as CustomerSegment[]).map(seg => {
                  const meta = SEGMENT_META[seg];
                  const count = stats.segmentCounts[seg] ?? 0;
                  return (
                    <button
                      key={seg}
                      onClick={() => setFilterSegment(filterSegment === seg ? 'all' : seg)}
                      className={`p-3 rounded-lg border-2 transition-all text-center ${
                        filterSegment === seg ? 'ring-2 ring-offset-1' : ''
                      } ${meta.bg} ${filterSegment === seg ? 'border-neutral-900' : 'border-transparent'}`}
                    >
                      <FontAwesomeIcon icon={meta.icon} className={`text-2xl ${meta.color} mb-1`} />
                      <div className={`text-2xl font-bold ${meta.color}`}>{count}</div>
                      <div className="text-xs text-neutral-600">{meta.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 items-center flex-wrap">
              <button
                onClick={() => setFilterSegment('all')}
                className={`px-3 py-1 rounded text-xs ${filterSegment === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}
              >
                All ({clvList.length})
              </button>
              {(Object.keys(SEGMENT_META) as CustomerSegment[]).map(seg => {
                const count = stats.segmentCounts[seg] ?? 0;
                if (count === 0) return null;
                return (
                  <button key={seg} onClick={() => setFilterSegment(seg)}
                    className={`px-3 py-1 rounded text-xs ${filterSegment === seg ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>
                    {SEGMENT_META[seg].label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Top customers table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Customer</th>
                      <th className="text-center p-3">Segment</th>
                      <th className="text-center p-3">RFM</th>
                      <th className="text-right p-3">Orders</th>
                      <th className="text-right p-3">Total spend</th>
                      <th className="text-right p-3">Avg order</th>
                      <th className="text-right p-3">Hist. CLV</th>
                      <th className="text-right p-3">Pred. CLV</th>
                      <th className="text-right p-3">Total CLV</th>
                      <th className="text-right p-3">Churn risk</th>
                      <th className="text-center p-3">Loyalty</th>
                      <th className="text-left p-3">AI recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.length === 0 ? (
                      <tr><td colSpan={12} className="p-6 text-center text-neutral-400">No customers in this segment.</td></tr>
                    ) : (
                      filteredList.slice(0, 100).map((clv, idx) => {
                        const meta = SEGMENT_META[clv.segment];
                        return (
                          <tr key={idx} className="border-t hover:bg-neutral-50">
                            <td className="p-3">
                              <div className="font-medium">{clv.customer_name}</div>
                              {clv.email && <div className="text-xs text-neutral-500">{clv.email}</div>}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${meta.bg} ${meta.color}`}>
                                <FontAwesomeIcon icon={meta.icon} className="text-xs" />
                                {meta.label}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-neutral-100">
                                {clv.rfm_score}
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums">{clv.total_orders}</td>
                            <td className="p-3 text-right tabular-nums">{withCurrency(clv.total_spend)}</td>
                            <td className="p-3 text-right tabular-nums text-neutral-500">{withCurrency(clv.avg_order_value)}</td>
                            <td className="p-3 text-right tabular-nums">{withCurrency(clv.historical_clv)}</td>
                            <td className="p-3 text-right tabular-nums text-violet-600">{withCurrency(clv.predictive_clv)}</td>
                            <td className="p-3 text-right tabular-nums font-semibold text-emerald-600">{withCurrency(clv.total_clv)}</td>
                            <td className="p-3 text-right tabular-nums">
                              <span className={clv.churn_risk >= 0.6 ? 'text-rose-600 font-semibold' : clv.churn_risk >= 0.3 ? 'text-amber-600' : 'text-emerald-600'}>
                                {(clv.churn_risk * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {clv.is_loyalty_member ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 capitalize">
                                  {clv.loyalty_tier ?? 'member'}
                                </span>
                              ) : (
                                <span className="text-xs text-neutral-400">—</span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col gap-1">
                                {clv.ai_recommendation && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 inline-block w-fit">
                                    {REC_LABEL[clv.ai_recommendation] ?? clv.ai_recommendation}
                                  </span>
                                )}
                                {clv.ai_insight && (
                                  <span className="text-xs text-violet-600 italic line-clamp-2">{clv.ai_insight}</span>
                                )}
                              </div>
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
              <span>Min orders: <strong>{config.minOrders}</strong></span>
              <span>Churn threshold: <strong>{config.churnThresholdDays} days</strong></span>
              <span>Prediction: <strong>{config.predictionMonths} months</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Total historical CLV: <strong>{withCurrency(stats.totalCLV - clvList.reduce((s, c) => s + c.predictive_clv, 0))}</strong></span>
              <span>Total predictive CLV: <strong>{withCurrency(clvList.reduce((s, c) => s + c.predictive_clv, 0))}</strong></span>
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

export default CustomerCLVScreen;
