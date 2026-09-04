/**
 * AI Customer Order Pattern Anomaly Detector — detects when a customer's
 * ordering pattern deviates from their historical baseline.
 *
 * 122nd POSR-exclusive differentiator — restaurants miss $300-1,000/mo per
 * location from undetected customer order pattern anomalies.
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
  faMagnifyingGlassChart, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faUtensils, faLayerGroup, faClock,
  faTags, faChampagneGlasses, faSeedling, faArrowTrendUp, faBox,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runOrderPatternEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readOrderPatternConfig, DEFAULT_ORDPATTERN_CONFIG,
  type OrderPatternAlert,
} from "@/lib/order-pattern-anomaly.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  item_deviation:       { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faUtensils,           label: 'ITEM DEVIATION' },
  order_size_anomaly:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBox,                label: 'SIZE ANOMALY' },
  category_migration:   { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faLayerGroup,         label: 'CATEGORY MIGRATION' },
  timing_shift:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,              label: 'TIMING SHIFT' },
  price_tier_shift:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTags,               label: 'PRICE TIER SHIFT' },
  occasion_signal:      { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faChampagneGlasses,   label: 'OCCASION' },
  dietary_change:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faSeedling,           label: 'DIETARY CHANGE' },
  spending_spike:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,       label: 'SPENDING SPIKE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function OrderPatternAnomalyScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<OrderPatternAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, anomalyTypes: 0, customersAffected: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ORDPATTERN_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readOrderPatternConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[ordpatanom-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runOrderPatternEngine(db, config);
      toast.success(`Detected ${result.generated} pattern anomalies — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[ordpatanom-report] analyze failed', err);
      toast.error('Detection failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[ordpatanom-report] status failed', err);
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
      <DocumentTitle parts={["AI Order Pattern Anomaly", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faMagnifyingGlassChart} className="text-violet-600" />
              AI Customer Order Pattern Anomaly Detector
            </h1>
            <p className="text-sm text-neutral-500">
              Detects per-customer order pattern deviations from their baseline — signals life events + opportunities
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Detecting…' : 'Detect anomalies'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faMagnifyingGlassChart} label="Customers affected" value={String(summary.customersAffected)} color="text-violet-600" />
          <SummaryCard icon={faLayerGroup} label="Anomaly types" value={String(summary.anomalyTypes)} color="text-amber-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faMagnifyingGlassChart} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-violet-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faMagnifyingGlassChart} spin className="text-4xl mb-3" />
            <p>Detecting order pattern anomalies…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No pattern anomalies detected</p>
            <p className="text-sm mt-1">All customers ordering within their baseline patterns.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faMagnifyingGlassChart, label: alert.rule_id.toUpperCase() };
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
                          {alert.anomaly_type && (
                            <span className="text-xs font-medium uppercase text-violet-600">{alert.anomaly_type.replace('_', ' ')}</span>
                          )}
                          {alert.deviation_score != null && (
                            <span className={`text-xs font-bold ${alert.deviation_score >= 80 ? 'text-rose-600' : alert.deviation_score >= 60 ? 'text-amber-600' : 'text-neutral-500'}`}>
                              {alert.deviation_score}/100 deviation
                            </span>
                          )}
                          {alert.baseline_value && alert.anomaly_value && (
                            <span className="text-xs">
                              <span className="text-neutral-400">{alert.baseline_value}</span>
                              <span className="mx-1 text-neutral-400">→</span>
                              <span className="font-medium text-violet-600">{alert.anomaly_value}</span>
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.baseline_avg_spend != null && alert.anomaly_spend != null && (
                            <span>
                              <span className="text-neutral-400">{fmt$(alert.baseline_avg_spend)}</span>
                              <span className="mx-1">→</span>
                              <span className="font-medium text-emerald-600">{fmt$(alert.anomaly_spend)}</span>
                            </span>
                          )}
                          {alert.baseline_order_size != null && alert.anomaly_order_size != null && (
                            <span>{alert.baseline_order_size} → {alert.anomaly_order_size} items</span>
                          )}
                          {alert.customer_orders_count != null && <span className="text-neutral-400">{alert.customer_orders_count} prior orders</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Acted
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Personalizing
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
          <span>Min orders for baseline: {config.minOrders}</span>
          <span>Deviation threshold: {config.deviationThreshold}/100</span>
          <span>Size multiplier: {config.sizeMultiplier}x</span>
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

export default OrderPatternAnomalyScreen;
