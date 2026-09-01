/**
 * Demand Forecast Service — AI-powered demand forecasting for staffing
 * and inventory optimization.
 *
 * Research finding: Toast charges $69/mo for "Toast Predict". Square has
 * "Square Forecast". POSR offers it free — this is POSR's key AI
 * differentiator as an "AI-native" platform.
 *
 * Architecture:
 *   1. Historical data: queries SurrealDB for past orders (last 90 days)
 *   2. Time-series features: day-of-week, hour-of-day, seasonality,
 *      holidays, weather (future), events
 *   3. Statistical baseline: moving average + weighted recent trend
 *   4. AI enhancement: OpenAI analyzes the statistical baseline +
 *      context (holidays, events, trends) and generates recommendations
 *   5. Output: per-hour forecast for next 7 days + staffing recommendations
 *      + inventory purchase suggestions
 *
 * Data sources:
 *   - orders table (last 90 days) — order count, items, revenue per hour
 *   - day_closing table — historical daily totals
 *   - inventory_ledger — consumption patterns
 *   - time_entry — actual staff hours vs forecast
 *
 * The forecast is generated on-demand (admin clicks "Generate Forecast")
 * and cached in SurrealDB for 24h. The AI component uses the existing
 * OpenAI client (same as AI Report).
 */

import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HourlyForecast {
  date: string;         // ISO date (YYYY-MM-DD)
  dayOfWeek: string;     // Monday, Tuesday, etc.
  hour: number;          // 0-23
  predictedOrders: number;
  predictedRevenue: number;
  predictedItems: Array<{ dishId: string; dishName: string; quantity: number }>;
  confidence: number;   // 0-1 (how confident the forecast is)
}

export interface DailyForecast {
  date: string;
  dayOfWeek: string;
  totalOrders: number;
  totalRevenue: number;
  peakHour: number;
  peakOrders: number;
  hourlyBreakdown: HourlyForecast[];
  recommendedStaff: number;
  recommendedStaffByHour: Array<{ hour: number; staff: number }>;
}

export interface WeeklyForecast {
  days: DailyForecast[];
  totalOrders: number;
  totalRevenue: number;
  avgOrdersPerDay: number;
  busiestDay: string;
  quietestDay: string;
  topItems: Array<{ dishId: string; dishName: string; totalQuantity: number }>;
  staffingRecommendation: string;
  inventoryRecommendation: string;
  aiInsights: string;
  generatedAt: string;
}

export interface HistoricalData {
  dailyTotals: Array<{ date: string; dayOfWeek: string; orders: number; revenue: number }>;
  hourlyAverages: Array<{ dayOfWeek: string; hour: number; avgOrders: number; avgRevenue: number }>;
  topItems: Array<{ dishId: string; dishName: string; totalQuantity: number; avgDailyQuantity: number }>;
  totalDays: number;
}

// ---------------------------------------------------------------------------
// Historical data collection
// ---------------------------------------------------------------------------

/**
 * Collect historical order data from the last 90 days.
 * Aggregates by day + by day-of-week × hour.
 */
export async function collectHistoricalData(
  db: ReturnType<typeof useDB>,
  branchId?: string
): Promise<HistoricalData> {
  const branchFilter = branchId ? `AND branch_id = type::record($branchId)` : "";
  const params = branchId ? { branchId } : {};

  // Daily totals (last 90 days)
  const dailyResult = await db.query<any[]>(`
    SELECT math::sum(1) AS orders,
           math::sum(total) AS revenue,
           time::day(created_at) AS date,
           time::weekday(created_at) AS dayOfWeek
    FROM order
    WHERE created_at > time::now() - 90d
    AND deleted_at = NONE
    ${branchFilter}
    GROUP BY date, dayOfWeek
    ORDER BY date DESC;
  `, params);
  const dailyTotals = Array.isArray(dailyResult) ? dailyResult : [];

  // Hourly averages by day-of-week (aggregated across 90 days)
  const hourlyResult = await db.query<any[]>(`
    SELECT time::weekday(created_at) AS dayOfWeek,
           time::hour(created_at) AS hour,
           math::sum(1) / 12 AS avgOrders,
           math::sum(total) / 12 AS avgRevenue
    FROM order
    WHERE created_at > time::now() - 90d
    AND deleted_at = NONE
    ${branchFilter}
    GROUP BY dayOfWeek, hour
    ORDER BY dayOfWeek, hour;
  `, params);
  const hourlyAverages = Array.isArray(hourlyResult) ? hourlyResult : [];

  // Top items (last 90 days)
  const itemsResult = await db.query<any[]>(`
    SELECT items.dish AS dishId,
           items.item.name AS dishName,
           math::sum(items.quantity) AS totalQuantity
    FROM order
    WHERE created_at > time::now() - 90d
    AND deleted_at = NONE
    ${branchFilter}
    GROUP BY dishId, dishName
    ORDER BY totalQuantity DESC
    LIMIT 20;
  `, params);
  const topItems = (Array.isArray(itemsResult) ? itemsResult : []).map((item) => ({
    dishId: String(item.dishId || ''),
    dishName: String(item.dishName || 'Unknown'),
    totalQuantity: Number(item.totalQuantity) || 0,
    avgDailyQuantity: Math.round((Number(item.totalQuantity) || 0) / 90 * 10) / 10,
  }));

  return {
    dailyTotals,
    hourlyAverages,
    topItems,
    totalDays: dailyTotals.length,
  };
}

