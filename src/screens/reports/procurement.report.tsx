/**
 * AI Procurement Optimization Dashboard — predict price movements + when to buy.
 *
 * 43rd POSR-exclusive differentiator — restaurants lose 8-12% of food cost to
 * poor procurement timing (NRA supply research). Toast/Square/Lightspeed track
 * stock but DON'T predict prices.
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
  faTruckFast, faRotate, faLightbulb, faCheckCircle,
  faArrowUp, faArrowDown, faRightLeft, faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runProcurementEngine, getActiveRecommendations, getSummary, updateRecommendationStatus,
  readProcurementConfig, DEFAULT_PROCUREMENT_CONFIG,
  type ProcurementRecommendationRow,
} from "@/lib/procurement.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  buy_now:        { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faArrowUp,     label: 'BUY NOW' },
  wait_for_drop:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowDown,   label: 'WAIT' },
  switch_vendor:  { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faRightLeft,   label: 'SWITCH VENDOR' },
  bulk_discount:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBoxOpen,     label: 'BULK' },
  normal:         { bg: 'bg-neutral-50',  text: 'text-neutral-600', icon: faTruckFast,   label: 'NORMAL' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

export function ProcurementScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [recommendations, setRecommendations] = useState<ProcurementRecommendationRow[]>([]);
  const [summary, setSummary] = useState({ buyNowCount: 0, waitCount: 0, switchCount: 0, bulkCount: 0, totalSavings: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PROCUREMENT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readProcurementConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRecommendations(db), getSummary(db)]);
      setRecommendations(list); setSummary(sum);
    } catch (err) { console.error('[procurement-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runProcurementEngine(db, config);
      toast.success(result.recommendations.length > 0
        ? `Generated ${result.recommendations.length} procurement recs — ${result.recommendations.filter(r => r.rule_id === 'buy_now').length} buy-now, ${result.recommendations.filter(r => r.rule_id === 'switch_vendor').length} switch-vendor`
        : `No recommendations — insufficient purchase history (need ≥3 orders per item)`);
      await reload();
    } catch (err) { console.error('[procurement-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (recId: string, status: 'ordered' | 'declined') => {
    try { await updateRecommendationStatus(db, recId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Procurement", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTruckFast} className="text-rose-600" />
              AI Procurement Optimization
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts ingredient price movements — buy ahead, switch vendors, take bulk discounts (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing prices…' : 'Run analysis'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : recommendations.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTruckFast} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No procurement recommendations yet!</p>
            <p className="text-sm mt-1">Click "Run analysis" to forecast ingredient prices and identify savings.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowUp} />Buy now</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.buyNowCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faArrowDown} />Wait</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.waitCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faRightLeft} />Switch vendor</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.switchCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faBoxOpen} />Bulk</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.bulkCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-300 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Est. savings</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalSavings)}</div>
              </div>
            </div>

            {/* Recommendations table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faTruckFast} className="text-rose-600" />
                  Recommendations (sorted by estimated savings)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Item</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Current</th>
                      <th className="p-3 text-right">30d avg</th>
                      <th className="p-3 text-right">14d forecast</th>
                      <th className="p-3 text-right">Trend</th>
                      <th className="p-3 text-right">Conf.</th>
                      <th className="p-3 text-right">Qty</th>
                      <th className="p-3 text-right">Save</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendations.map((r, idx) => {
                      const style = RULE_STYLE[r.rule_id] ?? RULE_STYLE.normal;
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[r.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">{r.item_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{r.description}</p>
                            {r.alt_vendor && (
                              <p className="text-xs text-violet-600 mt-0.5">
                                → {r.alt_vendor} @ {withCurrency(r.alt_vendor_price ?? 0)}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{withCurrency(r.current_price)}</td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{withCurrency(r.avg_price_30d)}</td>
                          <td className="p-3 text-right tabular-nums font-semibold">{withCurrency(r.predicted_price_14d)}</td>
                          <td className={`p-3 text-right tabular-nums font-bold ${r.price_trend_pct > 0 ? 'text-rose-600' : r.price_trend_pct < 0 ? 'text-emerald-600' : 'text-neutral-500'}`}>
                            {r.price_trend_pct > 0 ? '+' : ''}{r.price_trend_pct}%
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="tabular-nums">{r.confidence_score}</span>
                              <div className="w-8 h-1 bg-neutral-100 rounded">
                                <div className={`h-1 rounded ${r.confidence_score > 75 ? 'bg-emerald-500' : r.confidence_score > 50 ? 'bg-amber-500' : 'bg-neutral-300'}`} style={{ width: `${r.confidence_score}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-right tabular-nums">{r.suggested_qty ?? '—'}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">{withCurrency(r.est_savings)}</td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => r.id && handleStatus(r.id, 'ordered')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                                <FontAwesomeIcon icon={faCheckCircle} /> Order
                              </button>
                              <button onClick={() => r.id && handleStatus(r.id, 'declined')} className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
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

            {/* AI insights */}
            {recommendations.filter(r => r.ai_insight).slice(0, 5).map((r, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{r.item_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[r.rule_id].bg} ${RULE_STYLE[r.rule_id].text}`}>{r.rule_id.replace('_', ' ')}</span>
                  {r.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{r.ai_recommendation.replace('_', ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{r.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Buy-now threshold: <strong>+{(config.risingThreshold * 100).toFixed(0)}%</strong></span>
              <span>Wait threshold: <strong>{(config.fallingThreshold * 100).toFixed(0)}%</strong></span>
              <span>Switch-vendor threshold: <strong>-{(config.vendorSwitchThreshold * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default ProcurementScreen;
