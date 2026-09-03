/**
 * AI Revenue Per Available Seat Hour (RevPASH) Analysis service.
 *
 * Unique to POSR — Toast and Square don't have this hotel-industry metric
 * adapted for restaurants. RevPASH = total_revenue / (total_seats × open_hours).
 *
 * Benchmarks:
 *   < $2/hr  = F (critical — restaurant likely losing money)
 *   $2-5     = D (poor — significant capacity waste)
 *   $5-10    = C (average — room for optimization)
 *   $10-20   = B (good — efficient operation)
 *   > $20    = A (excellent — maximizing seat monetization)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type RevPASHGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface RevPASHAnalysis {
  id?: string;
  analysis_date: Date;
  period_start: Date;
  period_end: Date;
  total_revenue: number;
  total_seats: number;
  open_hours_per_day: number;
  total_operating_hours: number;
  revpash: number;
  avg_seat_utilization: number;
  revenue_per_occupied_seat: number;
  total_orders: number;
  avg_order_value: number;
  hourly_breakdown?: Array<{ hour: number; revenue: number; seats_occupied: number; revpash: number; utilization: number }>;
  daily_breakdown?: Array<{ day_of_week: number; revenue: number; revpash: number; utilization: number }>;
  benchmark_grade: RevPASHGrade;
  ai_insight?: string;
  ai_recommendations: string[];
  projected_revenue_uplift?: number;
  generated_at: Date;
}

export interface RevPASHConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  openHoursPerDay: number;
  targetRevPASH: number;
}

export const DEFAULT_REVPASH_CONFIG: RevPASHConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  openHoursPerDay: 15,
  targetRevPASH: 10,
};

export const readRevPASHConfig = (settings: any): RevPASHConfig => ({
  aiEnabled: settings?.revpash_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.revpash_lookback_days, 30),
  openHoursPerDay: safeNumber(settings?.revpash_open_hours_per_day, 15),
  targetRevPASH: safeNumber(settings?.revpash_target_revpash, 10),
});

const computeGrade = (revpash: number): RevPASHGrade => {
  if (revpash > 20) return 'A';
  if (revpash > 10) return 'B';
  if (revpash > 5) return 'C';
  if (revpash > 2) return 'D';
  return 'F';
};

export const analyzeRevPASH = async (
  db: ReturnType<typeof useDB>,
  config: RevPASHConfig = DEFAULT_REVPASH_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<RevPASHAnalysis | null> => {
  if (onProgress) onProgress(0, 3);

  const cutoff = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);

  // 1. Fetch total seats from tables
  let totalSeats = 0;
  try {
    const result = await db.query(`SELECT math::sum(capacity) AS total FROM floor_table WHERE deleted_at IS NONE AND is_block != true`);
    const rows = Array.isArray(result) ? result.flat() : [];
    totalSeats = safeNumber(rows[0]?.total, 0);
  } catch {
    // Fallback: estimate from count
    try {
      const countResult = await db.query(`SELECT count() AS count FROM floor_table WHERE deleted_at IS NONE`);
      const countRows = Array.isArray(countResult) ? countResult.flat() : [];
      totalSeats = safeNumber(countRows[0]?.count, 0) * 4; // assume avg 4 seats/table
    } catch { /* keep 0 */ }
  }

  // 2. Fetch orders with table info
  let totalRevenue = 0;
  let totalOrders = 0;
  let totalOrderValue = 0;
  const byHour = new Map<number, { revenue: number; orders: number; seatsUsed: number }>();
  const byDay = new Map<number, { revenue: number; orders: number }>();

  try {
    const result = await db.query(
      `SELECT total, created_at, table.id AS table_id, table.capacity AS table_capacity, covers
       FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE AND table != NONE
       FETCH table`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const order of rows) {
      const total = safeNumber(order.total, 0);
      const covers = safeNumber(order.covers, 0);
      const tableCapacity = safeNumber(order.table_capacity, 4);
      const hour = new Date(order.created_at).getHours();
      const dow = new Date(order.created_at).getDay();

      totalRevenue += total;
      totalOrders++;
      totalOrderValue += total;

      if (!byHour.has(hour)) byHour.set(hour, { revenue: 0, orders: 0, seatsUsed: 0 });
      byHour.get(hour)!.revenue += total;
      byHour.get(hour)!.orders++;
      byHour.get(hour)!.seatsUsed += Math.max(covers, tableCapacity > 0 ? 1 : 0);

      if (!byDay.has(dow)) byDay.set(dow, { revenue: 0, orders: 0 });
      byDay.get(dow)!.revenue += total;
      byDay.get(dow)!.orders++;
    }
  } catch (err) {
    console.error('[revpash] fetch orders failed', err);
    return null;
  }
  if (onProgress) onProgress(1, 3);

  if (totalSeats === 0 || totalOrders === 0) return null;

  // 3. Compute metrics
  const days = config.lookbackDays;
  const totalOperatingHours = days * config.openHoursPerDay;
  const revpash = totalOperatingHours > 0 ? totalRevenue / (totalSeats * totalOperatingHours) : 0;
  const avgOrderValue = totalOrders > 0 ? totalOrderValue / totalOrders : 0;

  // Avg seat utilization: estimate from orders
  // Each order occupies ~1 table for ~45 min = 0.75h
  const avgSeatUtilization = totalOperatingHours > 0
    ? Math.min(1, (totalOrders * 0.75) / (totalSeats * totalOperatingHours))
    : 0;
  const revenuePerOccupiedSeat = avgSeatUtilization > 0
    ? totalRevenue / (totalSeats * totalOperatingHours * avgSeatUtilization)
    : 0;

  // Hourly breakdown
  const hourlyBreakdown = [];
  for (let h = 8; h < 23; h++) {
    const data = byHour.get(h);
    const hourRevenue = data?.revenue ?? 0;
    const hourOrders = data?.orders ?? 0;
    const seatsUsed = data?.seatsUsed ?? 0;
    const hourRevPASH = totalSeats > 0 ? hourRevenue / (totalSeats * days) : 0;
    const utilization = totalSeats > 0 ? Math.min(1, seatsUsed / (totalSeats * days)) : 0;
    hourlyBreakdown.push({
      hour: h,
      revenue: Math.round(hourRevenue * 100) / 100,
      seats_occupied: seatsUsed,
      revpash: Math.round(hourRevPASH * 100) / 100,
      utilization: Math.round(utilization * 100) / 100,
    });
  }

  // Daily breakdown
  const dailyBreakdown = [];
  for (let d = 0; d < 7; d++) {
    const data = byDay.get(d);
    const dayRevenue = data?.revenue ?? 0;
    const dayRevPASH = totalSeats > 0 ? dayRevenue / (totalSeats * (days / 7) * config.openHoursPerDay) : 0;
    const dayOrders = data?.orders ?? 0;
    const utilization = totalSeats > 0 ? Math.min(1, (dayOrders * 0.75) / (totalSeats * (days / 7) * config.openHoursPerDay)) : 0;
    dailyBreakdown.push({
      day_of_week: d,
      revenue: Math.round(dayRevenue * 100) / 100,
      revpash: Math.round(dayRevPASH * 100) / 100,
      utilization: Math.round(utilization * 100) / 100,
    });
  }

  const grade = computeGrade(revpash);

  const analysis: RevPASHAnalysis = {
    analysis_date: new Date(),
    period_start: new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000),
    period_end: new Date(),
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_seats: totalSeats,
    open_hours_per_day: config.openHoursPerDay,
    total_operating_hours: Math.round(totalOperatingHours),
    revpash: Math.round(revpash * 100) / 100,
    avg_seat_utilization: Math.round(avgSeatUtilization * 100) / 100,
    revenue_per_occupied_seat: Math.round(revenuePerOccupiedSeat * 100) / 100,
    total_orders: totalOrders,
    avg_order_value: Math.round(avgOrderValue * 100) / 100,
    hourly_breakdown: hourlyBreakdown,
    daily_breakdown: dailyBreakdown,
    benchmark_grade: grade,
    ai_recommendations: [],
    generated_at: new Date(),
  };
  if (onProgress) onProgress(2, 3);

  // 4. AI enhancement
  if (config.aiEnabled) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const worstHours = [...hourlyBreakdown].sort((a, b) => a.revpash - b.revpash).slice(0, 5);
      const bestHours = [...hourlyBreakdown].sort((a, b) => b.revpash - a.revpash).slice(0, 5);

      const prompt = `You are a restaurant capacity optimization expert.
Analyze this RevPASH (Revenue Per Available Seat Hour) data and provide insights.

RevPASH: $${analysis.revpash}/seat/hour (Grade: ${grade})
Total revenue: $${analysis.total_revenue}
Total seats: ${analysis.total_seats}
Operating hours: ${analysis.total_operating_hours}
Seat utilization: ${(analysis.avg_seat_utilization * 100).toFixed(0)}%
Revenue per occupied seat: $${analysis.revenue_per_occupied_seat}
Total orders: ${analysis.total_orders}
Avg order value: $${analysis.avg_order_value}

Worst performing hours:
${JSON.stringify(worstHours, null, 2)}

Best performing hours:
${JSON.stringify(bestHours, null, 2)}

Respond with JSON:
{
  "insight": "<max 300 chars — overall RevPASH assessment + what drives it>",
  "recommendations": ["<max 200 chars each — actionable steps to improve RevPASH>"],
  "projected_revenue_uplift": <number — estimated monthly revenue increase if recommendations followed>
}`;

      try {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a restaurant capacity optimization AI. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ], { temperature: 0.3, maxTokens: 600 });

        const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          analysis.ai_insight = parsed.insight;
          analysis.ai_recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
          analysis.projected_revenue_uplift = parsed.projected_revenue_uplift;
        }
      } catch (err) {
        console.warn('[revpash] AI failed', err);
      }
    }
  }
  if (onProgress) onProgress(3, 3);

  // 5. Persist
  try {
    await db.query(`UPDATE revpash_analysis SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    await db.query(`CREATE revpash_analysis CONTENT $data`, {
      data: {
        ...analysis,
        analysis_date: analysis.analysis_date.toISOString(),
        period_start: analysis.period_start.toISOString(),
        period_end: analysis.period_end.toISOString(),
        generated_at: analysis.generated_at.toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  } catch (err) {
    console.warn('[revpash] persist failed', err);
  }

  return analysis;
};

export const getLatestRevPASH = async (
  db: ReturnType<typeof useDB>
): Promise<RevPASHAnalysis | null> => {
  try {
    const result = await db.query(
      `SELECT * FROM revpash_analysis
       WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    return list[0] ?? null;
  } catch (err) {
    console.error('[revpash] getLatest failed', err);
    return null;
  }
};