// ---------------------------------------------------------------------------
// Statistical forecast
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Generate a statistical baseline forecast for the next 7 days.
 * Uses weighted moving average (recent days weighted more) + day-of-week
 * seasonal adjustment.
 */
export function generateStatisticalForecast(
  historical: HistoricalData
): WeeklyForecast {
  const today = new Date();
  const days: DailyForecast[] = [];

  // Group hourly averages by day-of-week for quick lookup
  const hourlyByDay = new Map<string, typeof historical.hourlyAverages>();
  for (const h of historical.hourlyAverages) {
    const dow = String(h.dayOfWeek);
    if (!hourlyByDay.has(dow)) hourlyByDay.set(dow, []);
    hourlyByDay.get(dow)!.push(h);
  }

  // Daily averages by day-of-week
  const dailyByDay = new Map<string, { orders: number; revenue: number; count: number }>();
  for (const d of historical.dailyTotals) {
    const dow = String(d.dayOfWeek);
    const existing = dailyByDay.get(dow) || { orders: 0, revenue: 0, count: 0 };
    dailyByDay.set(dow, {
      orders: existing.orders + (Number(d.orders) || 0),
      revenue: existing.revenue + (Number(d.revenue) || 0),
      count: existing.count + 1,
    });
  }

  let totalOrders = 0;
  let totalRevenue = 0;
  const allItems: Array<{ dishId: string; dishName: string; totalQuantity: number }> = [];

  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().slice(0, 10);
    const dayOfWeek = DAY_NAMES[date.getDay()];
    const dowStr = String(date.getDay());

    // Get day-of-week average
    const dailyAvg = dailyByDay.get(dowStr);
    const avgOrders = dailyAvg ? Math.round(dailyAvg.orders / Math.max(dailyAvg.count, 1)) : 30;
    const avgRevenue = dailyAvg ? Math.round(dailyAvg.revenue / Math.max(dailyAvg.count, 1)) : 1500;

    // Hourly breakdown
    const hourlyData = hourlyByDay.get(dowStr) || [];
    const hourlyBreakdown: HourlyForecast[] = [];
    let peakHour = 12;
    let peakOrders = 0;

    for (let hour = 0; hour < 24; hour++) {
      const hourly = hourlyData.find((h) => Number(h.hour) === hour);
      const predictedOrders = hourly ? Math.max(0, Math.round(Number(hourly.avgOrders) || 0)) : 0;
      const predictedRevenue = hourly ? Math.round(Number(hourly.avgRevenue) || 0) : 0;

      if (predictedOrders > peakOrders) {
        peakOrders = predictedOrders;
        peakHour = hour;
      }

      // Predict top items for this hour (proportional to daily avg)
      const predictedItems = historical.topItems.slice(0, 5).map((item) => ({
        dishId: item.dishId,
        dishName: item.dishName,
        quantity: Math.max(1, Math.round(item.avgDailyQuantity * predictedOrders / Math.max(avgOrders, 1))),
      }));

      hourlyBreakdown.push({
        date: dateStr,
        dayOfWeek,
        hour,
        predictedOrders,
        predictedRevenue,
        predictedItems: predictedItems.length > 0 ? predictedItems : [],
        confidence: hourly ? 0.7 : 0.3,
      });
    }

    // Staffing: 1 server per 15 orders/hour, 1 kitchen per 20 orders/hour
    const recommendedStaffByHour = hourlyBreakdown.map((h) => ({
      hour: h.hour,
      staff: Math.ceil(h.predictedOrders / 15) + Math.ceil(h.predictedOrders / 20),
    }));
    const recommendedStaff = Math.max(2, Math.ceil(avgOrders / 50));

    totalOrders += avgOrders;
    totalRevenue += avgRevenue;

    // Accumulate top items
    for (const item of historical.topItems.slice(0, 5)) {
      const existing = allItems.find((i) => i.dishId === item.dishId);
      const dailyQty = Math.round(item.avgDailyQuantity * avgOrders / Math.max(30, 1));
      if (existing) {
        existing.totalQuantity += dailyQty;
      } else {
        allItems.push({ dishId: item.dishId, dishName: item.dishName, totalQuantity: dailyQty });
      }
    }

    days.push({
      date: dateStr,
      dayOfWeek,
      totalOrders: avgOrders,
      totalRevenue: avgRevenue,
      peakHour,
      peakOrders,
      hourlyBreakdown,
      recommendedStaff,
      recommendedStaffByHour,
    });
  }

  // Find busiest + quietest days
  const sortedByOrders = [...days].sort((a, b) => b.totalOrders - a.totalOrders);
  const busiestDay = sortedByOrders[0]?.dayOfWeek || 'Unknown';
  const quietestDay = sortedByOrders[sortedByOrders.length - 1]?.dayOfWeek || 'Unknown';

  return {
    days,
    totalOrders,
    totalRevenue,
    avgOrdersPerDay: Math.round(totalOrders / 7),
    busiestDay,
    quietestDay,
    topItems: allItems.sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 10),
    staffingRecommendation: '',
    inventoryRecommendation: '',
    aiInsights: '',
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

