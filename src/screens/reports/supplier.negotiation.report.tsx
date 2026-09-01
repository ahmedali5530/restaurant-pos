/**
 * AI Supplier Negotiation Coach — negotiation opportunities dashboard.
 *
 * 74th POSR-exclusive differentiator — restaurants overpay 8-15% on supplies.
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
  faHandshakeSimple, faRotate, faLightbulb, faCheckCircle,
  faDollarSign, faScaleBalanced, faClock, faAward, faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runNegotiationEngine, getActiveNegotiations, getSummary, updateNegotiationStatus,
  readNegotiationConfig, DEFAULT_NEGOTIATION_CONFIG,
  type SupplierNegotiation,
} from "@/lib/supplier-negotiation.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  volume_discount:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faDollarSign,      label: 'VOLUME' },
  price_match:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faScaleBalanced,   label: 'PRICE MATCH' },
  payment_terms:    { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faClock,           label: 'PAYMENT TERMS' },
  loyalty_bonus:    { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faAward,           label: 'LOYALTY' },
  consolidation:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faLayerGroup,      label: 'CONSOLIDATION' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const confColor = (c: number): string => c >= 0.7 ? 'text-emerald-600' : c >= 0.5 ? 'text-amber-600' : 'text-rose-600';

export function SupplierNegotiationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [negotiations, setNegotiations] = useState<SupplierNegotiation[]>([]);
  const [summary, setSummary] = useState({ negotiationCount: 0, totalAnnualSavings: 0, highPriorityCount: 0, avgConfidence: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_NEGOTIATION_CONFIG);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readNegotiationConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveNegotiations(db), getSummary(db)]);
      setNegotiations(list); setSummary(sum);
    } catch (err) { console.error('[negotiation-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runNegotiationEngine(db, config);
      toast.success(result.negotiations.length > 0
        ? `Found ${result.negotiations.length} negotiation opportunities — est ${withCurrency(result.negotiations.reduce((s, n) => s + n.est_savings_annual, 0))}/yr savings`
        : `No negotiation opportunities — need supplier purchase history`);
      await reload();
    } catch (err) { console.error('[negotiation-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (negId: string, status: 'negotiating' | 'secured' | 'declined') => {
    try { await updateNegotiationStatus(db, negId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedNegs = [...negotiations].sort((a, b) => b.est_savings_annual - a.est_savings_annual);

  return (
    <Layout>
      <DocumentTitle parts={["Supplier Negotiation", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faHandshakeSimple} className="text-violet-600" />
              AI Negotiation Coach
            </h1>
            <p className="text-sm text-neutral-500">
              Supplier negotiation strategy — saves 8-15% on supplies (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Find opportunities'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : negotiations.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faHandshakeSimple} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No negotiation opportunities!</p>
            <p className="text-sm mt-1">Click "Find opportunities" to analyze supplier purchasing data.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faHandshakeSimple} />Opportunities</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.negotiationCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Est. annual savings</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalAnnualSavings)}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">High priority</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.highPriorityCount}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Avg confidence</div>
                <div className={`text-2xl font-bold tabular-nums ${confColor(summary.avgConfidence)}`}>{(summary.avgConfidence * 100).toFixed(0)}%</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedNegs.map((n, idx) => {
                const style = RULE_STYLE[n.rule_id] ?? RULE_STYLE.volume_discount;
                const isExpanded = expandedId === n.id;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[n.severity] ?? SEVERITY_DOT.low}`}></span>
                          <span className="font-medium">{n.supplier_name}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Spend: <strong className="text-amber-600">{withCurrency(n.total_spend_90d)}</strong></span>
                          <span className="text-neutral-500">Savings: <strong className="text-emerald-600">{withCurrency(n.est_savings_annual)}/yr</strong></span>
                          <span className="text-neutral-500">Conf: <strong className={confColor(n.confidence)}>{(n.confidence * 100).toFixed(0)}%</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{n.description}</p>
                    </div>

                    <div className="p-3">
                      {/* Financial grid */}
                      <div className="grid grid-cols-4 gap-3 mb-3 text-center">
                        <div>
                          <div className="text-xs text-neutral-500">90d spend</div>
                          <div className="font-bold tabular-nums text-amber-600">{withCurrency(n.total_spend_90d)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Current avg</div>
                          <div className="font-bold tabular-nums">{withCurrency(n.avg_price)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Target price</div>
                          <div className="font-bold tabular-nums text-emerald-600">{withCurrency(n.target_price ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Monthly savings</div>
                          <div className="font-bold tabular-nums text-emerald-600">{withCurrency(n.est_savings_monthly)}</div>
                        </div>
                      </div>

                      {/* Leverage */}
                      {n.negotiation_leverage && (
                        <div className="mb-3 p-2 rounded bg-amber-50 border border-amber-100">
                          <p className="text-xs text-amber-700"><FontAwesomeIcon icon={faLightbulb} className="mr-1" /><strong>Leverage:</strong> {n.negotiation_leverage}</p>
                        </div>
                      )}

                      {/* Negotiation script (expandable) */}
                      {n.negotiation_script && (
                        <div className="mb-3">
                          <button onClick={() => setExpandedId(isExpanded ? null : n.id ?? null)} className="text-xs text-violet-600 hover:underline mb-1 flex items-center gap-1">
                            <FontAwesomeIcon icon={faLightbulb} />{isExpanded ? 'Hide' : 'Show'} negotiation script
                          </button>
                          {isExpanded && (
                            <div className="text-sm text-neutral-700 bg-violet-50/50 p-3 rounded border border-violet-100 italic">
                              "{n.negotiation_script}"
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI insight */}
                      {n.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{n.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => n.id && handleStatus(n.id, 'negotiating')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          <FontAwesomeIcon icon={faHandshakeSimple} className="mr-1" />Negotiating
                        </button>
                        <button onClick={() => n.id && handleStatus(n.id, 'secured')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Secured
                        </button>
                        <button onClick={() => n.id && handleStatus(n.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
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
              <span>Min spend: <strong>{withCurrency(config.minSpend)}</strong></span>
              <span>Target discount: <strong>{(config.targetDiscount * 100).toFixed(0)}%</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default SupplierNegotiationScreen;
