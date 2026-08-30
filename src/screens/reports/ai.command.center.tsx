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
  faUsers, faUserMinus, faPercentage, faStore, faChartBar,
  faDollarSign, faClock, faHandHoldingDollar, faGaugeHigh,
  faCalendarAlt, faCalendarXmark, faUserSecret, faShieldVirus, faBolt, faUserClock, faFlask, faFireBurner, faHeartCrack, faCreditCard, faTag, faLink, faHourglassHalf, faBullhorn, faClockRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  REPORTS_FORECAST, REPORTS_MENU_OPTIMIZATION, REPORTS_SENTIMENT,
  REPORTS_WASTE_INTELLIGENCE, REPORTS_SCHEDULING_OPTIMIZATION,
  REPORTS_CASH_FLOW, REPORTS_VENDOR_PERFORMANCE, REPORTS_TABLE_TURNOVER,
  REPORTS_DYNAMIC_PRICING, REPORTS_FORECAST_ACCURACY, REPORTS_UPSELL_EFFECTIVENESS,
  REPORTS_CUSTOMER_CLV, REPORTS_CHURN_PREDICTION, REPORTS_PROMO_EFFECTIVENESS,
  REPORTS_SERVER_PERFORMANCE, REPORTS_COMPETITOR_MONITORING,
  REPORTS_FOOD_COST_TRENDS, REPORTS_RECIPE_OPTIMIZATION,
  REPORTS_SEGMENTATION, REPORTS_LABOR_OPTIMIZATION,
  REPORTS_DELIVERY_ANALYTICS, REPORTS_PEAK_HOUR,
  REPORTS_TIP_ANALYTICS, REPORTS_REVPASH,
  REPORTS_CUSTOMER_JOURNEY, REPORTS_SEASONAL_TRENDS,
  REPORTS_GUEST_PREFERENCES,
  REPORTS_NOSHOW_PREDICTION,
  REPORTS_ORDER_FRAUD,
  REPORTS_FOOD_SAFETY,
  REPORTS_ENERGY_OPTIMIZATION,
  REPORTS_STAFF_TURNOVER,
  REPORTS_YIELD_VARIANCE,
  REPORTS_KITCHEN_BOTTLENECK,
  REPORTS_WIN_BACK,
  REPORTS_CHARGEBACK_RISK,
  REPORTS_PRICE_ELASTICITY,
  REPORTS_PROMO_ABUSE,
  REPORTS_MENU_PAIRING,
  REPORTS_WAIT_PREDICTION,
  REPORTS_PROMO_FORECAST,
  REPORTS_CLV_TRAJECTORY,
  REPORTS_SPOILAGE_PREDICTION,
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
      // Parallel fetch of all 26 AI feature summaries
      const [
        forecastData, menuData, sentimentData, wasteData,
        scheduleData, cashData, vendorData, turnoverData,
        pricingData, accuracyData, upsellData, reorderData,
        clvData, churnData, promoData,
        serverData, competitorData, foodCostData,
        recipeData, segmentationData, laborData,
        deliveryData, tipData, revpashData,
        seasonalData, guestPrefData, noShowData, fraudData, foodSafetyData, energyData, staffTurnoverData, yieldData, kitchenData, winBackData, chargebackData, elasticityData, promoAbuseData, pairingData, waitPredData, promoForecastData, clvTrajectoryData, spoilageData,
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
        fetchCLVSummary(db),
        fetchChurnSummary(db),
        fetchPromoSummary(db),
        fetchServerSummary(db),
        fetchCompetitorSummary(db),
        fetchFoodCostSummary(db),
        fetchRecipeSummary(db),
        fetchSegmentationSummary(db),
        fetchLaborSummary(db),
        fetchDeliverySummary(db),
        fetchTipSummary(db),
        fetchRevPASHSummary(db),
        fetchSeasonalSummary(db),
        fetchGuestPrefSummary(db),
        fetchNoShowSummary(db),
        fetchFraudSummary(db),
        fetchFoodSafetySummary(db),
        fetchEnergySummary(db),
        fetchStaffTurnoverSummary(db),
        fetchYieldSummary(db),
        fetchKitchenSummary(db),
        fetchWinBackSummary(db),
        fetchChargebackSummary(db),
        fetchElasticitySummary(db),
        fetchPromoAbuseSummary(db),
        fetchPairingSummary(db),
        fetchWaitPredSummary(db),
        fetchPromoForecastSummary(db),
        fetchCLVTrajectorySummary(db),
        fetchSpoilageSummary(db),
      ]);

      setMetrics([
        forecastData, reorderData, menuData, sentimentData,
        wasteData, scheduleData, cashData, vendorData,
        turnoverData, pricingData, accuracyData, upsellData,
        clvData, churnData, promoData,
        serverData, competitorData, foodCostData,
        recipeData, segmentationData, laborData,
        deliveryData, tipData, revpashData,
        seasonalData, guestPrefData, noShowData, fraudData, foodSafetyData, energyData, staffTurnoverData, yieldData, kitchenData, winBackData, chargebackData, elasticityData, promoAbuseData, pairingData, waitPredData, promoForecastData, clvTrajectoryData, spoilageData,
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
              POSR AI Command Center · 26 AI-powered features · Click any card for full report
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

async function fetchCLVSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT avg(total_clv) AS avg_clv, count() AS count,
         sum(IF segment = 'at_risk' THEN 1 END) + sum(IF segment = 'cant_lose' THEN 1 END) AS at_risk
       FROM customer_clv WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Customer CLV', faUsers, 'text-violet-600', REPORTS_CUSTOMER_CLV);
    return {
      title: 'Customer CLV',
      icon: faUsers,
      color: 'text-violet-600',
      primary: `$${Math.round(c.avg_clv ?? 0)}`,
      secondary: `${c.count} customers · ${c.at_risk ?? 0} at risk`,
      health: (c.at_risk ?? 0) > 5 ? 'warning' : 'good',
      link: REPORTS_CUSTOMER_CLV,
      linkLabel: 'View CLV',
    };
  } catch {
    return neutralCard('Customer CLV', faUsers, 'text-violet-600', REPORTS_CUSTOMER_CLV);
  }
}

