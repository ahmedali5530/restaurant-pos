/**
 * Seating Optimization Dashboard — real-time table assignment recommendations.
 *
 * 24th POSR-exclusive differentiator — Toast Table Management shows status
 * but doesn't OPTIMIZE assignments. POSR recommends optimal table per party.
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
  faChair, faRobot, faRotate, faLightbulb,
  faCheckCircle, faXmark, faUsers, faClock,
  faUtensils, faHourglassHalf, faWineGlass,
} from "@fortawesome/free-solid-svg-icons";
import {
  runSeatingOptimization,
  getActiveSuggestions,
  getSeatingSummary,
  updateSeatingAction,
  readSeatingConfig,
  DEFAULT_SEATING_CONFIG,
  type SeatingSuggestion,
  type SeatingRecommendation,
} from "@/lib/seating-optimization.service.ts";

const REC_STYLE: Record<SeatingRecommendation, { bg: string; text: string; icon: any; label: string }> = {
  seat_here:       { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: faCheckCircle,    label: 'Seat here' },
  wait_for_better: { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: faHourglassHalf, label: 'Wait for better' },
  split_party:    { bg: 'bg-violet-100',   text: 'text-violet-700',  icon: faUsers,          label: 'Split party' },
  bar_seating:    { bg: 'bg-blue-100',     text: 'text-blue-700',     icon: faWineGlass,     label: 'Bar seating' },
};

export function SeatingOptimizationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [suggestions, setSuggestions] = useState<SeatingSuggestion[]>([]);
  const [summary, setSummary] = useState({
    total: 0, seatHere: 0, waitForBetter: 0, splitParty: 0, barSeating: 0, avgScore: 0,
  });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_SEATING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSeatingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([
        getActiveSuggestions(db),
        getSeatingSummary(db),
      ]);
      setSuggestions(list);
      setSummary(sum);
    } catch (err) {
      console.error('[seating-report] reload failed', err);
      toast.error('Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 2 });
    try {
      const result = await runSeatingOptimization(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(
        result.suggestions.length > 0
          ? `Optimized seating for ${result.scanned} parties — ${result.suggestions.length} table suggestions`
          : `No incoming parties to optimize seating for`
      );
      await reload();
    } catch (err) {
      console.error('[seating-report] analyze failed', err);
      toast.error('Optimization failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleAction = useCallback(async (sugId: string, action: string) => {
    try {
      await updateSeatingAction(db, sugId, action);
      toast.success(`Marked: ${action.replace(/_/g, ' ')}`);
      await reload();
    } catch (err) { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Seating Optimization", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChair} className="text-amber-600" />
              Seating Optimization
            </h1>
            <p className="text-sm text-neutral-500">
              AI real-time table assignment — capacity + turnover + reservations + floor balance (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Optimizing… (${progress.current}/${progress.total})` : 'Optimize seating'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading suggestions…</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No seating needed!</p>
            <p className="text-sm mt-1">No incoming parties waiting. Click "Optimize seating" to recheck.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faCheckCircle} />Seat here</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.seatHere}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faHourglassHalf} />Wait</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.waitForBetter}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faUsers} />Split</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.splitParty}</div>
              </div>
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faWineGlass} />Bar</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.barSeating}</div>
              </div>
              <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-3 text-center">
                <div className="text-xs text-neutral-600">Total suggestions</div>
                <div className="text-2xl font-bold text-neutral-700 tabular-nums">{summary.total}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600">Avg score</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{Math.round(summary.avgScore * 100)}</div>
              </div>
            </div>

            {/* Suggestion list */}
            <div className="space-y-3">
              {suggestions.map((sug, idx) => {
                const rec = sug.ai_recommendation ?? 'seat_here';
                const recStyle = REC_STYLE[rec] ?? REC_STYLE.seat_here;
                return (
                  <div key={idx} className="rounded-lg border-2 p-4 bg-white border-neutral-200">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faChair} className="text-xl text-amber-600" />
                        <span className="font-semibold">{sug.customer_name}</span>
                        <span className="text-sm text-neutral-500">
                          · <FontAwesomeIcon icon={faUsers} className="mr-1" />Party of {sug.party_size}
                        </span>
                        <span className="text-sm text-neutral-400 capitalize">· {sug.party_source}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Overall score</div>
                        <div className={`text-2xl font-bold tabular-nums ${sug.overall_score >= 0.7 ? 'text-emerald-600' : sug.overall_score >= 0.5 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {Math.round(sug.overall_score * 100)}/100
                        </div>
                      </div>
                    </div>

                    {/* Recommended table */}
                    <div className="bg-amber-50 rounded p-3 mb-2 border border-amber-200">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs text-neutral-500 flex items-center gap-1"><FontAwesomeIcon icon={faUtensils} />Suggested table</div>
                          <span className="font-semibold text-amber-700">{sug.table_name}</span>
                          <span className="text-sm text-neutral-500 ml-2">(capacity: {sug.table_capacity})</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${recStyle.bg} ${recStyle.text}`}>
                          <FontAwesomeIcon icon={recStyle.icon} className="mr-1" />{recStyle.label}
                        </span>
                      </div>
                    </div>

                    {/* Score breakdown */}
                    <div className="grid grid-cols-4 gap-2 mb-2 bg-neutral-50 rounded p-3 text-sm">
                      <div>
                        <div className="text-xs text-neutral-500">Capacity match</div>
                        <div className={`font-bold tabular-nums ${sug.capacity_match_score >= 0.8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {Math.round(sug.capacity_match_score * 100)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1"><FontAwesomeIcon icon={faClock} />Turnover</div>
                        <div className={`font-bold tabular-nums ${sug.turnover_score >= 0.7 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {Math.round(sug.turnover_score * 100)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Reservation conflict</div>
                        <div className={`font-bold tabular-nums ${sug.reservation_conflict_score >= 0.8 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {Math.round(sug.reservation_conflict_score * 100)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-500">Floor balance</div>
                        <div className={`font-bold tabular-nums ${sug.floor_balance_score >= 0.7 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {Math.round(sug.floor_balance_score * 100)}%
                        </div>
                      </div>
                    </div>

                    {/* AI insight */}
                    {sug.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic">
                          <FontAwesomeIcon icon={faLightbulb} className="mr-1" />{sug.ai_insight}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1 ml-auto">
                      <button onClick={() => sug.id && handleAction(sug.id, 'seated')}
                        className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                        <FontAwesomeIcon icon={faCheckCircle} /> Seated
                      </button>
                      <button onClick={() => sug.id && handleAction(sug.id, 'waited')}
                        className="px-2 py-1 rounded text-xs bg-amber-100 text-amber-700 hover:bg-amber-200">
                        <FontAwesomeIcon icon={faHourglassHalf} /> Waited
                      </button>
                      <button onClick={() => sug.id && handleAction(sug.id, 'split')}
                        className="px-2 py-1 rounded text-xs bg-violet-100 text-violet-700 hover:bg-violet-200">
                        <FontAwesomeIcon icon={faUsers} /> Split
                      </button>
                      <button onClick={() => sug.id && handleAction(sug.id, 'bar')}
                        className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                        <FontAwesomeIcon icon={faWineGlass} /> Bar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Reservation window: <strong>{config.reservationWindowMin} min</strong></span>
              <span>Capacity tolerance: <strong>±{(config.capacityTolerance * 100).toFixed(0)}%</strong></span>
              <span>Min score: <strong>{config.minScore.toFixed(2)}</strong></span>
              <span>Max suggestions: <strong>{config.maxSuggestions}</strong> per party</span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default SeatingOptimizationScreen;
