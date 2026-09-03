/**
 * Peak Hour Prediction Dashboard — hourly predictions + staffing + AI insights.
 *
 * Research finding: Toast Peak Hour Analytics $25+/mo (higher tier), Square
 * Hourly Trends in Plus. POSR offers it free.
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
  faClock, faArrowTrendUp, faArrowTrendDown, faRobot, faRotate,
  faLightbulb, faUsers, faUtensils,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  generatePeakHourPredictions,
  getPeakHourPredictions,
  readPeakConfig,
  DEFAULT_PEAK_CONFIG,
  DAY_NAMES,
  type PeakHourPrediction,
} from "@/lib/peak-hour.service.ts";

export function PeakHourScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [predictions, setPredictions] = useState<PeakHourPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_PEAK_CONFIG);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPeakConfig(settingsRows[0] ?? {}));
      const list = await getPeakHourPredictions(db);
      setPredictions(list);
      if (list.length > 0 && selectedDay === null) setSelectedDay(list[0].day_of_week);
    } catch (err) {
      console.error('[peak-report] reload failed', err);
      toast.error('Failed to load peak hour data');
    } finally {
      setLoading(false);
    }
  }, [db, selectedDay]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await generatePeakHourPredictions(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setPredictions(result.predictions);
      toast.success(`Generated predictions for ${result.predictions.length} days`);
    } catch (err) {
      console.error('[peak-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const selectedPrediction = useMemo(() => {
    if (selectedDay === null) return predictions[0] ?? null;
    return predictions.find(p => p.day_of_week === selectedDay) ?? null;
  }, [predictions, selectedDay]);

  return (
    <Layout>
      <DocumentTitle parts={["Peak Hour Prediction", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faClock} className="text-amber-600" />
              Peak Hour Prediction
            </h1>
            <p className="text-sm text-neutral-500">
              Hourly order predictions per day of week + staffing + prep schedule + AI insights
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Generate predictions'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading peak hour data…</p>
          </div>
        ) : predictions.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faClock} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No peak hour predictions yet</p>
            <p className="text-sm mt-1">Click "Generate predictions" to analyze hourly patterns.</p>
          </div>
        ) : (
          <>
            {/* Day selector */}
            <div className="flex gap-2 flex-wrap">
              {predictions.map(p => (
                <button key={p.day_of_week} onClick={() => setSelectedDay(p.day_of_week)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedDay === p.day_of_week ? 'bg-amber-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}>
                  {DAY_NAMES[p.day_of_week].slice(0, 3)}
                  <span className="ml-1 text-xs opacity-75">{p.predicted_peak_hour}:00 peak</span>
                </button>
              ))}
            </div>

            {selectedPrediction && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SummaryCard icon={faArrowTrendUp} label="Peak hour" value={`${String(selectedPrediction.predicted_peak_hour).padStart(2, '0')}:00`} color="text-amber-600" />
                  <SummaryCard icon={faArrowTrendUp} label="Peak orders" value={selectedPrediction.predicted_peak_orders} color="text-rose-600" />
                  <SummaryCard icon={faArrowTrendUp} label="Peak revenue" value={withCurrency(selectedPrediction.predicted_peak_revenue)} color="text-emerald-600" />
                  <SummaryCard icon={faArrowTrendDown} label="Quietest hour" value={`${String(selectedPrediction.quietest_hour).padStart(2, '0')}:00`} color="text-blue-600" />
                </div>

                {/* AI insight */}
                {selectedPrediction.ai_insight && (
                  <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                    <p className="text-sm text-violet-900">💡 {selectedPrediction.ai_insight}</p>
                  </div>
                )}

                {/* Hourly chart */}
                <div className="bg-white rounded-lg border border-neutral-200 p-4">
                  <h3 className="font-medium mb-3">Hourly breakdown — {DAY_NAMES[selectedPrediction.day_of_week]}</h3>
                  <div className="relative h-48 flex items-end gap-1">
                    {selectedPrediction.hourly_breakdown?.map((h, idx) => {
                      const maxOrders = Math.max(...(selectedPrediction.hourly_breakdown?.map(x => x.predicted_orders) ?? [1]));
                      const heightPct = maxOrders > 0 ? (h.predicted_orders / maxOrders) * 100 : 0;
                      const isPeak = h.hour === selectedPrediction.predicted_peak_hour;
                      const isSecond = h.hour === selectedPrediction.second_peak_hour;
                      return (
                        <div key={idx} className="flex-1 relative group" style={{ height: '100%' }}
                          title={`${String(h.hour).padStart(2, '0')}:00 — ${h.predicted_orders} orders, ${withCurrency(h.predicted_revenue)}, ${h.staffing_needed} staff`}>
                          <div className={`absolute bottom-0 left-0 right-0 rounded-t transition-colors ${
                            isPeak ? 'bg-amber-500' : isSecond ? 'bg-orange-400' : 'bg-blue-300'
                          }`} style={{ height: `${Math.max(3, heightPct)}%` }} />
                          {isPeak && (
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold text-amber-600">PEAK</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-neutral-400 mt-2">
                    <span>8:00</span>
                    <span>14:00</span>
                    <span>22:00</span>
                  </div>
                </div>

                {/* Staffing table */}
                {selectedPrediction.recommended_staffing && (
                  <div className="bg-white rounded-lg border border-neutral-200 p-4">
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faUsers} className="text-blue-600" />
                      Recommended staffing
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50">
                          <tr>
                            <th className="text-left p-2">Hour</th>
                            <th className="text-right p-2">Predicted orders</th>
                            <th className="text-right p-2">Revenue</th>
                            <th className="text-right p-2">Staff needed</th>
                            <th className="text-center p-2">Level</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPrediction.recommended_staffing.map((s, idx) => {
                            const hourData = selectedPrediction.hourly_breakdown?.[idx];
                            return (
                              <tr key={idx} className="border-t hover:bg-neutral-50">
                                <td className="p-2 font-medium">{String(s.hour).padStart(2, '0')}:00</td>
                                <td className="p-2 text-right tabular-nums">{hourData?.predicted_orders ?? '—'}</td>
                                <td className="p-2 text-right tabular-nums">{hourData ? withCurrency(hourData.predicted_revenue) : '—'}</td>
                                <td className="p-2 text-right tabular-nums font-semibold">{s.staff_count}</td>
                                <td className="p-2 text-center">
                                  <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                                    s.role === 'full_team' ? 'bg-rose-100 text-rose-700' :
                                    s.role === 'standard' ? 'bg-amber-100 text-amber-700' :
                                    'bg-blue-100 text-blue-700'
                                  }`}>{s.role.replace(/_/g, ' ')}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Prep schedule */}
                {selectedPrediction.prep_schedule && selectedPrediction.prep_schedule.length > 0 && (
                  <div className="bg-white rounded-lg border border-neutral-200 p-4">
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faUtensils} className="text-violet-600" />
                      Prep schedule
                    </h3>
                    {selectedPrediction.prep_schedule.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-sm bg-neutral-50 rounded p-2 mb-2">
                        <span className="font-semibold">{String(p.prep_start_hour).padStart(2, '0')}:00</span>
                        <span>→</span>
                        <span className="font-semibold">{String(p.target_completion_hour).padStart(2, '0')}:00</span>
                        <span className="text-neutral-600">{p.items_to_prep}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Config footer */}
                <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
                  <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
                  <span>Orders/staff/hour: <strong>{config.ordersPerStaff}</strong></span>
                  <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon, label, value, color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default PeakHourScreen;
