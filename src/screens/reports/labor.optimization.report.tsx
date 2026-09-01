/**
 * Labor Cost Optimization Dashboard — labor cost vs revenue + AI recs.
 *
 * Research finding: Toast Labor Cost Management $35+/mo (higher tier),
 * Square Labor Cost Reporting in Plus. POSR offers it free.
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
  faUsers, faDollarSign, faPercent, faClock, faRobot, faRotate,
  faLightbulb, faTriangleExclamation, faCheckCircle, faGaugeHigh,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeLaborCosts,
  getLatestLaborAnalysis,
  readLaborConfig,
  DEFAULT_LABOR_CONFIG,
  type LaborCostAnalysis,
  type LaborHealthStatus,
} from "@/lib/labor-optimization.service.ts";

const HEALTH_STYLE: Record<LaborHealthStatus, { bg: string; text: string; border: string; label: string; icon: any }> = {
  healthy:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Healthy',  icon: faCheckCircle },
  watch:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-400',    label: 'Watch',    icon: faGaugeHigh },
  warning:  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-400',   label: 'Warning',  icon: faTriangleExclamation },
  critical: { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-500',     label: 'Critical', icon: faTriangleExclamation },
};

export function LaborOptimizationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [analysis, setAnalysis] = useState<LaborCostAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_LABOR_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readLaborConfig(settingsRows[0] ?? {}));
      const a = await getLatestLaborAnalysis(db);
      setAnalysis(a);
    } catch (err) {
      console.error('[labor-report] reload failed', err);
      toast.error('Failed to load labor data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await analyzeLaborCosts(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setAnalysis(result);
      toast.success(
        result
          ? `Labor cost ${result.labor_cost_pct}% of revenue — ${result.health_status}. ${result.total_hours} hours, ${result.employee_count} employees.`
          : 'No labor data found — ensure time entries are recorded.'
      );
    } catch (err) {
      console.error('[labor-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  return (
    <Layout>
      <DocumentTitle parts={["Labor Optimization", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUsers} className="text-blue-600" />
              Labor Cost Optimization
            </h1>
            <p className="text-sm text-neutral-500">
              Labor cost % vs revenue + overtime analysis + efficiency metrics + AI recommendations
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze labor'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading labor data…</p>
          </div>
        ) : !analysis ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUsers} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No labor analysis yet</p>
            <p className="text-sm mt-1">Click "Analyze labor" to compute labor cost metrics.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <SummaryCard icon={faPercent} label="Labor cost %" value={`${analysis.labor_cost_pct}%`} color={analysis.labor_cost_pct > config.criticalPct ? 'text-rose-600' : analysis.labor_cost_pct > config.targetPct ? 'text-amber-600' : 'text-emerald-600'} />
              <SummaryCard icon={faDollarSign} label="Labor cost" value={withCurrency(analysis.total_labor_cost)} color="text-blue-600" />
              <SummaryCard icon={faClock} label="Total hours" value={analysis.total_hours} color="text-violet-600" />
              <SummaryCard icon={faClock} label="Overtime" value={`${analysis.overtime_hours}h (${analysis.overtime_pct}%)`} color={analysis.overtime_pct > 15 ? 'text-rose-600' : 'text-amber-600'} />
              <SummaryCard icon={faGaugeHigh} label="Efficiency" value={`${analysis.labor_efficiency}x`} color={analysis.labor_efficiency >= 3 ? 'text-emerald-600' : 'text-amber-600'} />
            </div>

            {/* Health banner */}
            {(() => {
              const style = HEALTH_STYLE[analysis.health_status];
              return (
                <div className={`rounded-lg border-2 p-4 ${style.bg} ${style.border}`}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <FontAwesomeIcon icon={style.icon} className={`text-3xl ${style.text}`} />
                      <div>
                        <div className={`text-xl font-bold ${style.text}`}>{style.label}</div>
                        <div className="text-xs text-neutral-600">
                          Labor cost is {analysis.labor_cost_pct}% of revenue · {analysis.employee_count} employees · {analysis.total_hours}h total · ${analysis.revenue_per_labor_hour}/labor-hour
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">Revenue</div>
                      <div className="text-2xl font-bold text-emerald-600 tabular-nums">{withCurrency(analysis.total_revenue)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* AI insights + recommendations */}
            {analysis.ai_insight && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Labor Cost Assessment
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
                {analysis.projected_savings !== undefined && analysis.projected_savings > 0 && (
                  <div className="mt-3 text-sm text-emerald-600 font-semibold">
                    Projected monthly savings: {withCurrency(analysis.projected_savings)}
                  </div>
                )}
              </div>
            )}

            {/* Daily breakdown chart */}
            {analysis.daily_breakdown && analysis.daily_breakdown.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Daily labor cost % trend</h3>
                <div className="relative h-32 flex items-end gap-px">
                  {analysis.daily_breakdown.map((day, idx) => {
                    const maxPct = Math.max(...analysis.daily_breakdown!.map(d => d.labor_pct), 50);
                    const heightPct = (day.labor_pct / maxPct) * 100;
                    return (
                      <div key={idx} className="flex-1 relative group" style={{ height: '100%' }}
                        title={`${day.date}: ${day.labor_pct}% labor, ${withCurrency(day.labor_cost)}, ${day.employees} staff`}>
                        <div className={`absolute bottom-0 left-0 right-0 rounded-t transition-colors ${
                          day.labor_pct > config.criticalPct ? 'bg-rose-400' :
                          day.labor_pct > config.targetPct ? 'bg-amber-400' : 'bg-emerald-400'
                        }`} style={{ height: `${Math.max(3, heightPct)}%` }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-neutral-400 mt-2">
                  <span>{analysis.daily_breakdown[0]?.date}</span>
                  <span>Target: {config.targetPct}% · Critical: {config.criticalPct}%</span>
                  <span>{analysis.daily_breakdown[analysis.daily_breakdown.length - 1]?.date}</span>
                </div>
              </div>
            )}

            {/* Top cost employees */}
            {analysis.top_cost_employees && analysis.top_cost_employees.length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium mb-3">Top cost employees</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="text-left p-2">Employee</th>
                        <th className="text-right p-2">Hours</th>
                        <th className="text-right p-2">Cost</th>
                        <th className="text-right p-2">Overtime hours</th>
                        <th className="text-right p-2">Avg rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.top_cost_employees.map((emp, idx) => (
                        <tr key={idx} className="border-t hover:bg-neutral-50">
                          <td className="p-2 font-medium">{emp.name}</td>
                          <td className="p-2 text-right tabular-nums">{emp.hours}</td>
                          <td className="p-2 text-right tabular-nums font-semibold">{withCurrency(emp.cost)}</td>
                          <td className="p-2 text-right tabular-nums">
                            <span className={emp.overtime_hours > 0 ? 'text-amber-600' : 'text-neutral-400'}>
                              {emp.overtime_hours > 0 ? `${emp.overtime_hours}h` : '—'}
                            </span>
                          </td>
                          <td className="p-2 text-right tabular-nums text-neutral-500">
                            {emp.hours > 0 ? withCurrency(emp.cost / emp.hours) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Target labor %: <strong>{config.targetPct}%</strong></span>
              <span>Critical threshold: <strong>{config.criticalPct}%</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Regular hours: <strong>{analysis.regular_hours}</strong></span>
              <span>Avg hourly cost: <strong>{withCurrency(analysis.avg_hourly_cost)}</strong></span>
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

export default LaborOptimizationScreen;
