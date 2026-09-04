/**
 * AI Customer LTV Multiplier Predictor — identifies customers whose value
 * could 2-5x with targeted retention/upsell investment.
 *
 * 112th POSR-exclusive differentiator — restaurants leave $500-2,000/mo per
 * location by treating all customers equally instead of investing in
 * multiplier candidates. No POS identifies latent high-value potential.
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
  faArrowTrendUp, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faUsers, faShareNodes, faLayerGroup,
  faRepeat, faCrown, faCoins, faFilterCircleXmark, faRocket,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runLTVMultEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readLTVMultConfig, DEFAULT_LTVMULT_CONFIG,
  type LTVMultAlert,
} from "@/lib/customer-ltv-multiplier.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  multiplier_candidate:   { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faRocket,            label: 'MULTIPLIER' },
  referral_multiplier:    { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faShareNodes,        label: 'REFERRAL' },
  category_expansion:     { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faLayerGroup,        label: 'CATEGORY EXP' },
  frequency_multiplier:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faRepeat,            label: 'FREQUENCY' },
  vip_in_training:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCrown,             label: 'VIP IN TRAINING' },
  optimal_investment:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCoins,             label: 'OPTIMAL ROI' },
  false_multiplier:       { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: faFilterCircleXmark, label: 'FALSE MULT' },
  multiplier_realized:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCheckCircle,       label: 'REALIZED' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const MULT_TYPE_COLOR: Record<string, string> = {
  referral: 'text-violet-600',
  category_expansion: 'text-sky-600',
  frequency: 'text-amber-600',
  vip_escalation: 'text-amber-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function CustomerLTVMultiplierScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<LTVMultAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgMultiplier: 0, totalInvestment: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_LTVMULT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readLTVMultConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[ltvmult-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runLTVMultEngine(db, config);
      toast.success(`Identified ${result.generated} multiplier candidates — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[ltvmult-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[ltvmult-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_opportunity ?? 0) - (a.est_monthly_opportunity ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Customer LTV Multiplier", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faArrowTrendUp} className="text-emerald-600" />
              AI Customer LTV Multiplier Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Identifies customers whose value could 2-5x with targeted retention investment
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Predicting…' : 'Find multipliers'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faRocket} label="Avg multiplier" value={`${summary.avgMultiplier.toFixed(1)}x`} color="text-emerald-600" />
          <SummaryCard icon={faCoins} label="Investment needed" value={fmt$(summary.totalInvestment)} color="text-amber-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faArrowTrendUp} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-emerald-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faArrowTrendUp} spin className="text-4xl mb-3" />
            <p>Identifying multiplier candidates…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No multiplier candidates detected</p>
            <p className="text-sm mt-1">All customers at stable value — no latent multipliers.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faArrowTrendUp, label: alert.rule_id.toUpperCase() };
              return (
                <div key={alert.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-neutral-800">{alert.customer_name}</span>
                          {alert.multiplier_type && (
                            <span className={`text-xs font-medium uppercase ${MULT_TYPE_COLOR[alert.multiplier_type] ?? 'text-neutral-500'}`}>
                              {alert.multiplier_type.replace('_', '-')}
                            </span>
                          )}
                          {alert.multiplier != null && (
                            <span className="text-sm font-bold text-emerald-600">
                              {alert.multiplier}x
                            </span>
                          )}
                          {alert.current_ltv != null && alert.predicted_ltv != null && (
                            <span className="text-xs text-neutral-500">
                              <span className="text-neutral-400">{fmt$(alert.current_ltv)}</span>
                              <span className="mx-1">→</span>
                              <span className="font-medium text-emerald-600">{fmt$(alert.predicted_ltv)}</span>
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.retention_investment != null && alert.retention_investment > 0 && (
                            <span className="text-amber-600 font-medium">Invest: {fmt$(alert.retention_investment)}</span>
                          )}
                          {alert.expected_return != null && alert.expected_return > 0 && (
                            <span className="text-emerald-600 font-medium">Return: {fmt$(alert.expected_return)}</span>
                          )}
                          {alert.roi_multiple != null && alert.roi_multiple > 0 && (
                            <span className="text-emerald-600 font-bold">ROI: {alert.roi_multiple}x</span>
                          )}
                          {alert.months_to_realize != null && <span>{alert.months_to_realize}mo to realize</span>}
                          {alert.signals && <span className="text-neutral-400">{alert.signals}</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">opportunity/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Invested
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Engaging
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => alert.id && handleStatus(alert.id, 'rejected')}>
                      Skip
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Min multiplier: {config.minMultiplier}x</span>
          <span>Min ROI: {config.minRoi}x</span>
          <span>Max investment: ${config.maxInvestment}/customer</span>
          <span>Realization window: {config.realizationWindow} months</span>
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

export default CustomerLTVMultiplierScreen;
