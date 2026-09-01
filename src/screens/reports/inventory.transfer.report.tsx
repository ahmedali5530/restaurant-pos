/**
 * AI Multi-Location Inventory Transfer Optimizer — branch-to-branch dashboard.
 *
 * 63rd POSR-exclusive differentiator — transfers cost 60-80% less than
 * emergency procurement.
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
  faRightLeft, faRotate, faLightbulb, faCheckCircle,
  faArrowRight, faTruckFast, faDollarSign, faTriangleExclamation, faLeaf,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runTransferEngine, getActiveTransfers, getSummary, updateTransferStatus,
  readTransferConfig, DEFAULT_TRANSFER_CONFIG,
  type InventoryTransfer,
} from "@/lib/inventory-transfer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  surplus_to_shortage:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faRightLeft,             label: 'SURPLUS→SHORTAGE' },
  expiring_relocation:     { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faLeaf,                  label: 'EXPIRING RELOCATION' },
  cost_avoidance:          { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faDollarSign,            label: 'COST AVOIDANCE' },
  capacity_rebalance:      { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faRightLeft,             label: 'REBALANCE' },
  emergency_fulfillment:   { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTriangleExclamation,   label: 'EMERGENCY' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

export function InventoryTransferScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [transfers, setTransfers] = useState<InventoryTransfer[]>([]);
  const [summary, setSummary] = useState({ transferCount: 0, criticalCount: 0, totalSavings: 0, wastePrevented: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TRANSFER_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTransferConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveTransfers(db), getSummary(db)]);
      setTransfers(list); setSummary(sum);
    } catch (err) { console.error('[transfer-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTransferEngine(db, config);
      toast.success(result.transfers.length > 0
        ? `Generated ${result.transfers.length} transfer suggestions — ${result.transfers.filter(t => t.severity === 'critical').length} critical, ${withCurrency(result.transfers.reduce((s, t) => s + t.net_savings, 0))} total savings`
        : `No transfer opportunities — all branches balanced`);
      await reload();
    } catch (err) { console.error('[transfer-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (transferId: string, status: 'transferred' | 'scheduled' | 'declined') => {
    try { await updateTransferStatus(db, transferId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedTransfers = [...transfers].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sev[a.severity] !== sev[b.severity]) return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
    return b.net_savings - a.net_savings;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Inventory Transfer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faRightLeft} className="text-violet-600" />
              AI Inventory Transfer
            </h1>
            <p className="text-sm text-neutral-500">
              Optimizes branch-to-branch transfers — saves 60-80% vs emergency procurement (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Find transfers'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : transfers.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRightLeft} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No transfer opportunities!</p>
            <p className="text-sm mt-1">All branches are balanced. Click "Find transfers" to scan for imbalances.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faRightLeft} />Transfers</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.transferCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Total savings</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalSavings)}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-300 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faLeaf} />Waste prevented</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.wastePrevented)}</div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faRightLeft} className="text-violet-600" />
                  Transfer Suggestions (sorted by savings)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Item</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-left">From → To</th>
                      <th className="p-3 text-right">Transfer qty</th>
                      <th className="p-3 text-right">Savings</th>
                      <th className="p-3 text-right">Transport cost</th>
                      <th className="p-3 text-right">Net savings</th>
                      <th className="p-3 text-right">Expiry</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTransfers.map((t, idx) => {
                      const style = RULE_STYLE[t.rule_id] ?? RULE_STYLE.surplus_to_shortage;
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[t.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">{t.item_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{t.description}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold text-emerald-600">{t.from_branch}</span>
                              <FontAwesomeIcon icon={faArrowRight} className="text-neutral-400 text-xs" />
                              <span className="text-xs font-semibold text-rose-600">{t.to_branch}</span>
                            </div>
                            <div className="text-xs text-neutral-500 mt-0.5">
                              Stock: {t.from_branch_stock} → {t.to_branch_stock} {t.unit}
                            </div>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold">{t.suggested_qty} {t.unit}</td>
                          <td className="p-3 text-right tabular-nums text-emerald-600">{withCurrency(t.est_savings)}</td>
                          <td className="p-3 text-right tabular-nums text-amber-600">{withCurrency(t.transfer_cost)}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">{withCurrency(t.net_savings)}</td>
                          <td className="p-3 text-right">
                            {t.days_until_expiry !== undefined ? (
                              <span className={`text-xs font-bold ${t.days_until_expiry <= 3 ? 'text-rose-600' : 'text-amber-600'}`}>
                                {t.days_until_expiry}d
                              </span>
                            ) : <span className="text-neutral-400">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              <button onClick={() => t.id && handleStatus(t.id, 'transferred')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap font-medium">
                                <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Transfer
                              </button>
                              <button onClick={() => t.id && handleStatus(t.id, 'scheduled')} className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">
                                Schedule
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
            {transfers.filter(t => t.ai_insight).slice(0, 5).map((t, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{t.item_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[t.rule_id].bg} ${RULE_STYLE[t.rule_id].text}`}>{t.rule_id.replace(/_/g, ' ')}</span>
                  {t.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{t.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{t.ai_insight}</p>
              </div>
            ))}

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Surplus threshold: <strong>{config.surplusThreshold}× par</strong></span>
              <span>Shortage threshold: <strong>{config.shortageThreshold}× par</strong></span>
              <span>Max distance: <strong>{config.maxDistanceKm}km</strong></span>
              <span>Transport cost: <strong>${config.costPerKm}/km</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default InventoryTransferScreen;
