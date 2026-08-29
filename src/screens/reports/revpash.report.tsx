/**
 * RevPASH Dashboard — Revenue Per Available Seat Hour analysis.
 *
 * Unique to POSR — Toast and Square don't have this hotel-industry metric.
 * RevPASH = revenue / (seats × operating_hours) — the single most important
 * metric for restaurant capacity monetization.
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
  faGaugeHigh, faDollarSign, faChair, faPercent, faRobot, faRotate,
  faLightbulb, faChartBar, faCalendarDay,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeRevPASH,
  getLatestRevPASH,
  readRevPASHConfig,
  DEFAULT_REVPASH_CONFIG,
  type RevPASHAnalysis,
  type RevPASHGrade,
} from "@/lib/revpash.service.ts";

const GRADE_STYLE: Record<RevPASHGrade, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Excellent (>$20/hr)' },
  B: { bg: 'bg-blue-100',    text: 'text-blue-700',   label: 'Good ($10-20/hr)' },
  C: { bg: 'bg-amber-100',   text: 'text-amber-700',  label: 'Average ($5-10/hr)' },
  D: { bg: 'bg-orange-100',  text: 'text-orange-700', label: 'Poor ($2-5/hr)' },
  F: { bg: 'bg-rose-100',    text: 'text-rose-700',   label: 'Critical (<$2/hr)' },
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RevPASHScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [analysis, setAnalysis] = useState<RevPASHAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_REVPASH_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readRevPASHConfig(settingsRows[0] ?? {}));
      const a = await getLatestRevPASH(db);
      setAnalysis(a);
    } catch (err) {
      console.error('[revpash-report] reload failed', err);
      toast.error('Failed to load RevPASH data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await analyzeRevPASH(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setAnalysis(result);
      toast.success(
        result
          ? `RevPASH: $${result.revpash}/seat/hr (Grade ${result.benchmark_grade}) — ${result.total_orders} orders, ${result.total_seats} seats`
          : 'No data found — ensure tables with capacity are configured.'
      );
    } catch (err) {
      console.error('[revpash-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  return (
    <Layout>
      <DocumentTitle parts={["RevPASH", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faGaugeHigh} className="text-violet-600" />
              RevPASH Analysis
            </h1>
            <p className="text-sm text-neutral-500">
              Revenue Per Available Seat Hour — the #1 capacity monetization metric + AI recommendations
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze RevPASH'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading RevPASH data…</p>
          </div>
        ) : !analysis ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faGaugeHigh} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No RevPASH data yet</p>
            <p className="text-sm mt-1">Click "Analyze RevPASH" to compute capacity efficiency metrics.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faDollarSign} label="RevPASH" value={`$${analysis.revpash}/hr`} color={analysis.revpash > 10 ? 'text-emerald-600' : analysis.revpash > 5 ? 'text-amber-600' : 'text-rose-600'} />
              <SummaryCard icon={faChair} label="Total seats" value={analysis.total_seats} color="text-blue-600" />
              <SummaryCard icon={faPercent} label="Seat utilization" value={`${(analysis.avg_seat_utilization * 100).toFixed(0)}%`} color={analysis.avg_seat_utilization >= 0.6 ? 'text-emerald-600' : 'text-amber-600'} />
              <SummaryCard icon={faDollarSign} label="Rev/occupied seat" value={`$${analysis.revenue_per_occupied_seat}`} color="text-violet-600" />
            </div>

            {/* Grade banner */}
            {(() => {
              const style = GRADE_STYLE[analysis.benchmark_grade as RevPASHGrade] ?? GRADE_STYLE.C;
              return (
                <div className={`rounded-lg border-2 p-4 ${style.bg} border-current`}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`text-4xl font-bold ${style.text}`}>{analysis.benchmark_grade}</div>
                      <div>
                        <div className={`text-lg font-bold ${style.text}`}>{style.label}</div>
                        <div className="text-xs text-neutral-600">
                          {analysis.total_orders} orders · {analysis.total_seats} seats · {analysis.total_operating_hours} operating hours · avg {withCurrency(analysis.avg_order_value)}/order
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">Total revenue</div>
                      <div className="text-2xl font-bold text-emerald-600 tabular-nums">{withCurrency(analysis.total_revenue)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* AI insights */}
            {analysis.ai_insight && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI RevPASH Assessment
                </h3>
                <p className="text-sm text-violet-900 whitespace-pre-wrap mb-3">{analysis.ai_insight}</p>
                {analysis.ai_recommendations.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-violet-700 uppercase mb-1">Recommendations</div>
                    {analysis.ai_recommendations.map((rec, idx) => (
                      <div key={idx} className="text-sm text-violet-900 flex items-start gap-2 mb-1">
                        <span className="text-violet-500 mt-0.5">→</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
                {analysis.projected_revenue_uplift !== undefined && analysis.projected_revenue_uplift > 0 && (
                  <div className="mt-3 text-sm text-emerald-600 font-semibold">
                    Projected monthly revenue uplift: +{withCurrency(analysis.projected_revenue_uplift)}
                  </div>
                )}
              </div>
            )}

            {/* Hourly RevPASH chart */}
            {analysis.hourly_breakdown && analysis.hourly_breakdown.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faChartBar} className="text-violet-600" />
                  Hourly RevPASH breakdown
                </h3>
                <div className="relative h-40 flex items-end gap-1">
                  {analysis.hourly_breakdown.map((h, idx) => {
                    const maxRevPASH = Math.max(...analysis.hourly_breakdown!.map(x => x.revpash), 1);
                    const heightPct = (h.revpash / maxRevPASH) * 100;
                    return (
                      <div key={idx} className="flex-1 relative group" style={{ height: '100%' }}
                        title={`${String(h.hour).padStart(2, '0')}:00 — $${h.revpash}/seat/hr, ${(h.utilization * 100).toFixed(0)}% utilization, ${withCurrency(h.revenue)}`}>
                        <div className={`absolute bottom-0 left-0 right-0 rounded-t transition-colors ${
                          h.revpash > 20 ? 'bg-emerald-500' :
                          h.revpash > 10 ? 'bg-blue-400' :
                          h.revpash > 5 ? 'bg-amber-400' : 'bg-rose-400'
                        }`} style={{ height: `${Math.max(3, heightPct)}%` }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-neutral-400 mt-2">
                  <span>8:00</span>
                  <span>Benchmark: A(&gt;$20) B($10-20) C($5-10) D($2-5) F(&lt;$2)</span>
                  <span>22:00</span>
                </div>
              </div>
            )}

            {/* Daily RevPASH */}
            {analysis.daily_breakdown && analysis.daily_breakdown.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faCalendarDay} className="text-blue-600" />
                  Daily RevPASH comparison
                </h3>
                <div className="grid grid-cols-7 gap-2">
                  {analysis.daily_breakdown.map((d, idx) => (
                    <div key={idx} className="bg-neutral-50 rounded p-2 text-center">
                      <div className="text-xs font-medium text-neutral-600">{DAY_NAMES[d.day_of_week]}</div>
                      <div className="text-lg font-bold tabular-nums ${d.revpash > 10 ? 'text-emerald-600' : 'text-amber-600'}">
                        ${d.revpash}
                      </div>
                      <div className="text-xs text-neutral-500">{(d.utilization * 100).toFixed(0)}% util</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Open hours/day: <strong>{config.openHoursPerDay}h</strong></span>
              <span>Target RevPASH: <strong>${config.targetRevPASH}/hr</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
            </div>
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

export default RevPASHScreen;