async function fetchChurnSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT at_risk_count, critical_count, churn_rate, revenue_at_risk
       FROM churn_snapshot ORDER BY snapshot_date DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c) return neutralCard('Churn Prediction', faUserMinus, 'text-rose-600', REPORTS_CHURN_PREDICTION);
    const rate = c.churn_rate ?? 0;
    return {
      title: 'Churn Prediction',
      icon: faUserMinus,
      color: 'text-rose-600',
      primary: `${c.at_risk_count ?? 0} at risk`,
      secondary: `${rate.toFixed(0)}% churn rate · ${withCurrency(c.revenue_at_risk ?? 0)} at risk`,
      health: rate > 30 ? 'critical' : rate > 15 ? 'warning' : 'good',
      link: REPORTS_CHURN_PREDICTION,
      linkLabel: 'View churn',
    };
  } catch {
    return neutralCard('Churn Prediction', faUserMinus, 'text-rose-600', REPORTS_CHURN_PREDICTION);
  }
}

async function fetchPromoSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT times_redeemed, total_discount_given, revenue_generated, roi
       FROM promo_effectiveness WHERE is_overall = true AND expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p) return neutralCard('Promo Effectiveness', faPercentage, 'text-orange-600', REPORTS_PROMO_EFFECTIVENESS);
    const roi = p.roi ?? 0;
    return {
      title: 'Promo Effectiveness',
      icon: faPercentage,
      color: 'text-orange-600',
      primary: `${roi > 0 ? '+' : ''}${roi}% ROI`,
      secondary: `${p.times_redeemed ?? 0} redemptions · ${withCurrency(p.revenue_generated ?? 0)} revenue`,
      health: roi > 100 ? 'good' : roi > 0 ? 'watch' : 'warning',
      link: REPORTS_PROMO_EFFECTIVENESS,
      linkLabel: 'View promos',
    };
  } catch {
    return neutralCard('Promo Effectiveness', faPercentage, 'text-orange-600', REPORTS_PROMO_EFFECTIVENESS);
  }
}

async function fetchServerSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT avg(overall_score) AS avg_score, count() AS count,
         sum(IF grade = 'F' THEN 1 END) AS failing
       FROM server_performance WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Server Performance', faUsers, 'text-blue-600', REPORTS_SERVER_PERFORMANCE);
    return {
      title: 'Server Performance',
      icon: faUsers, color: 'text-blue-600',
      primary: `${Math.round(s.avg_score ?? 0)}/100`,
      secondary: `${s.count} servers · ${s.failing ?? 0} underperforming`,
      health: (s.failing ?? 0) > 2 ? 'warning' : 'good',
      link: REPORTS_SERVER_PERFORMANCE, linkLabel: 'View servers',
    };
  } catch { return neutralCard('Server Performance', faUsers, 'text-blue-600', REPORTS_SERVER_PERFORMANCE); }
}

