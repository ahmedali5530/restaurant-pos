/**
 * AI Restaurant Delivery Zone Profitability Optimizer — analyzes delivery zone
 * profitability, recommends zone expansion/contraction, detects cannibalization.
 *
 * 106th POSR-exclusive differentiator — restaurants lose $200-800/mo from
 * unoptimized delivery zones.
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
  faMapLocationDot, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faArrowTrendDown, faArrowTrendUp, faShuffle,
  faExpand, faCompress, faClock, faTruck,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runZoneEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readZoneConfig, DEFAULT_ZONE_CONFIG,
  type ZoneAlert,
} from "@/lib/delivery-zone-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  unprofitable_zone:          { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faArrowTrendDown,   label: 'UNPROFITABLE' },
  density_gap:                { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faMapLocationDot,   label: 'DENSITY GAP' },
  cannibalization_detected:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faShuffle,          label: 'CANNIBALIZATION' },
  radius_too_large:           { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faExpand,           label: 'RADIUS TOO LARGE' },
  peak_zone_loss:             { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faClock,            label: 'PEAK LOSS' },
  zone_expansion_opportunity: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,     label: 'EXPANSION' },
  zone_contraction_needed:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCompress,         label: 'CONTRACTION' },
  driver_cost_excessive:      { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faTruck,            label: 'DRIVER COST' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function DeliveryZoneOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ZoneAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalLoss: 0, totalOpportunity: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ZONE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readZoneConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[zone-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runZoneEngine(db, config);
      toast.success(`Generated ${result.generated} delivery zone alerts`);
      await reload();
    } catch (err) {
      console.error('[zone-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[zone-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_loss + b.est_monthly_opportunity) - (a.est_monthly_loss + a.est_monthly_opportunity);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Delivery Zone Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faMapLocationDot} className="text-sky-600" />
              AI Delivery Zone Profitability Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Analyzes zone profitability — recommends expansion, contraction, cannibalization fixes
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze zones'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Monthly loss" value={fmt$(summary.totalLoss)} color="text-rose-600" />
          <SummaryCard icon={faArrowTrendUp} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-emerald-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical/high" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faMapLocationDot} label="Open alerts" value={String(summary.totalAlerts)} color="text-sky-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faMapLocationDot} spin className="text-4xl mb-3" />
            <p>Loading delivery zone alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No delivery zone alerts</p>
            <p className="text-sm mt-1">All zones profitable.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faMapLocationDot, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.zone_name}</span>
                          {alert.zone_distance_km != null && <span className="text-xs text-neutral-400">{alert.zone_distance_km}km</span>}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.order_count_30d != null && <span>Orders: {alert.order_count_30d}/mo</span>}
                          {alert.avg_revenue_per_order != null && <span>Revenue: {fmt$(alert.avg_revenue_per_order)}</span>}
                          {alert.avg_driver_cost != null && <span>Driver: {fmt$(alert.avg_driver_cost)}</span>}
                          {alert.net_profit_per_order != null && (
                            <span className={alert.net_profit_per_order < 3 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>
                              Net: {fmt$(alert.net_profit_per_order)}/order
                            </span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {alert.est_monthly_loss > 0 && (
                        <>
                          <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_monthly_loss)}</div>
                          <div className="text-xs text-neutral-400">loss/mo</div>
                        </>
                      )}
                      {alert.est_monthly_opportunity > 0 && (
                        <>
                          <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                          <div className="text-xs text-neutral-400">opportunity/mo</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Resolved
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> In progress
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
          <span>Max radius: {config.maxRadiusKm}km</span>
          <span>Min profit: {fmt$(config.minProfitPerOrder)}/order</span>
          <span>Driver cost: ${config.driverCostPerKm}/km</span>
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

export default DeliveryZoneOptimizerScreen;
