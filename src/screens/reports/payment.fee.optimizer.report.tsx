/**
 * AI Payment Fee Optimizer — processor routing + downgrade detection dashboard.
 *
 * 62nd POSR-exclusive differentiator — restaurants pay $500-2,000/mo per
 * location in credit card processing fees (2-4% per transaction).
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
  faCreditCard, faRotate, faLightbulb, faCheckCircle,
  faRoute, faTriangleExclamation, faCashRegister, faBuildingColumns,
  faPercent, faClock, faCopy, faCoins,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPayFeeEngine, getActiveRecommendations, getSummary, updateRecStatus,
  readPayFeeConfig, DEFAULT_PAYFEE_CONFIG,
  type PayFeeRecommendation,
} from "@/lib/payment-fee-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  processor_routing:           { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faRoute,              label: 'ROUTING' },
  downgrade_detection:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTriangleExclamation, label: 'DOWNGRADE' },
  cash_discount_opportunity:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCashRegister,       label: 'CASH DISCOUNT' },
  ach_recommendation:          { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faBuildingColumns,    label: 'ACH' },
  surcharge_optimization:      { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faPercent,            label: 'SURCHARGE' },
  batch_timing:                { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: faClock,              label: 'BATCH TIME' },
  duplicate_detection:         { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faCopy,               label: 'DUPLICATE' },
  small_ticket_cash:           { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCoins,              label: 'SMALL TICKET' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const CARD_TYPE_COLOR: Record<string, string> = {
  visa_credit: 'text-blue-700',
  visa_debit: 'text-blue-600',
  visa_rewards: 'text-violet-700',
  mc_credit: 'text-orange-700',
  mc_debit: 'text-orange-600',
  mc_world: 'text-violet-700',
  amex: 'text-sky-700',
  discover: 'text-orange-700',
  corporate: 'text-neutral-700',
  international: 'text-rose-700',
  mixed: 'text-neutral-600',
  unknown: 'text-neutral-400',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function PaymentFeeOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [recs, setRecs] = useState<PayFeeRecommendation[]>([]);
  const [summary, setSummary] = useState({ totalRecs: 0, criticalCount: 0, totalSavings: 0, duplicateCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PAYFEE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPayFeeConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRecommendations(db), getSummary(db)]);
      setRecs(list); setSummary(sum);
    } catch (err) { console.error('[payfee-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPayFeeEngine(db, config);
      toast.success(`Generated ${result.generated} payment fee recommendations`);
      await reload();
    } catch (err) {
      console.error('[payfee-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (recId: string, status: 'adopted' | 'piloting' | 'rejected') => {
    try {
      await updateRecStatus(db, recId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[payfee-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedRecs = useMemo(() =>
    [...recs].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_savings_monthly ?? 0) - (a.est_savings_monthly ?? 0);
    }),
  [recs]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Payment Fee Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCreditCard} className="text-violet-600" />
              AI Payment Fee Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Route to cheapest processor, detect downgrades, cut 2-4% processing fees
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Run AI analysis'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faCopy}
            label="Duplicate charges"
            value={String(summary.duplicateCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical / high-fee"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faCreditCard}
            label="Open recommendations"
            value={String(summary.totalRecs)}
            color="text-violet-600"
          />
          <SummaryCard
            icon={faLightbulb}
            label="Est. monthly savings"
            value={fmt$(summary.totalSavings)}
            color="text-emerald-600"
          />
        </div>

        {/* Recommendations list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCreditCard} spin className="text-4xl mb-3" />
            <p>Loading payment fee recommendations…</p>
          </div>
        ) : sortedRecs.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No open payment fee recommendations</p>
            <p className="text-sm mt-1">Run AI analysis to detect fee optimization opportunities.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedRecs.map((rec, idx) => {
              const style = RULE_STYLE[rec.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faCreditCard, label: rec.rule_id.toUpperCase() };
              const feeDelta = rec.current_fee_amount - rec.suggested_fee_amount;
              const rateDelta = rec.current_fee_rate - rec.suggested_fee_rate;
              return (
                <div key={rec.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-neutral-800">
                            {rec.customer_name ?? 'Unknown'} — {fmt$(rec.transaction_amount)}
                          </span>
                          {rec.card_type && (
                            <span className={`text-xs font-medium ${CARD_TYPE_COLOR[rec.card_type] ?? 'text-neutral-500'}`}>
                              {rec.card_type.replace('_', ' ')}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${rec.severity === 'critical' ? 'text-rose-600' : rec.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[rec.severity]}`} />
                            {rec.severity}
                          </span>
                          {rec.order_id && rec.order_id !== 'AGGREGATE' && (
                            <span className="text-xs text-neutral-400">{rec.order_id}</span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{rec.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span>
                            <FontAwesomeIcon icon={faCreditCard} className="mr-1" />
                            {rec.current_processor} → <span className="font-medium text-neutral-700">{rec.suggested_processor}</span>
                          </span>
                          <span>
                            Rate: <span className="font-medium text-neutral-700">{rec.current_fee_rate}%</span> → <span className={`font-medium ${rateDelta > 0 ? 'text-emerald-600' : 'text-neutral-700'}`}>{rec.suggested_fee_rate}%</span> ({rateDelta >= 0 ? '-' : '+'}{Math.abs(rateDelta).toFixed(1)}%)
                          </span>
                          <span>
                            Fee: <span className="font-medium text-neutral-700">{fmt$(rec.current_fee_amount)}</span> → <span className={`font-medium ${feeDelta > 0 ? 'text-emerald-600' : 'text-neutral-700'}`}>{fmt$(rec.suggested_fee_amount)}</span> ({feeDelta >= 0 ? '-' : '+'}{fmt$(Math.abs(feeDelta))})
                          </span>
                          {rec.transaction_count_30d != null && <span>Freq: {rec.transaction_count_30d}/wk</span>}
                        </div>
                        {rec.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{rec.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-emerald-600">{fmt$(rec.est_savings_monthly)}</div>
                      <div className="text-xs text-neutral-400">est. saved /mo</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => rec.id && handleStatus(rec.id, 'adopted')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Adopt
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => rec.id && handleStatus(rec.id, 'piloting')}>
                      <FontAwesomeIcon icon={faRotate} /> Pilot 2w
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => rec.id && handleStatus(rec.id, 'rejected')}>
                      Skip
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Config footer */}
        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Small-ticket threshold: {fmt$(config.smallTicketThreshold)}</span>
          <span>ACH threshold: {fmt$(config.achThreshold)}</span>
          <span>Surcharge: {config.surchargePct}%</span>
          <span>Batch cutoff: {config.batchCutoffHour}:00</span>
        </div>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center gap-3">
      <FontAwesomeIcon icon={icon} className={`text-2xl ${color}`} />
      <div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export default PaymentFeeOptimizerScreen;
