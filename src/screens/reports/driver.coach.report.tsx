/**
 * AI Delivery Driver Performance Coach — individual driver coaching dashboard.
 *
 * 66th POSR-exclusive differentiator — driver performance varies 40-60%
 * (McKinsey).
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
  faTruckFast, faRotate, faLightbulb, faCheckCircle,
  faClock, faShieldHalved, faStar, faRoute, faTrophy,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runDriverCoachEngine, getActiveCoachings, getSummary, updateCoachingStatus,
  readDriverCoachConfig, DEFAULT_DRIVER_COACH_CONFIG,
  type DriverCoach,
} from "@/lib/driver-coach.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  speed_coaching:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,         label: 'SPEED' },
  accuracy_coaching:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faShieldHalved,  label: 'ACCURACY' },
  rating_improvement:  { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faStar,          label: 'RATING' },
  route_efficiency:    { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faRoute,         label: 'ROUTE' },
  top_performer:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faTrophy,        label: 'TOP PERFORMER' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const scoreColor = (s: number): string => {
  if (s >= 80) return 'text-emerald-600';
  if (s >= 60) return 'text-yellow-600';
  if (s >= 40) return 'text-amber-600';
  return 'text-rose-600';
};

const scoreBarColor = (s: number): string => {
  if (s >= 80) return 'bg-emerald-500';
  if (s >= 60) return 'bg-yellow-400';
  if (s >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
};

const parseActions = (json?: string): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export function DriverCoachScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [coachings, setCoachings] = useState<DriverCoach[]>([]);
  const [summary, setSummary] = useState({ driverCount: 0, criticalCount: 0, topPerformerCount: 0, avgScore: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_DRIVER_COACH_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readDriverCoachConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveCoachings(db), getSummary(db)]);
      setCoachings(list); setSummary(sum);
    } catch (err) { console.error('[driver-coach-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runDriverCoachEngine(db, config);
      toast.success(result.coachings.length > 0
        ? `Generated ${result.coachings.length} driver coaching plans — ${result.coachings.filter(c => c.severity === 'critical').length} critical, ${result.coachings.filter(c => c.rule_id === 'top_performer').length} top performers`
        : `No coaching needed — all drivers performing adequately`);
      await reload();
    } catch (err) { console.error('[driver-coach-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (coachingId: string, status: 'coaching_applied' | 'reviewed') => {
    try { await updateCoachingStatus(db, coachingId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  const sortedCoachings = [...coachings].sort((a, b) => a.overall_score - b.overall_score);

  return (
    <Layout>
      <DocumentTitle parts={["Driver Coach", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTruckFast} className="text-violet-600" />
              AI Driver Coach
            </h1>
            <p className="text-sm text-neutral-500">
              Individual driver coaching — speed, accuracy, rating, route efficiency (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Coach drivers'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : coachings.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTruckFast} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No driver coaching data!</p>
            <p className="text-sm mt-1">Click "Coach drivers" to analyze delivery performance and generate coaching plans.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTruckFast} />Drivers</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.driverCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold">Critical</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTrophy} />Top performers</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.topPerformerCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600">Avg score</div>
                <div className={`text-2xl font-bold tabular-nums ${scoreColor(summary.avgScore)}`}>{summary.avgScore.toFixed(0)}/100</div>
              </div>
            </div>

            <div className="space-y-3">
              {sortedCoachings.map((c, idx) => {
                const style = RULE_STYLE[c.rule_id] ?? RULE_STYLE.speed_coaching;
                const actions = parseActions(c.coaching_actions);
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
                    <div className="p-3 border-b border-neutral-100 bg-neutral-50">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[c.severity] ?? SEVERITY_DOT.low}`}></span>
                          <span className="font-medium">{c.driver_name}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                            <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                          </span>
                          {c.top_strength && <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 capitalize">Strength: {c.top_strength.replace(/_/g, ' ')}</span>}
                          {c.improvement_area && <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 capitalize">Improve: {c.improvement_area.replace(/_/g, ' ')}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-neutral-500">{c.total_deliveries} deliveries</span>
                          <span className="text-neutral-500">Score: <strong className={scoreColor(c.overall_score)}>{c.overall_score}/100</strong></span>
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{c.description}</p>
                    </div>

                    <div className="p-3">
                      {/* Metrics grid */}
                      <div className="grid grid-cols-5 gap-3 mb-3 text-center">
                        <div>
                          <div className="text-xs text-neutral-500">Avg time</div>
                          <div className={`font-bold tabular-nums ${c.avg_delivery_time > 40 ? 'text-rose-600' : 'text-emerald-600'}`}>{c.avg_delivery_time}min</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">On-time</div>
                          <div className={`font-bold tabular-nums ${(c.on_time_rate * 100) >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{(c.on_time_rate * 100).toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Rating</div>
                          <div className={`font-bold tabular-nums ${c.avg_rating >= 4.5 ? 'text-emerald-600' : c.avg_rating >= 4 ? 'text-yellow-600' : 'text-rose-600'}`}>{c.avg_rating}★</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Complaints</div>
                          <div className={`font-bold tabular-nums ${c.complaint_rate > 0.10 ? 'text-rose-600' : 'text-emerald-600'}`}>{(c.complaint_rate * 100).toFixed(0)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">km/delivery</div>
                          <div className={`font-bold tabular-nums ${c.fuel_efficiency > 8 ? 'text-rose-600' : 'text-emerald-600'}`}>{c.fuel_efficiency}</div>
                        </div>
                      </div>

                      {/* Overall score bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-neutral-500">Overall performance score</span>
                          <span className={`font-bold ${scoreColor(c.overall_score)}`}>{c.overall_score}/100</span>
                        </div>
                        <div className="h-2 bg-neutral-100 rounded">
                          <div className={`h-2 rounded ${scoreBarColor(c.overall_score)}`} style={{ width: `${c.overall_score}%` }}></div>
                        </div>
                      </div>

                      {/* Coaching actions */}
                      {actions.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-neutral-500 mb-1"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />Coaching plan:</div>
                          <ul className="text-xs space-y-0.5 list-disc list-inside">
                            {actions.map((a, i) => <li key={i} className="text-neutral-700">{a}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* AI insight */}
                      {c.ai_insight && (
                        <div className="mb-3 p-2 rounded bg-violet-50/70 border border-violet-200">
                          <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{c.ai_insight}</p>
                        </div>
                      )}

                      {/* Revenue impact */}
                      {c.est_revenue_impact > 0 && (
                        <div className="mb-3 p-2 rounded bg-rose-50 border border-rose-100">
                          <p className="text-xs text-rose-700"><strong>Est. revenue impact:</strong> {withCurrency(c.est_revenue_impact)} (if performance improves to avg)</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => c.id && handleStatus(c.id, 'coaching_applied')} className="text-xs px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" />Coaching applied
                        </button>
                        <button onClick={() => c.id && handleStatus(c.id, 'reviewed')} className="text-xs px-3 py-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium">
                          Reviewed
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Min deliveries: <strong>{config.minDeliveries}</strong></span>
              <span>Target time: <strong>{config.targetTimeMin}min</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default DriverCoachScreen;
