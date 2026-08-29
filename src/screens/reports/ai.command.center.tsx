/**
 * AI Command Center — executive dashboard consolidating all 12 AI features.
 *
 * Research finding: Toast Insights Dashboard (higher tier), Square Executive
 * Dashboard — both bundle all analytics into one screen for managers. POSR
 * offers it free — single dashboard surfacing every AI insight at a glance
 * + AI-generated executive summary synthesizing cross-feature patterns.
 *
 * Layout:
 *   1. AI Executive Summary (top) — OpenAI synthesizes all 12 metrics into
 *      a 3-sentence "what to act on today" brief + top 3 priorities
 *   2. 12 metric cards in a responsive grid — each links to its full report:
 *      - Demand Forecast (7-day predicted orders + revenue)
 *      - Inventory Reorder (pending suggestions + potential savings)
 *      - Menu Optimization (stars/dogs counts + pricing issues)
 *      - Customer Sentiment (NPS + avg rating + positive %)
 *      - Waste Tracking (total waste + projected annual savings)
 *      - Staff Scheduling (projected cost + coverage gaps)
 *      - Cash Flow Forecast (projected 30d balance + health)
 *      - Vendor Performance (avg score + potential savings/yr)
 *      - Table Turnover (avg turnover + potential impact/mo)
 *      - Dynamic Pricing (active rules + projected impact)
 *      - Forecast Accuracy (MAPE + trend direction)
 *      - Upsell Effectiveness (conversion rate + revenue lift)
 *   3. "Action needed" panel — surfaces items needing attention across features
 *
 * Each card shows: icon + title + key metric + secondary metric + link to
 * full report + color-coded health indicator.
 *
 * Placement: new route /reports/ai-command-center
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { Layout } from "@/screens/partials/layout.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBrain, faChartLine, faBoxOpen, faUtensils, faHeart, faTrash,
  faCalendarWeek, faWallet, faTruck, faChair, faTags, faBullseye,
  faArrowTrendUp, faRobot, faRotate, faLightbulb, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  REPORTS_FORECAST, REPORTS_MENU_OPTIMIZATION, REPORTS_SENTIMENT,
  REPORTS_WASTE_INTELLIGENCE, REPORTS_SCHEDULING_OPTIMIZATION,
  REPORTS_CASH_FLOW, REPORTS_VENDOR_PERFORMANCE, REPORTS_TABLE_TURNOVER,
  REPORTS_DYNAMIC_PRICING, REPORTS_FORECAST_ACCURACY, REPORTS_UPSELL_EFFECTIVENESS,
} from "@/routes/posr.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricCard {
  title: string;
  icon: any;
  color: string;
  primary: string;
  secondary?: string;
  health: 'good' | 'watch' | 'warning' | 'critical' | 'neutral';
  link: string;
  linkLabel: string;
}

interface ExecutiveSummary {
  brief: string;
  priorities: string[];
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function AiCommandCenterScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [execSummary, setExecSummary] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const loadAllMetrics = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel fetch of all 12 AI feature summaries
      const [
        forecastData, menuData, sentimentData, wasteData,
        scheduleData, cashData, vendorData, turnoverData,
        pricingData, accuracyData, upsellData, reorderData,
      ] = await Promise.all([
        fetchForecastSummary(db),
        fetchMenuSummary(db),
        fetchSentimentSummary(db),
        fetchWasteSummary(db),
        fetchScheduleSummary(db),
        fetchCashFlowSummary(db),
        fetchVendorSummary(db),
        fetchTurnoverSummary(db),
        fetchPricingSummary(db),
        fetchAccuracySummary(db),
        fetchUpsellSummary(db),
        fetchReorderSummary(db),
      ]);

      setMetrics([
        forecastData, reorderData, menuData, sentimentData,
        wasteData, scheduleData, cashData, vendorData,
        turnoverData, pricingData, accuracyData, upsellData,
      ]);
    } catch (err) {
      console.error('[ai-command] loadAllMetrics failed', err);
      toast.error('Failed to load some metrics');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadAllMetrics();
  }, [loadAllMetrics]);

  const handleGenerateSummary = useCallback(async () => {
    if (metrics.length === 0) return;
    setGeneratingSummary(true);
    try {
      const summary = await generateExecutiveSummary(db, metrics);
      setExecSummary(summary);
    } catch (err) {
      console.error('[ai-command] generate summary failed', err);
      toast.error('Failed to generate executive summary');
    } finally {
      setGeneratingSummary(false);
    }
  }, [db, metrics]);

  // Action needed items (critical/warning health)
  const actionNeeded = useMemo(() => {
    return metrics.filter(m => m.health === 'warning' || m.health === 'critical');
  }, [metrics]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Command Center", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBrain} className="text-violet-600" />
              AI Command Center
            </h1>
            <p className="text-sm text-neutral-500">
              Executive view of all 12 AI features — one screen, every insight, AI-synthesized priorities
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={loadAllMetrics} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleGenerateSummary} disabled={generatingSummary || metrics.length === 0} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faRobot} spin={generatingSummary} />
              {generatingSummary ? 'Synthesizing…' : execSummary ? 'Re-generate summary' : 'Generate AI summary'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading all AI metrics…</p>
          </div>
        ) : (
          <>
            {/* AI Executive Summary */}
            {execSummary && (
              <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Executive Summary
                </h3>
                <p className="text-sm text-violet-900 mb-3">{execSummary.brief}</p>
                {execSummary.priorities.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-violet-700 uppercase mb-1">Top priorities</div>
                    <ol className="space-y-1">
                      {execSummary.priorities.map((p, idx) => (
                        <li key={idx} className="text-sm text-violet-900 flex items-start gap-2">
                          <span className="font-bold text-violet-600">{idx + 1}.</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Action needed banner */}
            {actionNeeded.length > 0 && (
              <div className="bg-rose-50 border border-rose-300 rounded-lg p-3">
                <div className="flex items-center gap-2 text-rose-800 font-medium text-sm">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  {actionNeeded.length} area{actionNeeded.length !== 1 ? 's' : ''} need attention:
                </div>
                <div className="mt-1 text-xs text-rose-700">
                  {actionNeeded.map(m => m.title).join(' · ')}
                </div>
              </div>
            )}

            {/* 12 metric cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {metrics.map((metric, idx) => (
                <MetricCardView key={idx} metric={metric} />
              ))}
            </div>

            {/* Footer */}
            <div className="text-xs text-neutral-500 text-center pt-4">
              POSR AI Command Center · 12 AI-powered features · Click any card for full report
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Metric card component
// ---------------------------------------------------------------------------

const HEALTH_DOT: Record<string, string> = {
  good: 'bg-emerald-500',
  watch: 'bg-blue-400',
  warning: 'bg-amber-400',
  critical: 'bg-rose-500',
  neutral: 'bg-neutral-300',
};

function MetricCardView({ metric }: { metric: MetricCard }) {
  return (
    <Link
      to={metric.link}
      className="bg-white rounded-lg border border-neutral-200 p-4 hover:shadow-md transition-shadow block"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={metric.icon} className={`text-xl ${metric.color}`} />
          <span className="text-sm font-medium text-neutral-700">{metric.title}</span>
        </div>
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${HEALTH_DOT[metric.health]}`} title={metric.health} />
      </div>
      <div className="text-2xl font-bold tabular-nums text-neutral-900">{metric.primary}</div>
      {metric.secondary && (
        <div className="text-xs text-neutral-500 mt-1">{metric.secondary}</div>
      )}
      <div className="text-xs text-blue-600 mt-2 hover:underline">View full report →</div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Per-feature summary fetchers (lightweight queries for card display)
// ---------------------------------------------------------------------------

async function fetchForecastSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT totalOrders, totalRevenue FROM demand_forecast
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    return {
      title: 'Demand Forecast',
      icon: faChartLine,
      color: 'text-blue-600',
      primary: f ? `${f.totalOrders ?? 0} orders` : 'No forecast',
      secondary: f ? `${withCurrency(f.totalRevenue ?? 0)} / 7 days` : 'Generate forecast first',
      health: f ? 'good' : 'neutral',
      link: REPORTS_FORECAST,
      linkLabel: 'View forecast',
    };
  } catch {
    return neutralCard('Demand Forecast', faChartLine, 'text-blue-600', REPORTS_FORECAST);
  }
}

async function fetchReorderSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count, math::sum(total_cost) AS total FROM reorder_suggestion
       WHERE status = 'pending' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    const count = r?.count ?? 0;
    const total = r?.total ?? 0;
    return {
      title: 'Inventory Reorder',
      icon: faBoxOpen,
      color: 'text-amber-600',
      primary: `${count} pending`,
      secondary: total > 0 ? `${withCurrency(total)} total value` : 'No suggestions',
      health: count > 5 ? 'warning' : count > 0 ? 'watch' : 'good',
      link: '/admin',
      linkLabel: 'View reorder dashboard',
    };
  } catch {
    return neutralCard('Inventory Reorder', faBoxOpen, 'text-amber-600', '/admin');
  }
}

async function fetchMenuSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count(IF classification = 'star' THEN 1 END) AS stars,
         count(IF classification = 'dog' THEN 1 END) AS dogs,
         count(IF pricing_recommendation = 'underpriced' THEN 1 END) AS underpriced
       FROM menu_insight WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const m = list[0];
    return {
      title: 'Menu Optimization',
      icon: faUtensils,
      color: 'text-violet-600',
      primary: `${m?.stars ?? 0} stars / ${m?.dogs ?? 0} dogs`,
      secondary: (m?.underpriced ?? 0) > 0 ? `${m.underpriced} underpriced items` : 'No pricing issues',
      health: (m?.dogs ?? 0) > 5 ? 'warning' : 'good',
      link: REPORTS_MENU_OPTIMIZATION,
      linkLabel: 'View menu analysis',
    };
  } catch {
    return neutralCard('Menu Optimization', faUtensils, 'text-violet-600', REPORTS_MENU_OPTIMIZATION);
  }
}

async function fetchSentimentSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         avg_rating,
         nps_score,
         total_reviews
       FROM sentiment_summary
       WHERE period_type = 'weekly'
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s) return neutralCard('Customer Sentiment', faHeart, 'text-rose-500', REPORTS_SENTIMENT);
    const nps = s.nps_score ?? 0;
    return {
      title: 'Customer Sentiment',
      icon: faHeart,
      color: 'text-rose-500',
      primary: `${(s.avg_rating ?? 0).toFixed(1)} / 5`,
      secondary: `NPS ${nps > 0 ? '+' : ''}${nps} · ${s.total_reviews ?? 0} reviews`,
      health: nps >= 50 ? 'good' : nps >= 20 ? 'watch' : nps >= 0 ? 'warning' : 'critical',
      link: REPORTS_SENTIMENT,
      linkLabel: 'View sentiment',
    };
  } catch {
    return neutralCard('Customer Sentiment', faHeart, 'text-rose-500', REPORTS_SENTIMENT);
  }
}

async function fetchWasteSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT total_cost, projected_annual_savings, health_level FROM waste_summary
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const w = list[0];
    if (!w) return neutralCard('Waste Tracking', faTrash, 'text-rose-600', REPORTS_WASTE_INTELLIGENCE);
    const health = (w.health_level ?? 'healthy') as MetricCard['health'];
    return {
      title: 'Waste Tracking',
      icon: faTrash,
      color: 'text-rose-600',
      primary: withCurrency(w.total_cost ?? 0),
      secondary: `Projected savings: ${withCurrency(w.projected_annual_savings ?? 0)}/yr`,
      health,
      link: REPORTS_WASTE_INTELLIGENCE,
      linkLabel: 'View waste analysis',
    };
  } catch {
    return neutralCard('Waste Tracking', faTrash, 'text-rose-600', REPORTS_WASTE_INTELLIGENCE);
  }
}

async function fetchScheduleSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT total_cost, total_shifts, coverage_gaps, projected_savings
       FROM schedule_optimization ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s) return neutralCard('Staff Scheduling', faCalendarWeek, 'text-blue-600', REPORTS_SCHEDULING_OPTIMIZATION);
    return {
      title: 'Staff Scheduling',
      icon: faCalendarWeek,
      color: 'text-blue-600',
      primary: `${s.total_shifts ?? 0} shifts`,
      secondary: `${withCurrency(s.total_cost ?? 0)} · ${s.coverage_gaps ?? 0} gaps`,
      health: (s.coverage_gaps ?? 0) > 5 ? 'warning' : 'good',
      link: REPORTS_SCHEDULING_OPTIMIZATION,
      linkLabel: 'View schedule',
    };
  } catch {
    return neutralCard('Staff Scheduling', faCalendarWeek, 'text-blue-600', REPORTS_SCHEDULING_OPTIMIZATION);
  }
}

async function fetchCashFlowSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT projected_closing_balance, health_status, runway_days, min_projected_balance
       FROM cash_flow_forecast WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c) return neutralCard('Cash Flow Forecast', faWallet, 'text-emerald-600', REPORTS_CASH_FLOW);
    const health = (c.health_status ?? 'healthy') as MetricCard['health'];
    return {
      title: 'Cash Flow Forecast',
      icon: faWallet,
      color: 'text-emerald-600',
      primary: withCurrency(c.projected_closing_balance ?? 0),
      secondary: c.runway_days !== undefined ? `Runway: ${c.runway_days} days` : `Min: ${withCurrency(c.min_projected_balance ?? 0)}`,
      health,
      link: REPORTS_CASH_FLOW,
      linkLabel: 'View cash flow',
    };
  } catch {
    return neutralCard('Cash Flow Forecast', faWallet, 'text-emerald-600', REPORTS_CASH_FLOW);
  }
}

async function fetchVendorSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         avg(overall_score) AS avg_score,
         count() AS total,
         sum(IF grade = 'F' THEN 1 END) AS failing
       FROM vendor_performance WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const v = list[0];
    if (!v || v.total === 0) return neutralCard('Vendor Performance', faTruck, 'text-blue-600', REPORTS_VENDOR_PERFORMANCE);
    return {
      title: 'Vendor Performance',
      icon: faTruck,
      color: 'text-blue-600',
      primary: `${(v.avg_score ?? 0).toFixed(0)}/100`,
      secondary: `${v.total} suppliers · ${v.failing ?? 0} failing`,
      health: (v.failing ?? 0) > 0 ? 'warning' : 'good',
      link: REPORTS_VENDOR_PERFORMANCE,
      linkLabel: 'View vendors',
    };
  } catch {
    return neutralCard('Vendor Performance', faTruck, 'text-blue-600', REPORTS_VENDOR_PERFORMANCE);
  }
}

async function fetchTurnoverSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         avg(turnover_rate) AS avg_turnover,
         avg(overall_score) AS avg_score,
         sum(IF grade = 'F' THEN 1 END) AS failing
       FROM table_turnover_analysis WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const t = list[0];
    if (!t) return neutralCard('Table Turnover', faChair, 'text-amber-600', REPORTS_TABLE_TURNOVER);
    return {
      title: 'Table Turnover',
      icon: faChair,
      color: 'text-amber-600',
      primary: `${(t.avg_turnover ?? 0).toFixed(1)} turns/day`,
      secondary: `Avg score ${(t.avg_score ?? 0).toFixed(0)} · ${t.failing ?? 0} underperforming`,
      health: (t.failing ?? 0) > 3 ? 'warning' : 'good',
      link: REPORTS_TABLE_TURNOVER,
      linkLabel: 'View turnover',
    };
  } catch {
    return neutralCard('Table Turnover', faChair, 'text-amber-600', REPORTS_TABLE_TURNOVER);
  }
}

async function fetchPricingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count(IF status = 'active' THEN 1 END) AS active,
         count(IF status = 'draft' THEN 1 END) AS draft,
         sum(expected_impact) AS impact
       FROM dynamic_pricing_rule`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    return {
      title: 'Dynamic Pricing',
      icon: faTags,
      color: 'text-orange-600',
      primary: `${p?.active ?? 0} active rules`,
      secondary: (p?.draft ?? 0) > 0 ? `${p.draft} pending review` : 'No drafts pending',
      health: 'neutral',
      link: REPORTS_DYNAMIC_PRICING,
      linkLabel: 'View pricing rules',
    };
  } catch {
    return neutralCard('Dynamic Pricing', faTags, 'text-orange-600', REPORTS_DYNAMIC_PRICING);
  }
}

async function fetchAccuracySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT mape, accuracy_pct, bias, evaluated_count
       FROM forecast_accuracy ORDER BY evaluated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const a = list[0];
    if (!a) return neutralCard('Forecast Accuracy', faBullseye, 'text-violet-600', REPORTS_FORECAST_ACCURACY);
    const mape = a.mape ?? 0;
    return {
      title: 'Forecast Accuracy',
      icon: faBullseye,
      color: 'text-violet-600',
      primary: `${mape.toFixed(1)}% MAPE`,
      secondary: `${(a.accuracy_pct ?? 0).toFixed(0)}% accuracy · ${a.evaluated_count ?? 0} evaluated`,
      health: mape < 15 ? 'good' : mape < 25 ? 'watch' : mape < 40 ? 'warning' : 'critical',
      link: REPORTS_FORECAST_ACCURACY,
      linkLabel: 'View accuracy',
    };
  } catch {
    return neutralCard('Forecast Accuracy', faBullseye, 'text-violet-600', REPORTS_FORECAST_ACCURACY);
  }
}

async function fetchUpsellSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT conversion_rate, revenue_lift, times_shown
       FROM upsell_effectiveness WHERE is_overall = true
       AND expires_at > time::now() ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const u = list[0];
    if (!u) return neutralCard('Upsell Effectiveness', faArrowTrendUp, 'text-emerald-600', REPORTS_UPSELL_EFFECTIVENESS);
    const conv = u.conversion_rate ?? 0;
    return {
      title: 'Upsell Effectiveness',
      icon: faArrowTrendUp,
      color: 'text-emerald-600',
      primary: `${conv.toFixed(1)}% conversion`,
      secondary: `${withCurrency(u.revenue_lift ?? 0)} lift · ${u.times_shown ?? 0} shows`,
      health: conv >= 20 ? 'good' : conv >= 10 ? 'watch' : 'warning',
      link: REPORTS_UPSELL_EFFECTIVENESS,
      linkLabel: 'View upsell analytics',
    };
  } catch {
    return neutralCard('Upsell Effectiveness', faArrowTrendUp, 'text-emerald-600', REPORTS_UPSELL_EFFECTIVENESS);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function neutralCard(title: string, icon: any, color: string, link: string): MetricCard {
  return {
    title, icon, color,
    primary: '—',
    secondary: 'No data yet',
    health: 'neutral',
    link,
    linkLabel: 'Open',
  };
}

// ---------------------------------------------------------------------------
// AI Executive Summary — synthesizes all 12 metrics
// ---------------------------------------------------------------------------

async function generateExecutiveSummary(_db: any, metrics: MetricCard[]): Promise<ExecutiveSummary> {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    // Fallback: rule-based summary
    return ruleBasedSummary(metrics);
  }

  const prompt = `You are a restaurant operations executive advisor.
Synthesize these 12 AI feature metrics into a brief + top 3 priorities.

Metrics (JSON):
${JSON.stringify(metrics.map(m => ({
  feature: m.title,
  primary: m.primary,
  secondary: m.secondary,
  health: m.health,
})), null, 2)}

Respond with JSON:
{
  "brief": "<max 500 chars — 3-sentence overview of overall health + what's working + what needs action>",
  "priorities": ["<max 150 chars each — top 3 actionable priorities ranked by impact>]
}

Focus on cross-feature patterns + revenue-impacting actions.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant operations executive advisor AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return ruleBasedSummary(metrics);
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      brief: parsed.brief ?? 'Unable to generate summary.',
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities.slice(0, 3) : [],
    };
  } catch (err) {
    console.warn('[ai-command] AI summary failed — using rule-based', err);
    return ruleBasedSummary(metrics);
  }
}

function ruleBasedSummary(metrics: MetricCard[]): ExecutiveSummary {
  const critical = metrics.filter(m => m.health === 'critical');
  const warning = metrics.filter(m => m.health === 'warning');
  const good = metrics.filter(m => m.health === 'good');

  let brief = `${good.length} of ${metrics.length} areas are healthy`;
  if (critical.length > 0) {
    brief += `, ${critical.length} critical (${critical.map(c => c.title).join(', ')}). Immediate action needed.`;
  } else if (warning.length > 0) {
    brief += `, ${warning.length} need attention (${warning.map(w => w.title).join(', ')}).`;
  } else {
    brief += `. All systems operating within normal parameters.`;
  }

  const priorities: string[] = [];
  // Critical first
  for (const c of critical.slice(0, 2)) {
    priorities.push(`Address ${c.title}: ${c.primary} — ${c.secondary ?? 'action needed'}`);
  }
  // Then warnings
  for (const w of warning.slice(0, 3 - priorities.length)) {
    priorities.push(`Review ${w.title}: ${w.primary} — ${w.secondary ?? 'monitor closely'}`);
  }
  // Fill remaining with highest-value items
  while (priorities.length < 3) {
    const remaining = metrics.filter(m => !critical.includes(m) && !warning.includes(m));
    if (remaining.length === 0) break;
    const r = remaining[0];
    priorities.push(`Continue monitoring ${r.title}: ${r.primary}`);
  }

  return { brief, priorities: priorities.slice(0, 3) };
}

export default AiCommandCenterScreen;
