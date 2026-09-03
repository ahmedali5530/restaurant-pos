/**
 * AI Music/Vibe Optimizer — recommend music genre/tempo/volume per hour.
 *
 * 49th POSR-exclusive differentiator — music tempo + volume + genre affect
 * dining behavior (Cornell, Heriot-Watt research).
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
  faMusic, faRotate, faLightbulb, faCheckCircle,
  faGaugeHigh, faHourglassHalf, faGlassWater, faCloudSun, faUtensils,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runVibeEngine, getActiveRecommendations, getSummary, updateRecommendationStatus,
  readVibeConfig, DEFAULT_VIBE_CONFIG,
  type VibeRecommendation,
} from "@/lib/vibe-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  peak_turnover_boost:  { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faGaugeHigh,    label: 'PEAK TURNOVER' },
  quiet_extended_stay:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faHourglassHalf, label: 'QUIET EXTENDED' },
  happy_hour_uplift:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGlassWater,    label: 'HAPPY HOUR' },
  weather_match:        { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faCloudSun,      label: 'WEATHER MATCH' },
  cuisine_match:        { bg: 'bg-blue-50',    text: 'text-blue-700',   icon: faUtensils,      label: 'CUISINE MATCH' },
};

const VOLUME_STYLE: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-rose-100 text-rose-700',
};

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// BPM to tempo label
const bpmLabel = (bpm: number): string => {
  if (bpm < 70) return 'Very slow';
  if (bpm < 90) return 'Slow';
  if (bpm < 110) return 'Moderate';
  if (bpm < 125) return 'Upbeat';
  return 'Fast';
};

export function VibeOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [recommendations, setRecommendations] = useState<VibeRecommendation[]>([]);
  const [summary, setSummary] = useState({ peakBoostCount: 0, quietStayCount: 0, happyHourCount: 0, totalRevenueImpact: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_VIBE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readVibeConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveRecommendations(db), getSummary(db)]);
      setRecommendations(list); setSummary(sum);
    } catch (err) { console.error('[vibe-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runVibeEngine(db, config);
      toast.success(result.recommendations.length > 0
        ? `Generated ${result.recommendations.length} vibe recommendations — ${result.recommendations.filter(r => r.rule_id === 'peak_turnover_boost').length} peak boost, ${result.recommendations.filter(r => r.rule_id === 'quiet_extended_stay').length} extended stay`
        : `No recommendations — need order history per slot`);
      await reload();
    } catch (err) { console.error('[vibe-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (recId: string, status: 'applied' | 'declined') => {
    try { await updateRecommendationStatus(db, recId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort by day_of_week then hour
  const sortedRecs = [...recommendations].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return a.hour - b.hour;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Vibe Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faMusic} className="text-violet-600" />
              AI Vibe Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Recommends music genre/tempo/volume per hour to maximize revenue (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Analyzing…' : 'Generate playlist'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : recommendations.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faMusic} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No vibe recommendations yet!</p>
            <p className="text-sm mt-1">Click "Generate playlist" to compute optimal music per slot.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faGaugeHigh} />Peak boost</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.peakBoostCount}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faHourglassHalf} />Extended stay</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.quietStayCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faGlassWater} />Happy hour</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.happyHourCount}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center ring-2 ring-violet-200">
                <div className="text-xs text-violet-700 font-semibold">Revenue impact</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{withCurrency(summary.totalRevenueImpact)}</div>
              </div>
            </div>

            {/* Recommendations timeline */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faMusic} className="text-violet-600" />
                  Daily Vibe Timeline (sorted by slot)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Slot</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Occupancy</th>
                      <th className="p-3 text-right">Avg party</th>
                      <th className="p-3 text-left">Genre</th>
                      <th className="p-3 text-center">BPM</th>
                      <th className="p-3 text-center">Volume</th>
                      <th className="p-3 text-right">Duration Δ</th>
                      <th className="p-3 text-right">Revenue impact</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecs.map((r, idx) => {
                      const style = RULE_STYLE[r.rule_id] ?? RULE_STYLE.cuisine_match;
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="p-3">
                            <div className="font-semibold">{DOW_NAMES[r.day_of_week] ?? '?'} {r.hour}:00</div>
                            <p className="text-xs text-neutral-500 mt-0.5">{r.description}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="tabular-nums font-semibold">{r.current_occupancy_pct.toFixed(0)}%</span>
                              <div className="w-12 h-1.5 bg-neutral-100 rounded">
                                <div className={`h-1.5 rounded ${r.current_occupancy_pct > 80 ? 'bg-rose-500' : r.current_occupancy_pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${r.current_occupancy_pct}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-right tabular-nums">{r.avg_party_size.toFixed(1)}</td>
                          <td className="p-3">
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-violet-100 text-violet-700 capitalize">{r.recommended_genre ?? '—'}</span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-bold tabular-nums text-violet-700">{r.recommended_bpm ?? '—'}</span>
                              <span className="text-xs text-neutral-500">{r.recommended_bpm ? bpmLabel(r.recommended_bpm) : ''}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-semibold px-2 py-1 rounded capitalize ${VOLUME_STYLE[r.recommended_volume ?? 'medium'] ?? VOLUME_STYLE.medium}`}>
                              {r.recommended_volume ?? '—'}
                            </span>
                          </td>
                          <td className={`p-3 text-right tabular-nums font-semibold ${r.est_duration_change_pct > 0 ? 'text-emerald-600' : r.est_duration_change_pct < 0 ? 'text-rose-600' : 'text-neutral-500'}`}>
                            {r.est_duration_change_pct > 0 ? '+' : ''}{r.est_duration_change_pct}%
                          </td>
                          <td className="p-3 text-right tabular-nums font-bold text-emerald-600">{withCurrency(r.est_revenue_impact)}</td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => r.id && handleStatus(r.id, 'applied')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap">
                                <FontAwesomeIcon icon={faCheckCircle} /> Play
                              </button>
                              <button onClick={() => r.id && handleStatus(r.id, 'declined')} className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                                Skip
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI insights */}
            {recommendations.filter(r => r.ai_insight).slice(0, 5).map((r, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{DOW_NAMES[r.day_of_week]} {r.hour}:00</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[r.rule_id].bg} ${RULE_STYLE[r.rule_id].text}`}>{r.rule_id.replace(/_/g, ' ')}</span>
                  {r.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{r.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{r.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays}d</strong></span>
              <span>Peak threshold: <strong>{(config.peakOccupancyThreshold * 100).toFixed(0)}%</strong></span>
              <span>Quiet threshold: <strong>{(config.quietOccupancyThreshold * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default VibeOptimizerScreen;
