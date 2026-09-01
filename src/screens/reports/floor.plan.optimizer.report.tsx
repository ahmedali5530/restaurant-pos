/**
 * AI Floor Plan Optimizer — structural layout analysis dashboard.
 *
 * 57th POSR-exclusive differentiator — floor plan layout affects revenue
 * by 15-25% (Cornell hospitality design research).
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
  faTableColumns, faRotate, faLightbulb, faCheckCircle,
  faChair, faTriangleExclamation, faRoute, faArrowsLeftRight, faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runFloorPlanEngine, getActiveOptimizations, getSummary, updateOptimizationStatus,
  readFloorPlanConfig, DEFAULT_FLOOR_PLAN_CONFIG,
  type FloorPlanOptimization,
} from "@/lib/floor-plan-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  capacity_mismatch:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faChair,                label: 'CAPACITY MISMATCH' },
  dead_zone:           { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTriangleExclamation,  label: 'DEAD ZONE' },
  bottleneck_table:    { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faRoute,                label: 'BOTTLENECK' },
  aisle_congestion:    { bg: 'bg-orange-50',   text: 'text-orange-700',  icon: faArrowsLeftRight,      label: 'AISLE CONGESTION' },
  density_opportunity: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faPlus,                 label: 'DENSITY OPPORTUNITY' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const ACTION_STYLE: Record<string, string> = {
  add_table:       'bg-emerald-100 text-emerald-700',
  remove_table:    'bg-rose-100 text-rose-700',
  change_capacity: 'bg-amber-100 text-amber-700',
  relocate:        'bg-violet-100 text-violet-700',
  widen_aisle:     'bg-blue-100 text-blue-700',
  split_table:     'bg-yellow-100 text-yellow-700',
  merge_tables:    'bg-pink-100 text-pink-700',
};

export function FloorPlanOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [optimizations, setOptimizations] = useState<FloorPlanOptimization[]>([]);
  const [summary, setSummary] = useState({ totalRecommendations: 0, criticalCount: 0, totalRevenueImpact: 0, tablesAffected: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_FLOOR_PLAN_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readFloorPlanConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveOptimizations(db), getSummary(db)]);
      setOptimizations(list); setSummary(sum);
    } catch (err) { console.error('[floor-plan-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runFloorPlanEngine(db, config);
      toast.success(result.optimizations.length > 0
        ? `Generated ${result.optimizations.length} floor plan recommendations — est ${withCurrency(result.optimizations.reduce((s, o) => s + o.est_revenue_impact, 0))} revenue impact`
        : `No floor plan issues detected — layout is optimal`);
      await reload();
    } catch (err) { console.error('[floor-plan-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (optId: string, status: 'implemented' | 'testing' | 'declined') => {
    try { await updateOptimizationStatus(db, optId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: by est_revenue_impact desc
  const sortedOpts = [...optimizations].sort((a, b) => b.est_revenue_impact - a.est_revenue_impact);

  return (
    <Layout>
      <DocumentTitle parts={["Floor Plan Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTableColumns} className="text-violet-600" />
              AI Floor Plan Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Structural layout analysis — capacity mix, dead zones, bottlenecks, density (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Analyze layout'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : optimizations.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTableColumns} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No floor plan issues!</p>
            <p className="text-sm mt-1">Click "Analyze layout" to detect structural inefficiencies in your floor plan.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTableColumns} />Recommendations</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.totalRecommendations}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center ring-2 ring-emerald-200">
                <div className="text-xs text-emerald-700 font-semibold">Est. revenue impact</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{withCurrency(summary.totalRevenueImpact)}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faChair} />Tables affected</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.tablesAffected}</div>
              </div>
            </div>

            {/* Optimizations list */}
            <div className="space-y-3">
              {sortedOpts.map((o, idx) => {
                const style = RULE_STYLE[o.rule_id] ?? RULE_STYLE.capacity_mismatch;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    {/* Header */}
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[o.severity] ?? SEVERITY_DOT.low}`}></span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          {o.table_name && <span className="font-medium">{o.table_name}</span>}
                          {o.zone && <span className="text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700">{o.zone}</span>}
                          {o.action_type && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${ACTION_STYLE[o.action_type] ?? ACTION_STYLE.change_capacity}`}>
                              {o.action_type.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">Util: <strong className={o.utilization_pct > 70 ? 'text-emerald-600' : o.utilization_pct > 40 ? 'text-amber-600' : 'text-rose-600'}>{o.utilization_pct}%</strong></span>
                          <span className="text-neutral-500">Impact: <strong className="text-emerald-600">{withCurrency(o.est_revenue_impact)}</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{o.description}</p>
                    </div>

                    {/* Details + actions */}
                    <div className="p-3">
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        {o.current_capacity !== undefined && (
                          <div className="text-center">
                            <div className="text-xs text-neutral-500">Current</div>
                            <div className="font-bold text-amber-600">{o.current_capacity}-top</div>
                          </div>
                        )}
                        {o.suggested_capacity !== undefined && (
                          <div className="text-center">
                            <div className="text-xs text-neutral-500">Suggested</div>
                            <div className="font-bold text-emerald-600">{o.suggested_capacity}-top</div>
                          </div>
                        )}
                        <div className="text-center">
                          <div className="text-xs text-neutral-500">Tables affected</div>
                          <div className="font-bold text-violet-600">{o.affected_tables}</div>
                        </div>
                      </div>

                      {/* AI insight */}
                      {o.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{o.ai_insight}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => o.id && handleStatus(o.id, 'implemented')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Implement
                        </button>
                        <button onClick={() => o.id && handleStatus(o.id, 'testing')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          Test 30d
                        </button>
                        <button onClick={() => o.id && handleStatus(o.id, 'declined')} className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Dead zone threshold: <strong>{(config.deadZoneThreshold * 100).toFixed(0)}%</strong></span>
              <span>Min aisle: <strong>{config.minAisleWidthCm}cm</strong></span>
              <span>Target density: <strong>{(config.targetDensityPct * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default FloorPlanOptimizerScreen;
