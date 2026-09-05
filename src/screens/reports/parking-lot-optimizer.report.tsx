/**
 * AI Parking Lot Turnover Optimizer — predicts parking lot capacity
 * constraints and their impact on customer arrivals + revenue.
 *
 * 148th POSR-exclusive differentiator.
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
  faCarSide, faRotate, faTriangleExclamation, faClock, faUserTie,
  faHandshake, faDollarSign, faBus, faCalendarAlt, faCheckCircle,
  faLightbulb, faRoadBarrier,
} from "@fortawesome/free-solid-svg-icons";
import {
  runParkingEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readParkingConfig, DEFAULT_PARKING_CONFIG,
  type ParkingAlert,
} from "@/lib/parking-lot-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  lot_full_predicted:                        { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation, label: 'LOT FULL' },
  arrival_drop_during_peak:                  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,               label: 'ARRIVAL DROP' },
  long_parker_overstay:                      { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faRoadBarrier,         label: 'OVERSTAY' },
  vip_arrival_no_reserved_spot:              { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faUserTie,             label: 'VIP ARRIVAL' },
  neighbor_lot_partnership_opportunity:      { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faHandshake,           label: 'PARTNER' },
  valet_cost_benefit:                        { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faDollarSign,          label: 'VALET ROI' },
  transit_incentive_opportunity:             { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faBus,                 label: 'TRANSIT' },
  time_shift_reservation_opportunity:        { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faCalendarAlt,         label: 'TIME-SHIFT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function ParkingLotOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ParkingAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, lotsAtRisk: 0, avgOccupancyPct: 0, totalWalkAways: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PARKING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readParkingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[parking-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runParkingEngine(db, config);
      toast.success(`Analyzed ${result.generated} parking signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[parking-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[parking-report] status failed', err);
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
      <DocumentTitle parts={["AI Parking Lot Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCarSide} className="text-amber-500" />
              AI Parking Lot Turnover Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts parking capacity constraints + arrival impact — 28% leave if lot is full (INRIX 2023)
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faCarSide} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze parking'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faRoadBarrier} label="Lots at risk" value={String(summary.lotsAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faCarSide} label="Avg occupancy" value={`${summary.avgOccupancyPct.toFixed(0)}%`} color={summary.avgOccupancyPct >= 90 ? 'text-rose-600' : 'text-amber-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Predicted walk-aways" value={String(summary.totalWalkAways)} color="text-rose-600" />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCarSide} spin className="text-4xl mb-3" />
            <p>Analyzing parking lot capacity + arrival impact…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No parking alerts</p>
            <p className="text-sm mt-1">Lot capacity healthy, no arrival drop detected.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faCarSide, label: alert.rule_id.toUpperCase() };
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
                          {alert.lot_zone && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.lot_zone} lot</span>
                          )}
                          {alert.time_of_day && (
                            <span className="text-xs font-medium text-amber-600">@ {alert.time_of_day}</span>
                          )}
                          {alert.peak_hour && (
                            <span className="text-xs text-neutral-500">peak {alert.peak_hour}</span>
                          )}
                          {alert.occupancy_pct != null && (
                            <span className={`text-xs font-bold ${alert.occupancy_pct >= 95 ? 'text-rose-600' : alert.occupancy_pct >= 85 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {alert.occupancy_pct.toFixed(0)}% full
                            </span>
                          )}
                          {alert.predicted_occupancy_30min_pct != null && (
                            <span className="text-xs text-neutral-500">→ {alert.predicted_occupancy_30min_pct.toFixed(0)}% in 30min</span>
                          )}
                          {alert.occupied_spots != null && alert.total_spots != null && (
                            <span className="text-xs text-neutral-500">{alert.occupied_spots}/{alert.total_spots} spots</span>
                          )}
                          {alert.predicted_walk_aways != null && alert.predicted_walk_aways > 0 && (
                            <span className="text-xs text-rose-600 font-medium">{alert.predicted_walk_aways} walk-aways</span>
                          )}
                          {alert.vip_arrivals_next_30min != null && alert.vip_arrivals_next_30min > 0 && (
                            <span className="text-xs text-fuchsia-600 font-medium">{alert.vip_arrivals_next_30min} VIP arriving</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_arrivals_next_30min != null && (
                            <span>arrivals 30min: <span className="text-neutral-700 font-medium">{alert.predicted_arrivals_next_30min}</span></span>
                          )}
                          {alert.avg_revenue_per_arrival != null && (
                            <span>revenue/arrival: <span className="text-emerald-600 font-medium">{fmt$(alert.avg_revenue_per_arrival)}</span></span>
                          )}
                          {alert.long_parkers_count != null && alert.long_parkers_count > 0 && (
                            <span className="text-yellow-700">{alert.long_parkers_count} long-parkers ({alert.avg_long_parker_duration_hours?.toFixed(1)}h)</span>
                          )}
                          {alert.valet_cost_per_car != null && alert.valet_revenue_recovered_per_car != null && (
                            <span>valet: <span className="text-rose-600">{fmt$(alert.valet_cost_per_car)}</span> cost vs <span className="text-emerald-600 font-medium">{fmt$(alert.valet_revenue_recovered_per_car)}</span> recovered</span>
                          )}
                          {alert.neighbor_lot_distance_m != null && alert.neighbor_lot_distance_m > 0 && (
                            <span className="text-emerald-700">neighbor lot: {alert.neighbor_lot_distance_m}m, {alert.neighbor_lot_available_spots} spots</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo at risk</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Action taken
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
          <span>Lot full threshold: ≥{config.lotFullThresholdPct}%</span>
          <span>Arrival drop: ≥{config.arrivalDropThresholdPct}%</span>
          <span>Long-parker: ≥{config.longParkerThresholdHours}h</span>
          <span>Valet cost: ${config.valetCostPerCar}/car</span>
          <span className="text-neutral-400">148th POSR-exclusive differentiator</span>
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

export default ParkingLotOptimizerScreen;
