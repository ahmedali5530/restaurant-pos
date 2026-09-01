/**
 * AI Seasonal Trend Analysis service — month-over-month + year-over-year.
 *
 * Research finding: Toast Seasonal Insights $25+/mo (higher tier), Square
 * doesn't have this. POSR offers it free — analyzes seasonal revenue, order
 * volume, avg ticket, popular items, + AI predictions for upcoming shifts.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export interface SeasonalTrend {
  id?: string;
  month: number;
  month_name: string;
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  unique_customers: number;
  avg_daily_revenue: number;
  peak_day?: string;
  peak_day_revenue?: number;
  top_items?: Array<{ name: string; quantity: number; revenue: number }>;
  yoy_revenue_change?: number;
  yoy_orders_change?: number;
  mom_revenue_change?: number;
  season: string;
  is_peak_season: boolean;
  ai_insight?: string;
  ai_recommendations: string[];
  generated_at: Date;
}

export interface SeasonalConfig {
  aiEnabled: boolean;
  lookbackYears: number;
}

export const DEFAULT_SEASONAL_CONFIG: SeasonalConfig = {
  aiEnabled: true,
  lookbackYears: 2,
};

export const readSeasonalConfig = (settings: any): SeasonalConfig => ({
  aiEnabled: settings?.seasonal_ai_enabled ?? true,
  lookbackYears: safeNumber(settings?.seasonal_lookback_years, 2),
});

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const getSeason = (month: number): string => {
  if (month === 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'fall';
};

export const analyzeSeasonalTrends = async (
  db: ReturnType<typeof useDB>,
  config: SeasonalConfig = DEFAULT_SEASONAL_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ trends: SeasonalTrend[]; insights: string | null }> => {
  if (onProgress) onProgress(0, 3);

  const lookbackDays = config.lookbackYears * 365;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch orders grouped by month
  const byMonth = new Map<number, {
    revenue: number; orders: number; customers: Set<string>;
    byDay: Map<string, number>; items: Map<string, { qty: number; revenue: number }>;
  }>();

  try {
    const result = await db.query(
      `SELECT total, created_at, customer.id AS customer_id, items
       FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE
       FETCH customer, items`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const order of rows) {
      const date = new Date(order.created_at);
      const month = date.getMonth() + 1; // 1-12
      if (!byMonth.has(month)) {
        byMonth.set(month, {
          revenue: 0, orders: 0, customers: new Set(),
          byDay: new Map(), items: new Map(),
        });
      }
      const data = byMonth.get(month)!;
      const total = safeNumber(order.total, 0);
      data.revenue += total;
      data.orders++;
      const cid = order.customer_id?.toString?.();
      if (cid) data.customers.add(cid);

      const dayKey = date.toISOString().split('T')[0];
      data.byDay.set(dayKey, (data.byDay.get(dayKey) ?? 0) + total);

      // Track items
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const name = item?.item?.name ?? item?.name ?? 'Unknown';
          const qty = safeNumber(item?.quantity, 0);
          const price = safeNumber(item?.price ?? item?.item?.price, 0);
          if (!data.items.has(name)) data.items.set(name, { qty: 0, revenue: 0 });
          const it = data.items.get(name)!;
          it.qty += qty;
          it.revenue += qty * price;
        }
      }
    }
  } catch (err) {
    console.error('[seasonal] fetch failed', err);
    return { trends: [], insights: null };
  }
  if (onProgress) onProgress(1, 3);

  // Build trends
  const trends: SeasonalTrend[] = [];
  const avgRevenue = Array.from(byMonth.values()).reduce((s, d) => s + d.revenue, 0) / Math.max(1, byMonth.size);
  const sortedMonths = Array.from(byMonth.keys()).sort((a, b) => a - b);
  let prevRevenue = 0;

  for (const month of sortedMonths) {
    const data = byMonth.get(month)!;
    const avgOrderValue = data.orders > 0 ? data.revenue / data.orders : 0;
    const days = Math.max(1, data.byDay.size);
    const avgDailyRevenue = data.revenue / days;

    // Peak day
    let peakDay: string | undefined;
    let peakRevenue = 0;
    for (const [day, rev] of data.byDay) {
      if (rev > peakRevenue) { peakDay = day; peakRevenue = rev; }
    }

    // Top items
    const topItems = Array.from(data.items.entries())
      .map(([name, v]) => ({ name, quantity: v.qty, revenue: Math.round(v.revenue * 100) / 100 }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const momChange = prevRevenue > 0 ? ((data.revenue - prevRevenue) / prevRevenue) * 100 : 0;
    const isPeakSeason = data.revenue > avgRevenue * 1.15;

    trends.push({
      month,
      month_name: MONTH_NAMES[month - 1],
      total_revenue: Math.round(data.revenue * 100) / 100,
      total_orders: data.orders,
      avg_order_value: Math.round(avgOrderValue * 100) / 100,
      unique_customers: data.customers.size,
      avg_daily_revenue: Math.round(avgDailyRevenue * 100) / 100,
      peak_day: peakDay,
      peak_day_revenue: Math.round(peakRevenue * 100) / 100,
      top_items: topItems,
      mom_revenue_change: Math.round(momChange * 10) / 10,
      season: getSeason(month),
      is_peak_season: isPeakSeason,
      ai_recommendations: [],
      generated_at: new Date(),
    });

    prevRevenue = data.revenue;
  }

  // Sort by month
  trends.sort((a, b) => a.month - b.month);
  if (onProgress) onProgress(2, 3);

  // AI enhancement
  let aiSummary: string | null = null;
  if (config.aiEnabled && trends.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const prompt = `You are a restaurant seasonal trends analyst.
Analyze these monthly trends and provide insights.

Monthly trends (JSON):
${JSON.stringify(trends.map(t => ({
  month: t.month_name,
  revenue: t.total_revenue,
  orders: t.total_orders,
  avg_order: t.avg_order_value,
  daily_avg: t.avg_daily_revenue,
  peak_day: t.peak_day,
  top_item: t.top_items?.[0]?.name ?? 'n/a',
  is_peak: t.is_peak_season,
  mom_change: (t.mom_revenue_change ?? 0) + '%',
})), null, 2)}

Respond with JSON:
{
  "summary": "<max 500 chars — overall seasonal pattern assessment + what to prepare for>",
  "recommendations": ["<max 200 chars each — actionable seasonal steps>"]
}`;

      try {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a restaurant seasonal trends AI. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ], { temperature: 0.3, maxTokens: 800 });

        const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          aiSummary = parsed.summary;
          const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
          // Distribute recommendations to all trends
          for (const t of trends) {
            t.ai_insight = `${parsed.summary?.slice(0, 200) ?? ''}`;
            t.ai_recommendations = recs;
          }
        }
      } catch (err) {
        console.warn('[seasonal] AI failed', err);
      }
    }
  }
  if (onProgress) onProgress(3, 3);

  // Persist
  try {
    await db.query(`UPDATE seasonal_trend SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const t of trends) {
      try {
        await db.query(`CREATE seasonal_trend CONTENT $data`, {
          data: {
            ...t,
            generated_at: t.generated_at.toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });
      } catch { /* non-fatal */ }
    }
  } catch (err) {
    console.warn('[seasonal] persist failed', err);
  }

  return { trends, insights: aiSummary };
};

export const getSeasonalTrends = async (
  db: ReturnType<typeof useDB>
): Promise<SeasonalTrend[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM seasonal_trend WHERE expires_at > time::now() ORDER BY month ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[seasonal] getSeasonalTrends failed', err);
    return [];
  }
};
