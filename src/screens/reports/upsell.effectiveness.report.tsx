/**
 * Upsell Effectiveness Dashboard — measure upsell conversion + revenue impact.
 *
 * Research finding: Square Upsell Analytics + Toast Upsell Insights bundle
 * upsell performance measurement in higher tiers (~$35/mo). POSR offers
 * it free.
 *
 * Layout:
 *   1. Summary cards (conversion rate, revenue lift, total shown, attachment rate)
 *   2. Grade banner (A-F with industry benchmark)
 *   3. Funnel breakdown (shown → accepted/declined/timeout)
 *   4. Top items table (sortable: conversion, revenue, shows)
 *   5. AI recommendations panel (feature_more / rework / remove)
 *   6. Generate button
 *
 * Placement: new route /reports/upsell-effectiveness
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
  faArrowTrendUp, faDollarSign, faEye, faCheckCircle, faRobot, faRotate,
  faLightbulb, faStar, faXmark, faClock,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  computeEffectiveness,
  getEffectiveness,
  readUpsellConfig,
  DEFAULT_UPSELL_CONFIG,
  type UpsellEffectiveness,
  type UpsellGrade,
  type UpsellAction,
} from "@/lib/upsell-analytics.service.ts";

const GRADE_STYLE: Record<UpsellGrade, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'A — Excellent (≥30% conv)' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'B — Good (20-29% conv)' },
  C: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'C — Average (10-19% conv)' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'D — Below avg (5-9% conv)' },
  F: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'F — Poor (<5% conv)' },
};

const ACTION_STYLE: Record<UpsellAction, { bg: string; text: string; label: string; icon: any }> = {
  feature_more: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Feature more', icon: faStar },
  keep: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Keep', icon: faCheckCircle },
  rework: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Rework', icon: faRotate },
  remove: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Remove', icon: faXmark },
};

export function UpsellEffectivenessScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [items, setItems] = useState<UpsellEffectiveness[]>([]);
  const [overall, setOverall] = useState<UpsellEffectiveness | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_UPSELL_CONFIG);
  const [sortBy, setSortBy] = useState<'conversion' | 'revenue' | 'shows' | 'name'>('revenue');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readUpsellConfig(settingsRows[0] ?? {}));
      const { items: itemList, overall: overallData } = await getEffectiveness(db);
      setItems(itemList);
      setOverall(overallData);
    } catch (err) {
      console.error('[upsell-report] reload failed', err);
      toast.error('Failed to load upsell data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleCompute = useCallback(async () => {
    setComputing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await computeEffectiveness(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setItems(result.items);
      setOverall(result.overall);
      toast.success(
        `Computed effectiveness for ${result.items.length} items — overall conversion ${result.overall?.conversion_rate.toFixed(1)}%, revenue lift ${withCurrency(result.overall?.revenue_lift ?? 0)}`
      );
    } catch (err) {
      console.error('[upsell-report] compute failed', err);
      toast.error('Computation failed — see console');
    } finally {
      setComputing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const sortedItems = useMemo(() => {
    const sorted = [...items];
    switch (sortBy) {
      case 'conversion': sorted.sort((a, b) => b.conversion_rate - a.conversion_rate); break;
      case 'revenue': sorted.sort((a, b) => b.revenue_lift - a.revenue_lift); break;
      case 'shows': sorted.sort((a, b) => b.times_shown - a.times_shown); break;
      case 'name': sorted.sort((a, b) => (a.item_name ?? '').localeCompare(b.item_name ?? '')); break;
    }
    return sorted;
  }, [items, sortBy]);

  return (
    <Layout>
      <DocumentTitle parts={["Upsell Effectiveness", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faArrowTrendUp} className="text-emerald-600" />
              Upsell Effectiveness
            </h1>
            <p className="text-sm text-neutral-500">
              Conversion rate + revenue lift per upsell item + AI recommendations for optimization
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
            <p>Loading upsell data…</p>
          </div>
        ) : !overall ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faArrowTrendUp} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No upsell analytics yet</p>
            <p className="text-sm mt-1">Click "Compute effectiveness" to analyze upsell events.</p>
            <p className="text-xs mt-2">Note: requires upsell events to have been recorded (UpsellPrompt component must be active).</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faArrowTrendUp} label="Conversion rate" value={`${overall.conversion_rate.toFixed(1)}%`} color={overall.conversion_rate >= 20 ? 'text-emerald-600' : overall.conversion_rate >= 10 ? 'text-amber-600' : 'text-rose-600'} />
              <SummaryCard icon={faDollarSign} label="Revenue lift" value={withCurrency(overall.revenue_lift)} color="text-emerald-600" />
              <SummaryCard icon={faEye} label="Times shown" value={overall.times_shown} color="text-blue-600" />
              <SummaryCard icon={faCheckCircle} label="Accepted" value={`${overall.times_accepted} (${overall.times_shown > 0 ? ((overall.times_accepted / overall.times_shown) * 100).toFixed(0) : 0}%)`} color="text-violet-600" />
            </div>

            {/* Grade banner */}
            {(() => {
              const grade = GRADE_STYLE[overall.grade];
              return (
                <div className={`rounded-lg border-2 p-4 ${grade.bg.replace('text-', 'border-').split(' ')[0]} ${grade.bg}`}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`text-4xl font-bold ${grade.text}`}>{overall.grade}</div>
                      <div>
                        <div className={`text-lg font-bold ${grade.text}`}>{grade.label}</div>
                        <div className="text-xs text-neutral-600">
                          {overall.conversion_rate.toFixed(1)}% conversion over {overall.times_shown} shows · {overall.times_accepted} accepted · {overall.times_declined} declined · {overall.times_timeout} timeout
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">Revenue lift</div>
                      <div className="text-2xl font-bold text-emerald-600 tabular-nums">{withCurrency(overall.revenue_lift)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Funnel breakdown */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3">Funnel breakdown</h3>
              <div className="flex h-10 rounded-lg overflow-hidden">
                {overall.times_accepted > 0 && (
                  <div className="bg-emerald-500 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(overall.times_accepted / overall.times_shown) * 100}%` }}>
                    ✓ {overall.times_accepted}
                  </div>
                )}
                {overall.times_declined > 0 && (
                  <div className="bg-rose-400 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(overall.times_declined / overall.times_shown) * 100}%` }}>
                    ✕ {overall.times_declined}
                  </div>
                )}
                {overall.times_timeout > 0 && (
                  <div className="bg-amber-400 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(overall.times_timeout / overall.times_shown) * 100}%` }}>
                    ⏱ {overall.times_timeout}
                  </div>
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                <span><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500 mr-1 align-middle" />Accepted</span>
                <span><span className="inline-block w-3 h-3 rounded-sm bg-rose-400 mr-1 align-middle" />Declined</span>
                <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-400 mr-1 align-middle" />Timeout</span>
              </div>
            </div>

            {/* Sort controls */}
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-neutral-500">Sort by:</span>
              {(['revenue', 'conversion', 'shows', 'name'] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={`px-3 py-1 rounded text-xs capitalize transition-colors ${sortBy === s ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>
                  {s === 'shows' ? 'Times shown' : s}
                </button>
              ))}
            </div>

            {/* Top items table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">Item</th>
                      <th className="text-center p-3">Grade</th>
                      <th className="text-right p-3">Shown</th>
                      <th className="text-right p-3">Accepted</th>
                      <th className="text-right p-3">Conversion</th>
                      <th className="text-right p-3">Revenue lift</th>
                      <th className="text-right p-3">Avg response</th>
                      <th className="text-center p-3">AI action</th>
                      <th className="text-left p-3">AI insight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.length === 0 ? (
                      <tr><td colSpan={9} className="p-6 text-center text-neutral-400">No items meet the minimum shows threshold ({config.minShowsForEval}).</td></tr>
                    ) : (
                      sortedItems.map((item, idx) => {
                        const actionStyle = item.ai_action ? ACTION_STYLE[item.ai_action] : null;
                        const grade = GRADE_STYLE[item.grade];
                        return (
                          <tr key={idx} className="border-t hover:bg-neutral-50">
                            <td className="p-3 font-medium">{item.item_name ?? 'Unknown'}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-block w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center mx-auto ${grade.bg} ${grade.text}`}>
                                {item.grade}
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums">{item.times_shown}</td>
                            <td className="p-3 text-right tabular-nums text-emerald-600 font-medium">{item.times_accepted}</td>
                            <td className="p-3 text-right tabular-nums">
                              <span className={item.conversion_rate >= 20 ? 'text-emerald-600' : item.conversion_rate >= 10 ? 'text-amber-600' : 'text-rose-600'}>
                                {item.conversion_rate.toFixed(1)}%
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums font-semibold text-emerald-600">{withCurrency(item.revenue_lift)}</td>
                            <td className="p-3 text-right tabular-nums text-neutral-500">
                              {item.avg_response_ms > 0 ? `${(item.avg_response_ms / 1000).toFixed(1)}s` : '—'}
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
                              {item.ai_insight ? `"${item.ai_insight}"` : <span className="text-neutral-400">—</span>}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI recommendations summary */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <FontAwesomeIcon icon={faLightbulb} className="text-amber-500" />
                AI recommendations summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['feature_more', 'keep', 'rework', 'remove'] as UpsellAction[]).map(action => {
                  const count = items.filter(i => i.ai_action === action).length;
                  const style = ACTION_STYLE[action];
                  return (
                    <div key={action} className={`p-3 rounded-lg ${style.bg}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <FontAwesomeIcon icon={style.icon} className={style.text} />
                        <span className={`text-sm font-medium ${style.text}`}>{style.label}</span>
                      </div>
                      <div className={`text-2xl font-bold ${style.text}`}>{count}</div>
                      <div className="text-xs text-neutral-500">items</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min shows for eval: <strong>{config.minShowsForEval}</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Items evaluated: <strong>{items.length}</strong></span>
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

export default UpsellEffectivenessScreen;
