/**
 * Delivery Route Optimization Dashboard — group + optimize delivery stops.
 *
 * 32nd POSR-exclusive differentiator — Toast, Square have NO delivery route
 * optimization. POSR groups nearby orders + optimizes stop sequence.
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
  faRoute, faRobot, faRotate, faLightbulb,
  faCheckCircle, faMapLocationDot, faClock, faDollarSign, faTruck,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runDeliveryRouteOptimization, getActiveRoutes, getSummary, updateRouteStatus,
  readDeliveryRouteConfig, DEFAULT_DELIVERY_ROUTE_CONFIG,
  type DeliveryRouteSuggestion,
} from "@/lib/delivery-route.service.ts";

export function DeliveryRouteScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [routes, setRoutes] = useState<DeliveryRouteSuggestion[]>([]);
  const [summary, setSummary] = useState({ totalRoutes: 0, totalOrders: 0, totalSavingsKm: 0, totalFuelSavings: 0, avgMinutes: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_DELIVERY_ROUTE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readDeliveryRouteConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRoutes(db), getSummary(db)]);
      setRoutes(list); setSummary(sum);
    } catch (err) { console.error('[delivery-route-report] reload failed', err); toast.error('Failed to load routes'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true); setProgress({ current: 0, total: 2 });
    try {
      const result = await runDeliveryRouteOptimization(db, config, (current, total) => setProgress({ current, total }));
      toast.success(result.routes.length > 0
        ? `Optimized ${result.scanned} delivery orders into ${result.routes.length} routes — ${result.routes.reduce((s, r) => s + r.savings_km, 0).toFixed(1)}km saved`
        : `No pending delivery orders with customer location found`);
      await reload();
    } catch (err) { console.error('[delivery-route-report] analyze failed', err); toast.error('Optimization failed — see console'); }
    finally { setAnalyzing(false); setProgress({ current: 0, total: 0 }); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (routeId: string, status: string) => {
    try { await updateRouteStatus(db, routeId, status); toast.success(`Route marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Delivery Route Optimization", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faRoute} className="text-blue-600" />
              Delivery Route Optimization
            </h1>
            <p className="text-sm text-neutral-500">
              AI route grouping + nearest-neighbor optimization — minimize distance + fuel (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Optimizing… (${progress.current}/${progress.total})` : 'Optimize routes'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading routes…</p>
          </div>
        ) : routes.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No pending delivery routes!</p>
            <p className="text-sm mt-1">No unoptimized delivery orders. Click "Optimize routes" to recheck.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faRoute} />Routes</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.totalRoutes}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Orders</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.totalOrders}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faMapLocationDot} />Distance saved</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.totalSavingsKm.toFixed(1)} km</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Fuel saved</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalFuelSavings)}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faClock} />Avg route time</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{Math.round(summary.avgMinutes)} min</div>
              </div>
            </div>

            <div className="space-y-3">
              {routes.map((route, idx) => {
                const stops = route.stop_sequence ?? [];
                return (
                  <div key={idx} className="rounded-lg border-2 p-4 bg-white border-blue-200">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faTruck} className="text-xl text-blue-600" />
                        <span className="font-semibold">Route {route.route_id}</span>
                        <span className="text-sm text-neutral-500">· {route.order_count} stops</span>
                      </div>
                      <div className="flex gap-4 text-right">
                        <div>
                          <div className="text-xs text-neutral-500">Distance</div>
                          <div className="font-bold tabular-nums text-neutral-700">{route.total_distance_km} km</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Est. time</div>
                          <div className="font-bold tabular-nums text-amber-600">{route.est_total_minutes} min</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Saved</div>
                          <div className="font-bold tabular-nums text-emerald-600">{route.savings_km} km</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Fuel saved</div>
                          <div className="font-bold tabular-nums text-emerald-600">{withCurrency(route.est_fuel_savings)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Stop sequence */}
                    {stops.length > 0 && (
                      <div className="bg-neutral-50 rounded p-3 mb-2">
                        <div className="text-xs font-medium text-neutral-600 mb-2">Optimized stop sequence:</div>
                        <div className="flex flex-wrap gap-2">
                          {stops.map((stop, sidx) => (
                            <div key={sidx} className="bg-white rounded-lg border border-neutral-200 px-3 py-1.5 text-xs">
                              <div className="font-bold text-blue-600">#{stop.stop_number}</div>
                              <div className="text-neutral-700">{stop.customer_name}</div>
                              {stop.address && <div className="text-neutral-400 text-[10px] truncate max-w-32">{stop.address}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {route.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{route.ai_insight}</p>
                      </div>
                    )}

                    <div className="flex gap-1 ml-auto">
                      <button onClick={() => route.id && handleStatus(route.id, 'dispatched')}
                        className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                        <FontAwesomeIcon icon={faTruck} /> Dispatch
                      </button>
                      <button onClick={() => route.id && handleStatus(route.id, 'completed')}
                        className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                        <FontAwesomeIcon icon={faCheckCircle} /> Complete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Max stops: <strong>{config.maxStops}</strong></span>
              <span>Cluster radius: <strong>{config.clusterKm} km</strong></span>
              <span>Fuel cost: <strong>{withCurrency(config.fuelPerKm)}/km</strong></span>
              <span>Avg speed: <strong>{config.avgSpeedKmh} km/h</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default DeliveryRouteScreen;