async function fetchCompetitorSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, avg(price_diff_pct) AS avg_diff
       FROM competitor_price`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.total === 0) return neutralCard('Competitor Monitoring', faStore, 'text-orange-600', REPORTS_COMPETITOR_MONITORING);
    return {
      title: 'Competitor Monitoring',
      icon: faStore, color: 'text-orange-600',
      primary: `${c.total} compared`,
      secondary: `Avg ${Math.round(c.avg_diff ?? 0)}% vs competitors`,
      health: 'neutral',
      link: REPORTS_COMPETITOR_MONITORING, linkLabel: 'View competitors',
    };
  } catch { return neutralCard('Competitor Monitoring', faStore, 'text-orange-600', REPORTS_COMPETITOR_MONITORING); }
}

async function fetchFoodCostSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT sum(IF trend_direction = 'rising' THEN 1 END) AS rising,
         sum(annual_cost_impact) AS impact
       FROM food_cost_trend WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f) return neutralCard('Food Cost Trends', faChartBar, 'text-emerald-600', REPORTS_FOOD_COST_TRENDS);
    return {
      title: 'Food Cost Trends',
      icon: faChartBar, color: 'text-emerald-600',
      primary: `${f.rising ?? 0} rising items`,
      secondary: `Annual impact: ${withCurrency(f.impact ?? 0)}`,
      health: (f.rising ?? 0) > 5 ? 'warning' : 'neutral',
      link: REPORTS_FOOD_COST_TRENDS, linkLabel: 'View food costs',
    };
  } catch { return neutralCard('Food Cost Trends', faChartBar, 'text-emerald-600', REPORTS_FOOD_COST_TRENDS); }
}

async function fetchRecipeSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT avg(food_cost_pct) AS avg_fc,
         sum(IF grade IN ['D','F'] THEN 1 END) AS critical
       FROM recipe_cost_analysis WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    if (!r) return neutralCard('Recipe Optimization', faUtensils, 'text-violet-600', REPORTS_RECIPE_OPTIMIZATION);
    return {
      title: 'Recipe Optimization',
      icon: faUtensils, color: 'text-violet-600',
      primary: `${Math.round(r.avg_fc ?? 0)}% avg food cost`,
      secondary: `${r.critical ?? 0} dishes need attention`,
      health: (r.critical ?? 0) > 3 ? 'warning' : 'neutral',
      link: REPORTS_RECIPE_OPTIMIZATION, linkLabel: 'View recipes',
    };
  } catch { return neutralCard('Recipe Optimization', faUtensils, 'text-violet-600', REPORTS_RECIPE_OPTIMIZATION); }
}

async function fetchSegmentationSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT sum(customer_count) AS customers, sum(projected_revenue_impact) AS impact
       FROM segment_strategy WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.customers === 0) return neutralCard('Customer Segmentation', faUsers, 'text-violet-600', REPORTS_SEGMENTATION);
    return {
      title: 'Customer Segmentation',
      icon: faUsers, color: 'text-violet-600',
      primary: `${s.customers} customers`,
      secondary: `Projected impact: ${withCurrency(s.impact ?? 0)}/mo`,
      health: 'neutral',
      link: REPORTS_SEGMENTATION, linkLabel: 'View segments',
    };
  } catch { return neutralCard('Customer Segmentation', faUsers, 'text-violet-600', REPORTS_SEGMENTATION); }
}

async function fetchLaborSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT labor_cost_pct, health_status, total_hours
       FROM labor_cost_analysis WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const l = list[0];
    if (!l) return neutralCard('Labor Cost Optimization', faClock, 'text-blue-600', REPORTS_LABOR_OPTIMIZATION);
    const health = (l.health_status ?? 'healthy') as MetricCard['health'];
    return {
      title: 'Labor Cost',
      icon: faClock, color: 'text-blue-600',
      primary: `${l.labor_cost_pct}% of revenue`,
      secondary: `${l.total_hours} hours`,
      health,
      link: REPORTS_LABOR_OPTIMIZATION, linkLabel: 'View labor',
    };
  } catch { return neutralCard('Labor Cost Optimization', faClock, 'text-blue-600', REPORTS_LABOR_OPTIMIZATION); }
}

async function fetchDeliverySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT sum(total_revenue) AS revenue, sum(total_orders) AS orders,
         sum(commission_paid) AS commission, sum(net_revenue) AS net
       FROM delivery_performance WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const d = list[0];
    if (!d || d.orders === 0) return neutralCard('Delivery Analytics', faTruck, 'text-orange-600', REPORTS_DELIVERY_ANALYTICS);
    return {
      title: 'Delivery Analytics',
      icon: faTruck, color: 'text-orange-600',
      primary: `${d.orders} orders`,
      secondary: `${withCurrency(d.revenue)} revenue · ${withCurrency(d.commission)} commission`,
      health: 'neutral',
      link: REPORTS_DELIVERY_ANALYTICS, linkLabel: 'View delivery',
    };
  } catch { return neutralCard('Delivery Analytics', faTruck, 'text-orange-600', REPORTS_DELIVERY_ANALYTICS); }
}

async function fetchTipSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT total_tips, tip_frequency, equity_score
       FROM tip_distribution_analysis WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const t = list[0];
    if (!t) return neutralCard('Tip Analytics', faHandHoldingDollar, 'text-emerald-600', REPORTS_TIP_ANALYTICS);
    return {
      title: 'Tip Analytics',
      icon: faHandHoldingDollar, color: 'text-emerald-600',
      primary: withCurrency(t.total_tips ?? 0),
      secondary: `${t.tip_frequency ?? 0}% tipped · equity ${t.equity_score ?? 0}/100`,
      health: (t.equity_score ?? 100) >= 80 ? 'good' : (t.equity_score ?? 100) >= 60 ? 'watch' : 'warning',
      link: REPORTS_TIP_ANALYTICS, linkLabel: 'View tips',
    };
  } catch { return neutralCard('Tip Analytics', faHandHoldingDollar, 'text-emerald-600', REPORTS_TIP_ANALYTICS); }
}

async function fetchRevPASHSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT revpash, benchmark_grade, total_seats
       FROM revpash_analysis WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    if (!r) return neutralCard('RevPASH', faGaugeHigh, 'text-violet-600', REPORTS_REVPASH);
    return {
      title: 'RevPASH',
      icon: faGaugeHigh, color: 'text-violet-600',
      primary: `$${r.revpash ?? 0}/hr`,
      secondary: `Grade ${r.benchmark_grade ?? 'C'} · ${r.total_seats ?? 0} seats`,
      health: (r.revpash ?? 0) > 10 ? 'good' : (r.revpash ?? 0) > 5 ? 'watch' : 'warning',
      link: REPORTS_REVPASH, linkLabel: 'View RevPASH',
    };
  } catch { return neutralCard('RevPASH', faGaugeHigh, 'text-violet-600', REPORTS_REVPASH); }
}

async function fetchSeasonalSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count, sum(IF is_peak_season THEN 1 END) AS peak_months
       FROM seasonal_trend WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Seasonal Trends', faCalendarAlt, 'text-blue-600', REPORTS_SEASONAL_TRENDS);
    return {
      title: 'Seasonal Trends',
      icon: faCalendarAlt, color: 'text-blue-600',
      primary: `${s.peak_months ?? 0} peak months`,
      secondary: `${s.count} months analyzed`,
      health: 'neutral',
      link: REPORTS_SEASONAL_TRENDS, linkLabel: 'View seasons',
    };
  } catch { return neutralCard('Seasonal Trends', faCalendarAlt, 'text-blue-600', REPORTS_SEASONAL_TRENDS); }
}

async function fetchGuestPrefSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count, avg(total_visits) AS avg_visits
       FROM guest_preference WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const g = list[0];
    if (!g || g.count === 0) return neutralCard('Guest Preferences', faUsers, 'text-violet-600', REPORTS_GUEST_PREFERENCES);
    return {
      title: 'Guest Preferences',
      icon: faUsers, color: 'text-violet-600',
      primary: `${g.count} guests profiled`,
      secondary: `Avg ${Math.round(g.avg_visits ?? 0)} visits/guest`,
      health: 'good',
      link: REPORTS_GUEST_PREFERENCES, linkLabel: 'View guests',
    };
  } catch { return neutralCard('Guest Preferences', faUsers, 'text-violet-600', REPORTS_GUEST_PREFERENCES); }
}

async function fetchNoShowSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count,
         math::count(risk_level IN ['critical', 'high']) AS at_risk,
         math::sum(est_revenue_at_risk) AS revenue
       FROM noshow_prediction
       WHERE reservation_date > time::now() AND action_taken = 'none'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const n = list[0];
    if (!n || n.count === 0) return neutralCard('No-Show Prediction', faCalendarXmark, 'text-rose-600', REPORTS_NOSHOW_PREDICTION);
    return {
      title: 'No-Show Prediction',
      icon: faCalendarXmark, color: 'text-rose-600',
      primary: `${n.at_risk} at-risk`,
      secondary: `${n.count} upcoming · ${withCurrency(n.revenue)} at risk`,
      health: n.at_risk > 0 ? 'warning' : 'good',
      link: REPORTS_NOSHOW_PREDICTION, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('No-Show Prediction', faCalendarXmark, 'text-rose-600', REPORTS_NOSHOW_PREDICTION); }
}

async function fetchFraudSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count,
         math::count(severity = 'critical') AS critical,
         math::sum(estimated_loss) AS total_loss
       FROM order_fraud_alert WHERE status = 'open'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Order Fraud', faUserSecret, 'text-rose-700', REPORTS_ORDER_FRAUD);
    return {
      title: 'Order Fraud',
      icon: faUserSecret, color: 'text-rose-700',
      primary: `${f.critical} critical`,
      secondary: `${f.count} alerts · ${withCurrency(f.total_loss)} est. loss`,
      health: f.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_ORDER_FRAUD, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Order Fraud', faUserSecret, 'text-rose-700', REPORTS_ORDER_FRAUD); }
}

async function fetchFoodSafetySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical
       FROM foodsafety_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Food Safety', faShieldVirus, 'text-emerald-600', REPORTS_FOOD_SAFETY);
    return {
      title: 'Food Safety',
      icon: faShieldVirus, color: 'text-emerald-600',
      primary: `${f.critical} critical`,
      secondary: `${f.count} alerts · HACCP`,
      health: f.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_FOOD_SAFETY, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Food Safety', faShieldVirus, 'text-emerald-600', REPORTS_FOOD_SAFETY); }
}

async function fetchEnergySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(estimated_waste) AS total_waste
       FROM energy_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const e = list[0];
    if (!e || e.count === 0) return neutralCard('Energy Optimization', faBolt, 'text-amber-500', REPORTS_ENERGY_OPTIMIZATION);
    return {
      title: 'Energy Optimization',
      icon: faBolt, color: 'text-amber-500',
      primary: `${e.critical} critical`,
      secondary: `${e.count} alerts · ${withCurrency(e.total_waste)}/yr waste`,
      health: e.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_ENERGY_OPTIMIZATION, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Energy Optimization', faBolt, 'text-amber-500', REPORTS_ENERGY_OPTIMIZATION); }
}

async function fetchStaffTurnoverSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level IN ['critical', 'high']) AS at_risk,
         math::sum(est_replacement_cost) AS total_cost
       FROM turnover_prediction
       WHERE risk_score >= 35 AND action_taken = 'none'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const t = list[0];
    if (!t || t.count === 0) return neutralCard('Staff Turnover', faUserClock, 'text-orange-600', REPORTS_STAFF_TURNOVER);
    return {
      title: 'Staff Turnover',
      icon: faUserClock, color: 'text-orange-600',
      primary: `${t.at_risk} at-risk`,
      secondary: `${t.count} scored · ${withCurrency(t.total_cost)} exposure`,
      health: t.at_risk > 0 ? 'warning' : 'good',
      link: REPORTS_STAFF_TURNOVER, linkLabel: 'View at-risk',
    };
  } catch { return neutralCard('Staff Turnover', faUserClock, 'text-orange-600', REPORTS_STAFF_TURNOVER); }
}

async function fetchYieldSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(estimated_loss) AS total_loss
       FROM yield_variance_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const y = list[0];
    if (!y || y.count === 0) return neutralCard('Yield Variance', faFlask, 'text-violet-600', REPORTS_YIELD_VARIANCE);
    return {
      title: 'Yield Variance',
      icon: faFlask, color: 'text-violet-600',
      primary: `${y.critical} critical`,
      secondary: `${y.count} alerts · ${withCurrency(y.total_loss)} loss`,
      health: y.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_YIELD_VARIANCE, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Yield Variance', faFlask, 'text-violet-600', REPORTS_YIELD_VARIANCE); }
}

async function fetchKitchenSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::mean(metric_value) AS avg_wait
       FROM kitchen_bottleneck_alert
       WHERE status = 'open' AND detected_at > time::now() - 4h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const k = list[0];
    if (!k || k.count === 0) return neutralCard('Kitchen Bottleneck', faFireBurner, 'text-rose-600', REPORTS_KITCHEN_BOTTLENECK);
    return {
      title: 'Kitchen Bottleneck',
      icon: faFireBurner, color: 'text-rose-600',
      primary: `${k.critical} critical`,
      secondary: `${k.count} alerts · avg wait ${Math.round(k.avg_wait ?? 0)} min`,
      health: k.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_KITCHEN_BOTTLENECK, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Kitchen Bottleneck', faFireBurner, 'text-rose-600', REPORTS_KITCHEN_BOTTLENECK); }
}

async function fetchWinBackSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(winback_level IN ['critical', 'high']) AS winnable,
         math::sum(est_clv_recovered) AS recoverable
       FROM winback_prediction
       WHERE winback_score >= 35 AND action_taken = 'none'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const w = list[0];
    if (!w || w.count === 0) return neutralCard('Customer Win-Back', faHeartCrack, 'text-rose-600', REPORTS_WIN_BACK);
    return {
      title: 'Customer Win-Back',
      icon: faHeartCrack, color: 'text-rose-600',
      primary: `${w.winnable} winnable`,
      secondary: `${w.count} churned · ${withCurrency(w.recoverable)} CLV`,
      health: w.winnable > 0 ? 'warning' : 'good',
      link: REPORTS_WIN_BACK, linkLabel: 'View candidates',
    };
  } catch { return neutralCard('Customer Win-Back', faHeartCrack, 'text-rose-600', REPORTS_WIN_BACK); }
}

async function fetchChargebackSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level = 'critical') AS critical,
         math::sum(est_chargeback_cost) AS exposure
       FROM chargeback_risk_alert
       WHERE risk_score >= 35 AND action_taken = 'none'
         AND detected_at > time::now() - 24h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Chargeback Risk', faCreditCard, 'text-rose-600', REPORTS_CHARGEBACK_RISK);
    return {
      title: 'Chargeback Risk',
      icon: faCreditCard, color: 'text-rose-600',
      primary: `${c.critical} critical`,
      secondary: `${c.count} at-risk · ${withCurrency(c.exposure)} exposure`,
      health: c.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_CHARGEBACK_RISK, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Chargeback Risk', faCreditCard, 'text-rose-600', REPORTS_CHARGEBACK_RISK); }
}

async function fetchElasticitySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(recommended_action != 'keep_price') AS actionable,
         math::sum(est_weekly_revenue_change) AS weekly_impact
       FROM price_elasticity_result
       WHERE action_taken = 'none'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const e = list[0];
    if (!e || e.count === 0) return neutralCard('Price Elasticity', faChartLine, 'text-emerald-600', REPORTS_PRICE_ELASTICITY);
    return {
      title: 'Price Elasticity',
      icon: faChartLine, color: 'text-emerald-600',
      primary: `${e.actionable} actionable`,
      secondary: `${e.count} items · ${withCurrency(e.weekly_impact)}/wk`,
      health: e.actionable > 0 ? 'warning' : 'good',
      link: REPORTS_PRICE_ELASTICITY, linkLabel: 'View analysis',
    };
  } catch { return neutralCard('Price Elasticity', faChartLine, 'text-emerald-600', REPORTS_PRICE_ELASTICITY); }
}

async function fetchPromoAbuseSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(estimated_loss) AS total_loss
       FROM promo_abuse_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p || p.count === 0) return neutralCard('Promo Abuse', faTag, 'text-rose-600', REPORTS_PROMO_ABUSE);
    return {
      title: 'Promo Abuse',
      icon: faTag, color: 'text-rose-600',
      primary: `${p.critical} critical`,
      secondary: `${p.count} alerts · ${withCurrency(p.total_loss)} loss`,
      health: p.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_PROMO_ABUSE, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Promo Abuse', faTag, 'text-rose-600', REPORTS_PROMO_ABUSE); }
}

async function fetchPairingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(tier = 'opportunity') AS opportunities,
         math::sum(est_revenue_lift) AS total_lift
       FROM menu_pairing GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p || p.count === 0) return neutralCard('Menu Pairing', faLink, 'text-violet-600', REPORTS_MENU_PAIRING);
    return {
      title: 'Menu Pairing',
      icon: faLink, color: 'text-violet-600',
      primary: `${p.opportunities} opportunities`,
      secondary: `${p.count} pairs · ${withCurrency(p.total_lift)}/mo lift`,
      health: p.opportunities > 0 ? 'warning' : 'good',
      link: REPORTS_MENU_PAIRING, linkLabel: 'View pairings',
    };
  } catch { return neutralCard('Menu Pairing', faLink, 'text-violet-600', REPORTS_MENU_PAIRING); }
}

async function fetchWaitPredSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::mean(predicted_wait_min) AS avg_wait,
         math::count(est_walkaway_risk > 0.5) AS high_risk
       FROM wait_prediction
       WHERE actual_wait_min IS NONE
         AND predicted_at > time::now() - 2h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const w = list[0];
    if (!w || w.count === 0) return neutralCard('Wait Prediction', faHourglassHalf, 'text-amber-600', REPORTS_WAIT_PREDICTION);
    return {
      title: 'Wait Prediction',
      icon: faHourglassHalf, color: 'text-amber-600',
      primary: `${w.count} waiting`,
      secondary: `avg ${Math.round(w.avg_wait ?? 0)} min · ${w.high_risk} at-risk`,
      health: w.high_risk > 0 ? 'warning' : 'good',
      link: REPORTS_WAIT_PREDICTION, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Wait Prediction', faHourglassHalf, 'text-amber-600', REPORTS_WAIT_PREDICTION); }
}

async function fetchPromoForecastSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(ai_recommendation = 'launch') AS launch,
         math::mean(est_roi) AS avg_roi
       FROM promo_forecast
       WHERE forecasted_at > time::now() - 24h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p || p.count === 0) return neutralCard('Promo Forecast', faBullhorn, 'text-amber-600', REPORTS_PROMO_FORECAST);
    return {
      title: 'Promo Forecast',
      icon: faBullhorn, color: 'text-amber-600',
      primary: `${p.launch} launch`,
      secondary: `${p.count} campaigns · avg ${Math.round(p.avg_roi * 100) / 100}× ROI`,
      health: p.launch > 0 ? 'good' : 'warning',
      link: REPORTS_PROMO_FORECAST, linkLabel: 'View forecasts',
    };
  } catch { return neutralCard('Promo Forecast', faBullhorn, 'text-amber-600', REPORTS_PROMO_FORECAST); }
}

async function fetchCLVTrajectorySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(trajectory = 'churning') AS churning,
         math::count(trajectory = 'declining') AS declining,
         math::count(trajectory = 'accelerating') AS accelerating
       FROM clv_trajectory
       WHERE action_taken = 'none'
         AND trajectory != 'stable'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('CLV Trajectory', faChartLine, 'text-blue-600', REPORTS_CLV_TRAJECTORY);
    return {
      title: 'CLV Trajectory',
      icon: faChartLine, color: 'text-blue-600',
      primary: `${c.churning + c.declining} slipping`,
      secondary: `${c.accelerating} growing · ${c.total} actionable`,
      health: c.churning > 0 ? 'critical' : (c.declining > 0 ? 'warning' : 'good'),
      link: REPORTS_CLV_TRAJECTORY, linkLabel: 'View trajectories',
    };
  } catch { return neutralCard('CLV Trajectory', faChartLine, 'text-blue-600', REPORTS_CLV_TRAJECTORY); }
}

async function fetchSpoilageSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level = 'critical') AS critical,
         math::sum(est_spoilage_cost) AS total_cost
       FROM spoilage_prediction
       WHERE will_spoil = true
         AND action_taken = 'none'
         AND predicted_at > time::now() - 24h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Spoilage Prediction', faClockRotateLeft, 'text-amber-600', REPORTS_SPOILAGE_PREDICTION);
    return {
      title: 'Spoilage Prediction',
      icon: faClockRotateLeft, color: 'text-amber-600',
      primary: `${s.critical} critical`,
      secondary: `${s.count} at-risk · ${withCurrency(s.total_cost)} cost`,
      health: s.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_SPOILAGE_PREDICTION, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Spoilage Prediction', faClockRotateLeft, 'text-amber-600', REPORTS_SPOILAGE_PREDICTION); }
}

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