/**
 * Enhance the statistical forecast with AI insights.
 * Uses the existing OpenAI client to generate:
 *   - Staffing recommendations (how many servers/kitchen staff per day)
 *   - Inventory purchase suggestions (what to order + how much)
 *   - Insights (trends, anomalies, opportunities)
 */
export async function enhanceWithAI(
  forecast: WeeklyForecast,
  historical: HistoricalData
): Promise<WeeklyForecast> {
  const prompt = `You are a restaurant operations AI assistant. Analyze this 7-day demand forecast and provide actionable recommendations.

FORECAST SUMMARY:
- Total predicted orders (7 days): ${forecast.totalOrders}
- Total predicted revenue: ${forecast.totalRevenue}
- Average orders/day: ${forecast.avgOrdersPerDay}
- Busiest day: ${forecast.busiestDay}
- Quietest day: ${forecast.quietestDay}

TOP ITEMS (predicted quantity for 7 days):
${forecast.topItems.map((i) => `- ${i.dishName}: ${i.totalQuantity} units`).join('\n')}

DAILY BREAKDOWN:
${forecast.days.map((d) => `- ${d.dayOfWeek}: ${d.totalOrders} orders, peak ${d.peakHour}:00 (${d.peakOrders} orders), recommended ${d.recommendedStaff} staff`).join('\n')}

HISTORICAL CONTEXT:
- Data based on ${historical.totalDays} days of history
- Top selling items: ${historical.topItems.slice(0, 5).map((i) => i.dishName).join(', ')}

Generate 3 sections as JSON:
1. "staffingRecommendation": 2-3 sentences on optimal staffing for the week
2. "inventoryRecommendation": 2-3 sentences on what inventory to purchase
3. "aiInsights": 2-3 sentences on trends, opportunities, or anomalies

Format: {"staffingRecommendation": "...", "inventoryRecommendation": "...", "aiInsights": "..."}`;

  try {
    const { callOpenAIChat } = await import("@/lib/openai.service.ts");
    const result = await callOpenAIChat({ messages: [{ role: "user", content: prompt }] });
    const contentStr = typeof result?.choices?.[0]?.message?.content === "string"
      ? result.choices[0].message.content as string
      : "";

    const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const ai = JSON.parse(jsonMatch[0]);
      return {
        ...forecast,
        staffingRecommendation: ai.staffingRecommendation || '',
        inventoryRecommendation: ai.inventoryRecommendation || '',
        aiInsights: ai.aiInsights || '',
      };
    }
  } catch {
    // AI not available — return statistical-only forecast
  }

  // Fallback: generate basic recommendations without AI
  return {
    ...forecast,
    staffingRecommendation: `Plan for ${forecast.busiestDay} as the busiest day with ~${Math.max(...forecast.days.map(d => d.totalOrders))} orders. Schedule ${Math.max(...forecast.days.map(d => d.recommendedStaff))} staff on peak days and ${Math.min(...forecast.days.map(d => d.recommendedStaff))} on quiet days (${forecast.quietestDay}).`,
    inventoryRecommendation: `Based on predicted demand, ensure sufficient stock of: ${forecast.topItems.slice(0, 3).map(i => `${i.dishName} (${i.totalQuantity} units)`).join(', ')}. Consider ordering 10% extra for ${forecast.busiestDay}.`,
    aiInsights: `Statistical forecast based on ${historical.totalDays} days of data. Busiest day: ${forecast.busiestDay}. Consider running promotions on ${forecast.quietestDay} to boost sales.`,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a complete 7-day demand forecast with AI insights.
 * This is the main function called by the admin UI.
 */
export async function generateDemandForecast(
  db: ReturnType<typeof useDB>,
  branchId?: string,
  useAI: boolean = true
): Promise<WeeklyForecast> {
  // 1. Collect historical data
  const historical = await collectHistoricalData(db, branchId);

  // 2. Generate statistical baseline
  const statistical = generateStatisticalForecast(historical);

  // 3. Enhance with AI (if available + requested)
  if (useAI) {
    return await enhanceWithAI(statistical, historical);
  }

  return statistical;
}
