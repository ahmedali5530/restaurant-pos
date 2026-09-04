/**
 * AI Kitchen Demand Surge Predictor — predicts item-level demand surges
 * 15-30 min ahead and triggers pre-prep recommendations.
 *
 * 110th POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from kitchen bottlenecks that could be prevented with advance
 * warning. No POS predicts item-level demand surges.
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
  faBolt, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faGaugeHigh, faStopwatch, faUsers,
  faBoxOpen, faFilterCircleXmark, faChartLine, faUtensils,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runKitchenSurgeEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readKitchenSurgeConfig, DEFAULT_KITCHENSURGE_CONFIG,
  type KitchenSurgeAlert,
} from "@/lib/kitchen-demand-surge.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  surge_imminent:              { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faBolt,             label: 'SURGE IMMINENT' },
  prep_lead_time_warning:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faStopwatch,        label: 'PREP LEAD' },
  station_overload_predicted:  { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faGaugeHigh,        label: 'STATION OVERLOAD' },
  ingredient_stock_warning:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBoxOpen,          label: 'STOCK LOW' },
  staffing_gap_predicted:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUsers,            label: 'STAFF GAP' },
  false_surge_filtered:        { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: faFilterCircleXmark, label: 'FALSE SURGE' },
  surge_decayed:               { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faChartLine,        label: 'SURGE DECAYED' },
  cross_station_coordination:  { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faUtensils,         label: 'CROSS-STATION' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const STATION_COLOR: Record<string, string> = {
  grill: 'text-rose-600',
  saute: 'text-amber-600',
  fry: 'text-orange-600',
  cold: 'text-sky-600',
  pastry: 'text-violet-600',
  bar: 'text-emerald-600',
  expediter: 'text-neutral-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function KitchenDemandSurgeScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<KitchenSurgeAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, surgesPredicted: 0, stationsAffected: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_KITCHENSURGE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readKitchenSurgeConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[kitchensurge-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runKitchenSurgeEngine(db, config);
      toast.success(`Predicted ${result.generated} surge alerts — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[kitchensurge-report] analyze failed', err);
      toast.error('Prediction failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[kitchensurge-report] status failed', err);
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
      <DocumentTitle parts={["AI Kitchen Demand Surge", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBolt} className="text-rose-500" />
              AI Kitchen Demand Surge Predictor
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts item-level demand surges 15-30 min ahead — triggers pre-prep to prevent bottlenecks
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Predicting…' : 'Predict surges'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faBolt} label="Surges predicted" value={String(summary.surgesPredicted)} color="text-rose-600" />
          <SummaryCard icon={faGaugeHigh} label="Stations affected" value={String(summary.stationsAffected)} color="text-amber-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faBolt} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-rose-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBolt} spin className="text-4xl mb-3" />
            <p>Predicting kitchen demand surges…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No surge alerts</p>
            <p className="text-sm mt-1">Kitchen demand stable — no surges predicted.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faBolt, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.menu_item}</span>
                          {alert.station && (
                            <span className={`text-xs font-medium uppercase ${STATION_COLOR[alert.station] ?? 'text-neutral-500'}`}>
                              {alert.station}
                            </span>
                          )}
                          {alert.surge_pct != null && (
                            <span className={`text-xs font-bold ${alert.surge_pct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {alert.surge_pct >= 0 ? '+' : ''}{alert.surge_pct}% surge
                            </span>
                          )}
                          {alert.confidence_pct != null && (
                            <span className={`text-xs font-medium ${alert.confidence_pct >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {alert.confidence_pct}% conf
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.current_rate != null && alert.predicted_rate != null && (
                            <span>
                              <span className="text-neutral-400">{alert.current_rate}</span>
                              <span className="mx-1">→</span>
                              <span className="font-medium text-rose-600">{alert.predicted_rate}</span> ord/15min
                            </span>
                          )}
                          {alert.minutes_ahead != null && <span>{alert.minutes_ahead} min ahead</span>}
                          {alert.prep_lead_minutes != null && <span>Prep: {alert.prep_lead_minutes} min</span>}
                          {alert.current_stock != null && alert.stock_needed != null && (
                            <span className={alert.current_stock < alert.stock_needed ? 'text-rose-600 font-medium' : ''}>
                              Stock: {alert.current_stock}/{alert.stock_needed}
                            </span>
                          )}
                          {alert.staff_assigned != null && alert.staff_needed != null && (
                            <span className={alert.staff_assigned < alert.staff_needed ? 'text-amber-600 font-medium' : ''}>
                              Staff: {alert.staff_assigned}/{alert.staff_needed}
                            </span>
                          )}
                          {alert.context_factors && <span className="text-neutral-400">{alert.context_factors}</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-rose-50 border border-rose-200 rounded px-3 py-2 text-xs text-rose-800 flex items-start gap-2">
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
                      <FontAwesomeIcon icon={faRotate} /> Prepping
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
          <span>Surge threshold: +{config.threshold}%</span>
          <span>Prep window: {config.prepWindow} min</span>
          <span>Min confidence: {config.minConfidence}%</span>
          <span>Stock buffer: +{config.stockBuffer}%</span>
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

export default KitchenDemandSurgeScreen;
