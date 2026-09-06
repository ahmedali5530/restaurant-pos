/**
 * AI Room Partition & Spatial Divider Optimizer — predicts how room partitions
 * and spatial dividers (physical screens, planter dividers, glass partitions,
 * curtain dividers, bookshelf dividers, acoustic panels, movable dividers)
 * impact customer privacy, noise control, spatial flow, perceived intimacy,
 * table density, and flexible space management.
 *
 * 171st POSR-exclusive differentiator.
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
  faTableColumns, faRotate, faCompress, faLayerGroup, faExpandArrowsAlt,
  faGripLinesVertical, faBorderStyle, faLeaf, faImage,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runRoomPartitionEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readRoomPartitionConfig, DEFAULT_ROOM_PARTITION_CONFIG,
  type RoomPartitionAlert,
} from "@/lib/room-partition-divider.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  partition_absent_noise_propagation:  { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faTableColumns,        label: 'NOISE PROPAGATION' },
  over_partitioned_cramped:            { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faCompress,            label: 'OVER-PARTITIONED' },
  partition_type_wrong_for_zone:       { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faLayerGroup,          label: 'WRONG TYPE' },
  movable_partition_absent:            { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faExpandArrowsAlt,     label: 'NO MOVABLE' },
  partition_height_suboptimal:         { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faGripLinesVertical,   label: 'HEIGHT WRONG' },
  partition_brand_mismatch:            { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faBorderStyle,         label: 'BRAND MISMATCH' },
  planter_partition_opportunity:       { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faLeaf,                label: 'PLANTER OPPORTUNITY' },
  partition_cleanliness_wear:          { bg: 'bg-stone-50',    text: 'text-stone-700',    icon: faImage,               label: 'DIRTY/WORN' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function RoomPartitionDividerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<RoomPartitionAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, noisePropagationZones: 0, overPartitionedZones: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ROOM_PARTITION_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readRoomPartitionConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[room-partition-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runRoomPartitionEngine(db, config);
      toast.success(`Analyzed ${result.generated} partition + divider signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[room-partition-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[room-partition-report] status failed', err);
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
      <DocumentTitle parts={["AI Room Partition & Spatial Divider Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTableColumns} className="text-violet-600" />
              AI Room Partition &amp; Spatial Divider Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how room partitions + spatial dividers (physical screens, planter dividers, glass partitions, curtains, acoustic panels, bookshelf dividers, movable dividers) impact customer privacy, noise control, spatial flow, perceived intimacy, table density — partitions reduce noise 35-45% (ASA); 25-30% higher privacy satisfaction (Cornell CHR); 40% of date couples prefer partitioned seating; movable dividers enable 15-20% more peak tables; planter dividers combine biophilic + acoustic benefit
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faTableColumns} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze partitions'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTableColumns} label="Noise propagation zones" value={String(summary.noisePropagationZones)} color={summary.noisePropagationZones > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faCompress} label="Over-partitioned zones" value={String(summary.overPartitionedZones)} color={summary.overPartitionedZones > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Zones at risk" value={String(summary.zonesAtRisk)} color={summary.zonesAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTableColumns} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTableColumns} spin className="text-4xl mb-3" />
            <p>Analyzing partition + spatial divider opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No partition/divider alerts</p>
            <p className="text-sm mt-1">Partitions between zones block noise, movable dividers enable capacity flexibility, materials match zone purpose, heights in range, brand aligned, planter dividers present, partitions clean and intact.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faTableColumns, label: alert.rule_id.toUpperCase() };
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
                          {alert.location_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.location_id}</span>
                          )}
                          {alert.restaurant_tier && (
                            <span className="text-xs text-neutral-500">{alert.restaurant_tier}</span>
                          )}
                          {alert.partition_count != null && (
                            <span className={`text-xs ${alert.partition_count === 0 ? 'text-rose-600 font-medium' : alert.partition_count > 6 ? 'text-amber-600 font-medium' : 'text-neutral-600 font-medium'}`}>{alert.partition_count} partition{alert.partition_count === 1 ? '' : 's'}</span>
                          )}
                          {alert.partition_types && alert.partition_types.length > 0 && (
                            <span className="text-xs text-neutral-500">types: {alert.partition_types.join(', ')}</span>
                          )}
                          {alert.has_movable_partitions != null && alert.partition_count != null && alert.partition_count > 0 && (
                            <span className={`text-xs ${alert.has_movable_partitions ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.has_movable_partitions ? `${alert.movable_partition_count ?? 0} movable` : 'no movable'}</span>
                          )}
                          {alert.partition_height_ft != null && alert.partition_height_ft > 0 && (
                            <span className={`text-xs ${alert.partition_height_ft < 4 ? 'text-rose-600 font-medium' : alert.partition_height_ft > 6 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.partition_height_ft} ft ({alert.partition_height_category})</span>
                          )}
                          {alert.partition_material_quality_score != null && alert.partition_material_quality_score > 0 && (
                            <span className={`text-xs ${alert.partition_material_quality_score < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.partition_material_quality_score}/100 material</span>
                          )}
                          {alert.partition_brand_match_score != null && alert.partition_brand_match_score > 0 && (
                            <span className={`text-xs ${alert.partition_brand_match_score < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.partition_brand_match_score}/100 brand</span>
                          )}
                          {alert.partition_cleanliness_score != null && alert.partition_cleanliness_score > 0 && (
                            <span className={`text-xs ${alert.partition_cleanliness_score < 50 ? 'text-rose-600 font-medium' : alert.partition_cleanliness_score < 80 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.partition_cleanliness_score}/100 clean</span>
                          )}
                          {alert.partition_worn_damaged != null && alert.partition_worn_damaged && (
                            <span className="text-xs text-rose-600 font-medium">worn/damaged</span>
                          )}
                          {alert.has_planter_divider != null && alert.partition_count != null && alert.partition_count > 0 && (
                            <span className={`text-xs ${alert.has_planter_divider ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.has_planter_divider ? 'has planter' : 'no planter'}</span>
                          )}
                          {alert.partition_sightline_score != null && alert.partition_sightline_score > 0 && alert.partition_sightline_score < 100 && (
                            <span className={`text-xs ${alert.partition_sightline_score < 50 ? 'text-rose-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.partition_sightline_score}/100 sightline</span>
                          )}
                          {alert.zone_layout && alert.zone_layout !== 'none' && (
                            <span className={`text-xs ${alert.zone_layout === 'over_partitioned' ? 'text-rose-600 font-medium' : alert.zone_layout === 'open' ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.zone_layout}</span>
                          )}
                          {alert.unseparated_adjacent_zones != null && alert.unseparated_adjacent_zones > 0 && (
                            <span className="text-xs text-rose-600 font-medium">{alert.unseparated_adjacent_zones} unseparated zone{alert.unseparated_adjacent_zones === 1 ? '' : 's'}</span>
                          )}
                          {alert.noise_reduction_pct != null && alert.noise_reduction_pct > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.noise_reduction_pct}% noise reduction</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.perceived_intimacy_change != null && alert.perceived_intimacy_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_intimacy_change}% intimacy</span>
                          )}
                          {alert.perceived_spaciousness_change != null && alert.perceived_spaciousness_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_spaciousness_change}% spaciousness</span>
                          )}
                          {alert.noise_comfort_change != null && alert.noise_comfort_change < 0 && (
                            <span className="text-rose-600">{alert.noise_comfort_change}% noise comfort</span>
                          )}
                          {alert.customer_satisfaction_change != null && alert.customer_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.customer_satisfaction_change}% satisfaction</span>
                          )}
                          {alert.service_speed_change != null && alert.service_speed_change < 0 && (
                            <span className="text-rose-600">{alert.service_speed_change}% service speed</span>
                          )}
                          {alert.predicted_dwell_change != null && alert.predicted_dwell_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_dwell_change}% dwell</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLayerGroup} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
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
          <span>Min material score: {config.minPartitionMaterialScore}/100</span>
          <span>Min brand match: {config.minPartitionBrandMatchScore}/100</span>
          <span>Min cleanliness: {config.minPartitionCleanlinessScore}/100</span>
          <span>Min sightline: {config.minPartitionSightlineScore}/100</span>
          <span>Min noise reduction: {config.minNoiseReductionPct}%</span>
          <span>Partitions between zones: <span className={config.requirePartitionsBetweenZones ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePartitionsBetweenZones ? 'required' : 'optional'}</span></span>
          <span>Movable partitions: <span className={config.requireMovablePartitions ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMovablePartitions ? 'required' : 'optional'}</span></span>
          <span>Planter dividers: <span className={config.requirePlanterDividers ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePlanterDividers ? 'required' : 'optional'}</span></span>
          <span>Max partitions before cramped: {config.maxPartitionCountBeforeCramped}</span>
          <span>Optimal height range: {config.optimalPartitionHeightMin}-{config.optimalPartitionHeightMax} ft</span>
          <span>Height in range: <span className={config.requirePartitionHeightInRange ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePartitionHeightInRange ? 'required' : 'optional'}</span></span>
          <span>Brand match: <span className={config.requirePartitionBrandMatch ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePartitionBrandMatch ? 'required' : 'optional'}</span></span>
          <span>Clean partitions: <span className={config.requireCleanPartitions ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCleanPartitions ? 'required' : 'optional'}</span></span>
          <span className="text-neutral-400">171st POSR-exclusive differentiator</span>
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

export default RoomPartitionDividerScreen;
