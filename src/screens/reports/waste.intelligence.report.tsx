/**
 * Waste Intelligence Dashboard — AI-powered waste pattern detection + insights.
 *
 * Research finding: Toast Waste Management $40+/mo, Lightspeed Waste Tracking
 * add-on. POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (total waste cost, waste % of revenue, health level, preventable %, projected savings)
 *   2. Health gauge — color-coded benchmark vs industry (healthy/acceptable/concerning/critical)
 *   3. Top wasted items (sorted by cost)
 *   4. Top reason codes (with cost + count)
 *   5. AI insights panel — open recommendations with action + projected savings
 *   6. Patterns table — detected patterns with severity badge + trend
 *   7. Analyze button (runs detection + AI enhancement)
 *
 * Placement: new route /reports/waste-intelligence
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
  faTrash, faChartLine, faGaugeHigh, faArrowTrendUp, faArrowTrendDown,
  faRobot, faLightbulb, faCheckCircle, faXmark, faEye, faRotate,
  faTriangleExclamation, faClock, faCalendarDay, faUser, faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeWaste,
  getOpenInsights,
  updateInsightStatus,
  readWasteConfig,
  DEFAULT_WASTE_CONFIG,
  type WastePattern,
  type WasteInsight,
  type WasteSummary,
  type Severity,
  type PatternType,
  type InsightType,
} from "@/lib/waste-tracking.service.ts";

const HEALTH_STYLE: Record<WasteSummary['healthLevel'], { bg: string; text: string; border: string; label: string; icon: any }> = {
  healthy:     { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', label: 'Healthy',     icon: faCheckCircle },
  acceptable:  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-400',    label: 'Acceptable',  icon: faGaugeHigh },
  concerning:  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-400',   label: 'Concerning',  icon: faTriangleExclamation },
  critical:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-500',    label: 'Critical',    icon: faTriangleExclamation },
};

const SEVERITY_STYLE: Record<Severity, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-rose-100',  text: 'text-rose-700',   label: 'Critical' },
  high:     { bg: 'bg-orange-100', text: 'text-orange-700', label: 'High' },
  medium:   { bg: 'bg-amber-100', text: 'text-amber-700',  label: 'Medium' },
  low:      { bg: 'bg-neutral-100', text: 'text-neutral-600', label: 'Low' },
};

const PATTERN_TYPE_LABEL: Record<PatternType, string> = {
  item_recurring: 'Item recurring',
  time_of_day: 'Time of day',
  day_of_week: 'Day of week',
  staff_correlation: 'Staff correlation',
  reason_cluster: 'Reason cluster',
};

const PATTERN_TYPE_ICON: Record<PatternType, any> = {
  item_recurring: faBoxOpen,
  time_of_day: faClock,
  day_of_week: faCalendarDay,
  staff_correlation: faUser,
  reason_cluster: faTriangleExclamation,
};

const INSIGHT_TYPE_LABEL: Record<InsightType, string> = {
  reduce_order: 'Reduce order',
  retrain_staff: 'Retrain staff',
  adjust_prep: 'Adjust prep',
  check_storage: 'Check storage',
  menu_change: 'Menu change',
  supplier_issue: 'Supplier issue',
  monitor: 'Monitor',
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function WasteIntelligenceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [summary, setSummary] = useState<WasteSummary | null>(null);
  const [insights, setInsights] = useState<{ pattern: WastePattern; insight: WasteInsight }[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_WASTE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWasteConfig(settingsRows[0] ?? {}));
      const list = await getOpenInsights(db);
      setInsights(list);
    } catch (err) {
      console.error('[waste-report] reload failed', err);
      toast.error('Failed to load waste insights');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 4 });
    try {
      const result = await analyzeWaste(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setSummary(result.summary);
      toast.success(
        `Analyzed ${result.summary.totalEvents} waste events — ${result.patterns.length} patterns, ${result.insights.length} insights. Projected annual savings: ${withCurrency(result.summary.projectedAnnualSavings)}`
      );
      await reload();
    } catch (err) {
      console.error('[waste-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config, reload]);

  const handleInsightAction = useCallback(async (insightId: string, status: 'acknowledged' | 'acted_on' | 'dismissed') => {
    try {
      await updateInsightStatus(db, insightId, status);
      toast.success(`Insight ${status}`);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update insight');
    }
  }, [db, reload]);

  const totalProjectedSavings = useMemo(() => {
    return insights.reduce((sum, i) => sum + (i.insight.projected_savings ?? 0), 0);
  }, [insights]);

  return (
    <Layout>
      <DocumentTitle parts={["Waste Intelligence", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTrash} className="text-rose-500" />
              Waste Intelligence
            </h1>
            <p className="text-sm text-neutral-500">
              AI-powered waste pattern detection + actionable recommendations for reducing food waste
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze waste'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading waste data…</p>
          </div>
        ) : !summary && insights.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTrash} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No waste analysis yet</p>
            <p className="text-sm mt-1">Click "Analyze waste" to detect patterns and generate AI insights.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard icon={faTrash} label="Total waste" value={withCurrency(summary.totalCost)} color="text-rose-600" />
                <SummaryCard icon={faGaugeHigh} label="Waste % revenue" value={`${summary.wastePctOfRevenue}%`} color="text-amber-600" />
                <SummaryCard
                  icon={HEALTH_STYLE[summary.healthLevel].icon}
                  label="Health"
                  value={HEALTH_STYLE[summary.healthLevel].label}
                  color={HEALTH_STYLE[summary.healthLevel].text}
                />
                <SummaryCard icon={faCheckCircle} label="Preventable" value={`${summary.preventablePct}%`} color="text-emerald-600" />
                <SummaryCard icon={faArrowTrendUp} label="Proj. savings" value={withCurrency(summary.projectedAnnualSavings) + '/yr'} color="text-violet-600" />
              </div>
            )}

            {/* Health gauge */}
            {summary && (
              <div className={`rounded-lg border-2 p-4 ${HEALTH_STYLE[summary.healthLevel].bg} ${HEALTH_STYLE[summary.healthLevel].border}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon icon={HEALTH_STYLE[summary.healthLevel].icon} className={`text-3xl ${HEALTH_STYLE[summary.healthLevel].text}`} />
                    <div>
                      <div className={`text-xl font-bold ${HEALTH_STYLE[summary.healthLevel].text}`}>
                        {HEALTH_STYLE[summary.healthLevel].label}
                      </div>
                      <div className="text-xs text-neutral-600">
                        Waste is {summary.wastePctOfRevenue}% of revenue (industry benchmark: healthy &lt; 2%, critical &gt; {config.criticalPct}%)
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-neutral-500">Projected annual savings</div>
                    <div className="text-2xl font-bold text-emerald-600 tabular-nums">{withCurrency(summary.projectedAnnualSavings)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Top wasted items + reasons */}
            {summary && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white rounded-lg border border-neutral-200 p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <FontAwesomeIcon icon={faBoxOpen} className="text-rose-500" />
                    Top wasted items
                  </h3>
                  {summary.topWastedItems.length === 0 ? (
                    <p className="text-sm text-neutral-400">No items wasted</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.topWastedItems.slice(0, 5).map((item, idx) => (
                        <li key={idx} className="flex items-center justify-between text-sm">
                          <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-neutral-500">{item.quantity.toFixed(1)} units · {item.count} events</div>
                          </div>
                          <div className="font-semibold tabular-nums text-rose-600">{withCurrency(item.cost)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="bg-white rounded-lg border border-neutral-200 p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="text-amber-500" />
                    Top reason codes
                  </h3>
                  {summary.topReasons.length === 0 ? (
                    <p className="text-sm text-neutral-400">No reasons categorized</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.topReasons.map((reason, idx) => (
                        <li key={idx} className="flex items-center justify-between text-sm">
                          <div>
                            <div className="font-medium capitalize">{reason.label}</div>
                            <div className="text-xs text-neutral-500">{reason.count} events</div>
                          </div>
                          <div className="font-semibold tabular-nums">{withCurrency(reason.cost)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* AI Insights panel */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium flex items-center gap-2">
                  <FontAwesomeIcon icon={faLightbulb} className="text-amber-500" />
                  AI Insights &amp; Recommendations
                </h3>
                {totalProjectedSavings > 0 && (
                  <span className="text-sm text-emerald-600 font-semibold">
                    Total potential savings: {withCurrency(totalProjectedSavings)}/mo
                  </span>
                )}
              </div>
              {insights.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-6">
                  No open insights. Click "Analyze waste" to generate recommendations.
                </p>
              ) : (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  {insights.map(({ pattern, insight }) => {
                    const sev = SEVERITY_STYLE[pattern.severity];
                    const patternIcon = PATTERN_TYPE_ICON[pattern.pattern_type];
                    return (
                      <div key={insight.pattern_id} className="border border-neutral-200 rounded-lg p-3 hover:bg-neutral-50">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <FontAwesomeIcon icon={patternIcon} className="text-neutral-500" />
                            <span className="font-medium text-sm">{PATTERN_TYPE_LABEL[pattern.pattern_type]}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${sev.bg} ${sev.text}`}>{sev.label}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{INSIGHT_TYPE_LABEL[insight.insight_type]}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${insight.priority === 'high' ? 'bg-rose-100 text-rose-700' : insight.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600'}`}>
                              {insight.priority} priority
                            </span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {insight.projected_savings && (
                              <div className="text-sm font-semibold text-emerald-600 tabular-nums">
                                {withCurrency(insight.projected_savings)}/mo
                              </div>
                            )}
                            <div className="text-xs text-neutral-400">{Math.round(insight.confidence * 100)}% confidence</div>
                          </div>
                        </div>
                        <p className="text-sm text-neutral-700 mb-1">{insight.insight_text}</p>
                        <p className="text-xs text-neutral-500 italic mb-2">→ {insight.recommended_action}</p>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="text-xs text-neutral-400">
                            {pattern.item_name && <span className="mr-3">Item: {pattern.item_name}</span>}
                            {pattern.reason_code && <span className="mr-3 capitalize">Reason: {pattern.reason_code.replace(/_/g, ' ')}</span>}
                            {pattern.hour_of_day !== undefined && <span className="mr-3">Hour: {pattern.hour_of_day}:00</span>}
                            {pattern.day_of_week !== undefined && <span className="mr-3">Day: {DAYS[pattern.day_of_week]}</span>}
                            {pattern.user_name && <span className="mr-3">Staff: {pattern.user_name}</span>}
                            <span className="mr-3">{pattern.occurrence_count} events</span>
                            <span className="mr-3">{withCurrency(pattern.total_cost)} total</span>
                            {pattern.trend_direction === 'increasing' && <span className="text-rose-600"><FontAwesomeIcon icon={faArrowTrendUp} /> increasing</span>}
                            {pattern.trend_direction === 'decreasing' && <span className="text-emerald-600"><FontAwesomeIcon icon={faArrowTrendDown} /> decreasing</span>}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleInsightAction(insight.pattern_id, 'acknowledged')}
                              className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700 hover:bg-blue-200"
                              title="Acknowledge"
                            >
                              <FontAwesomeIcon icon={faEye} /> Ack
                            </button>
                            <button
                              onClick={() => handleInsightAction(insight.pattern_id, 'acted_on')}
                              className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              title="Mark as acted on"
                            >
                              <FontAwesomeIcon icon={faCheckCircle} /> Acted
                            </button>
                            <button
                              onClick={() => handleInsightAction(insight.pattern_id, 'dismissed')}
                              className="px-2 py-1 rounded text-xs bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                              title="Dismiss"
                            >
                              <FontAwesomeIcon icon={faXmark} /> Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Healthy threshold: <strong>&lt; {config.acceptablePct}%</strong></span>
              <span>Critical threshold: <strong>&gt; {config.criticalPct}%</strong></span>
              <span>Min occurrences for pattern: <strong>{config.patternMinOccurrences}</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Open insights: <strong className="text-amber-600">{insights.length}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon,
  label,
  value,
  color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default WasteIntelligenceScreen;
