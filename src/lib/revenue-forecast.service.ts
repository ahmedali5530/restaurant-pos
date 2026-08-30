/**
 * AI Revenue Forecasting Enhancement — 90-day revenue projection.
 *
 * Combines demand forecast + seasonal trends + day-of-week patterns
 * for a comprehensive 90-day revenue projection with AI insights.
 * More detailed than the existing demand-forecast.service (7-day only).
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface RevenueForecast {
  id?: string;
  forecast_date: Date;
  forecast_days: number;
  total_projected_revenue: number;
  total_projected_orders: number;
  avg_daily_revenue: number;
  projected_peak_day?: string;
  projected_peak_revenue?: number;
  projected_quiet_day?: string;
  confidence_score: number;
  daily_breakdown?: Array<{ date: string; day_of_week: number; projected_revenue: number; projected_orders: number; is_weekend: boolean; is_peak: boolean }>;
  weekly_breakdown?: Array<{ week: number; revenue: number; orders: number; growth_pct: number }>;
  monthly_breakdown?: Array<{ month: string; revenue: number; orders: number; season: string }>;
  ai_insight?: string;
  ai_recommendations: string[];
  generated_at: Date;
}

export interface RevForecastConfig {
  aiEnabled: boolean;
  forecastDays: number;
}

export const DEFAULT_REVFC_CONFIG: RevForecastConfig = {
  aiEnabled: true,
  forecastDays: 90,
};

export const readRevFcConfig = (settings: any): RevForecastConfig => ({
  aiEnabled: settings?.rev_forecast_ai_enabled ?? true,
  forecastDays: safeNumber(settings?.rev_forecast_days, 90),
});

const getSeason = (month: number): string => {
  if (month === 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'fall';
};

export const generateRevenueForecast = async (
  db: ReturnType<typeof useDB>,
  config: RevForecastConfig = DEFAULT_REVFC_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<RevenueForecast | null> => {
  if (onProgress) onProgress(0, 3);

  // 1. Fetch historical data (last 90 days for DOW patterns + last 365 for seasonal)
  const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const cutoff365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  // DOW revenue averages (last 90 days)
  const dowAverages = new Array(7).fill(0).map(() => ({ revenue: 0, orders: 0, count: 0 }));
  let totalDailyRevenue = 0;
  let totalDays = 0;

  try {
    const result = await db.query(
      `SELECT total, created_at FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE`,
      { cutoff: cutoff90.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const byDate = new Map<string, { revenue: number; orders: number }>();
    for (const order of rows) {
      const date = new Date(order.created_at);
      const dow = date.getDay();
      const total = safeNumber(order.total, 0);
      dowAverages[dow].revenue += total;
      dowAverages[dow].orders++;
      const dateKey = date.toISOString().split('T')[0];
      if (!byDate.has(dateKey)) byDate.set(dateKey, { revenue: 0, orders: 0 });
      byDate.get(dateKey)!.revenue += total;
      byDate.get(dateKey)!.orders++;
    }
    for (const [date, data] of byDate) {
      totalDailyRevenue += data.revenue;
      totalDays++;
    }
    // Average per DOW occurrence
    for (let d = 0; d < 7; d++) {
      const occurrences = Math.max(1, dowAverages[d].orders > 0 ? Math.ceil(dowAverages[d].orders / 20) : 1);
      dowAverages[d].revenue = dowAverages[d].revenue / occurrences;
      dowAverages[d].orders = Math.round(dowAverages[d].orders / occurrences);
    }
  } catch (err) {
    console.error('[rev-forecast] fetch failed', err);
    return null;
  }
  if (onProgress) onProgress(1, 3);

  // 2. Fetch seasonal multipliers (monthly avg vs overall avg)
  let seasonalMultiplier = 1.0;
  try {
    const monthlyResult = await db.query(
      `SELECT time::month(created_at) AS month, math::sum(total) AS revenue
       FROM order WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE
       GROUP BY month`,
      { cutoff: cutoff365.toISOString() }
    );
    const monthlyRows = Array.isArray(monthlyResult) ? monthlyResult.flat() : [];
    if (monthlyRows.length > 0) {
      const monthlyAvg = monthlyRows.reduce((s: number, r: any) => s + safeNumber(r.revenue, 0), 0) / monthlyRows.length;
      const currentMonth = new Date().getMonth() + 1;
      const currentMonthData = monthlyRows.find((r: any) => safeNumber(r.month, 0) === currentMonth);
      if (currentMonthData && monthlyAvg > 0) {
        seasonalMultiplier = safeNumber(currentMonthData.revenue, 0) / monthlyAvg;
      }
    }
  } catch { /* keep 1.0 */ }

  // 3. Build 90-day projection
  const avgDaily = totalDays > 0 ? totalDailyRevenue / totalDays : 0;
  const dailyBreakdown: Array<{ date: string; day_of_week: number; projected_revenue: number; projected_orders: number; is_weekend: boolean; is_peak: boolean }> = [];
  let totalRevenue = 0;
  let totalOrders = 0;
  let peakDay = '';
  let peakRevenue = 0;
  let quietDay = '';
  let quietRevenue = Infinity;

  const now = new Date();
  for (let i = 0; i < config.forecastDays; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;

    // Project: DOW average × seasonal multiplier
    const dowRev = dowAverages[dow].revenue || avgDaily;
    const projectedRevenue = Math.round(dowRev * seasonalMultiplier * 100) / 100;
    const projectedOrders = Math.round((dowAverages[dow].orders || 10) * seasonalMultiplier);
    const isPeak = projectedRevenue > avgDaily * 1.2;

    dailyBreakdown.push({
      date: date.toISOString().split('T')[0],
      day_of_week: dow,
      projected_revenue: projectedRevenue,
      projected_orders: projectedOrders,
      is_weekend: isWeekend,
      is_peak: isPeak,
    });

    totalRevenue += projectedRevenue;
    totalOrders += projectedOrders;

    if (projectedRevenue > peakRevenue) { peakRevenue = projectedRevenue; peakDay = date.toISOString().split('T')[0]; }
    if (projectedRevenue < quietRevenue) { quietRevenue = projectedRevenue; quietDay = date.toISOString().split('T')[0]; }
  }

  // Weekly breakdown
  const weeklyBreakdown: Array<{ week: number; revenue: number; orders: number; growth_pct: number }> = [];
  const weeks = Math.ceil(config.forecastDays / 7);
  let prevWeekRev = 0;
  for (let w = 0; w < weeks; w++) {
    const start = w * 7;
    const end = Math.min(start + 7, config.forecastDays);
    const weekDays = dailyBreakdown.slice(start, end);
    const weekRev = weekDays.reduce((s, d) => s + d.projected_revenue, 0);
    const weekOrders = weekDays.reduce((s, d) => s + d.projected_orders, 0);
    const growth = prevWeekRev > 0 ? ((weekRev - prevWeekRev) / prevWeekRev) * 100 : 0;
    weeklyBreakdown.push({ week: w + 1, revenue: Math.round(weekRev * 100) / 100, orders: weekOrders, growth_pct: Math.round(growth * 10) / 10 });
    prevWeekRev = weekRev;
  }

  // Monthly breakdown
  const monthlyBreakdown: Array<{ month: string; revenue: number; orders: number; season: string }> = [];
  const byMonth = new Map<string, { revenue: number; orders: number }>();
  for (const d of dailyBreakdown) {
    const date = new Date(d.date);
    const monthKey = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, { revenue: 0, orders: 0 });
    byMonth.get(monthKey)!.revenue += d.projected_revenue;
    byMonth.get(monthKey)!.orders += d.projected_orders;
  }
  for (const [month, data] of byMonth) {
    const monthNum = new Date(month + ' 1').getMonth() + 1;
    monthlyBreakdown.push({ month, revenue: Math.round(data.revenue * 100) / 100, orders: data.orders, season: getSeason(monthNum) });
  }

  const forecast: RevenueForecast = {
    forecast_date: now,
    forecast_days: config.forecastDays,
    total_projected_revenue: Math.round(totalRevenue * 100) / 100,
    total_projected_orders: totalOrders,
    avg_daily_revenue: Math.round((totalRevenue / config.forecastDays) * 100) / 100,
    projected_peak_day: peakDay,
    projected_peak_revenue: Math.round(peakRevenue * 100) / 100,
    projected_quiet_day: quietDay,
    confidence_score: 0.75,
    daily_breakdown: dailyBreakdown,
    weekly_breakdown: weeklyBreakdown,
    monthly_breakdown: monthlyBreakdown,
    ai_recommendations: [],
    generated_at: now,
  };
  if (onProgress) onProgress(2, 3);

  // 4. AI enhancement
  if (config.aiEnabled) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const prompt = `You are a restaurant revenue forecasting expert.
Analyze this 90-day revenue forecast and provide insights.

Total projected revenue: $${forecast.total_projected_revenue}
Total projected orders: ${forecast.total_projected_orders}
Avg daily revenue: $${forecast.avg_daily_revenue}
Peak day: ${forecast.projected_peak_day} ($${forecast.projected_peak_revenue})
Quietest day: ${forecast.projected_quiet_day}
Seasonal multiplier: ${seasonalMultiplier.toFixed(2)}x

Weekly breakdown:
${JSON.stringify(weeklyBreakdown.slice(0, 6), null, 2)}

Monthly breakdown:
${JSON.stringify(monthlyBreakdown, null, 2)}

Respond with JSON:
{
  "insight": "<max 300 chars — overall revenue outlook + key patterns>",
  "recommendations": ["<max 200 chars each — actionable steps to maximize revenue>"]
}`;

      try {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a restaurant revenue forecasting AI. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ], { temperature: 0.3, maxTokens: 600 });

        const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          forecast.ai_insight = parsed.insight;
          forecast.ai_recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
        }
      } catch (err) { console.warn('[rev-forecast] AI failed', err); }
    }
  }
  if (onProgress) onProgress(3, 3);

  // 5. Persist
  try {
    await db.query(`UPDATE revenue_forecast SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    await db.query(`CREATE revenue_forecast CONTENT $data`, {
      data: {
        ...forecast,
        forecast_date: forecast.forecast_date.toISOString(),
        generated_at: forecast.generated_at.toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  } catch (err) { console.warn('[rev-forecast] persist failed', err); }

  return forecast;
};

export const getLatestRevenueForecast = async (
  db: ReturnType<typeof useDB>
): Promise<RevenueForecast | null> => {
  try {
    const result = await db.query(
      `SELECT * FROM revenue_forecast WHERE expires_at > time::now() ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    return list[0] ?? null;
  } catch { return null; }
};
