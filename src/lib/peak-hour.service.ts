/**
 * AI Peak Hour Prediction service — forecast busiest hours.
 *
 * Research finding: Toast Peak Hour Analytics $25+/mo (higher tier), Square
 * Hourly Trends in Plus. POSR offers it free — analyzes historical order
 * patterns to predict peak hours for each day of week + AI recommendations.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export interface HourlyPrediction {
  hour: number;
  predicted_orders: number;
  predicted_revenue: number;
  staffing_needed: number;
}

export interface PeakHourPrediction {
  id?: string;
  day_of_week: number;
  predicted_peak_hour: number;
  predicted_peak_orders: number;
  predicted_peak_revenue: number;
  second_peak_hour?: number;
  quietest_hour: number;
  hourly_breakdown: HourlyPrediction[];
  recommended_staffing?: Array<{ hour: number; staff_count: number; role: string }>;
  prep_schedule?: Array<{ prep_start_hour: number; items_to_prep: string; target_completion_hour: number }>;
  ai_insight?: string;
  generated_at: Date;
}

export interface PeakHourConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  ordersPerStaff: number;
}

export const DEFAULT_PEAK_CONFIG: PeakHourConfig = {
  aiEnabled: true,
  lookbackDays: 90,
  ordersPerStaff: 12,
};

export const readPeakConfig = (settings: any): PeakHourConfig => ({
  aiEnabled: settings?.peak_hour_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.peak_hour_lookback_days, 90),
  ordersPerStaff: safeNumber(settings?.peak_hour_orders_per_staff, 12),
});

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------------------
// Data collection — hourly order patterns per day of week
// ---------------------------------------------------------------------------

const collectHourlyPatterns = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<Map<number, Map<number, { orders: number; revenue: number; weeks: number }>>> => {
  // byDayOfWeek → byHour → {orders, revenue, weeks}
  const byDay = new Map<number, Map<number, { orders: number; revenue: number; weeks: number }>>();
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const result = await db.query(
      `SELECT
         time::weekday(created_at) AS dow,
         time::hour(created_at) AS hour,
         count() AS order_count,
         math::sum(total) AS revenue
       FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE
       GROUP BY dow, hour`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const weeks = Math.max(1, Math.floor(lookbackDays / 7));

    for (const row of rows) {
      const dow = safeNumber(row.dow, 0);
      const hour = safeNumber(row.hour, 0);
      if (!byDay.has(dow)) byDay.set(dow, new Map());
      const byHour = byDay.get(dow)!;
      byHour.set(hour, {
        orders: safeNumber(row.order_count, 0) / weeks,
        revenue: safeNumber(row.revenue, 0) / weeks,
        weeks,
      });
    }
  } catch (err) {
    console.error('[peak-hour] collectHourlyPatterns failed', err);
  }

  return byDay;
};

// ---------------------------------------------------------------------------
// Prediction computation
// ---------------------------------------------------------------------------

const computePredictions = (
  byDay: Map<number, Map<number, { orders: number; revenue: number; weeks: number }>>,
  config: PeakHourConfig
): PeakHourPrediction[] => {
  const predictions: PeakHourPrediction[] = [];

  for (let dow = 0; dow < 7; dow++) {
    const byHour = byDay.get(dow) ?? new Map<number, { orders: number; revenue: number; weeks: number }>();
    if (byHour.size === 0) continue;

    // Build hourly breakdown for operating hours (8AM-11PM)
    const hourlyBreakdown: HourlyPrediction[] = [];
    let peakHour = 8;
    let peakOrders = 0;
    let peakRevenue = 0;
    let secondPeakHour: number | undefined;
    let secondPeakOrders = 0;
    let quietestHour = 8;
    let quietestOrders = Infinity;

    for (let h = 8; h < 23; h++) {
      const data = byHour.get(h);
      const orders = data?.orders ?? 0;
      const revenue = data?.revenue ?? 0;
      const staffingNeeded = Math.max(2, Math.ceil(orders / config.ordersPerStaff));

      hourlyBreakdown.push({
        hour: h,
        predicted_orders: Math.round(orders * 10) / 10,
        predicted_revenue: Math.round(revenue * 100) / 100,
        staffing_needed: staffingNeeded,
      });

      if (orders > peakOrders) {
        secondPeakHour = peakHour;
        secondPeakOrders = peakOrders;
        peakHour = h;
        peakOrders = orders;
        peakRevenue = revenue;
      } else if (orders > secondPeakOrders) {
        secondPeakHour = h;
        secondPeakOrders = orders;
      }

      if (orders < quietestOrders && orders > 0) {
        quietestHour = h;
        quietestOrders = orders;
      }
    }

    // Recommended staffing (simplified: floor/kitchen/server)
    const recommendedStaffing = hourlyBreakdown.map(h => ({
      hour: h.hour,
      staff_count: h.staffing_needed,
      role: h.staffing_needed >= 5 ? 'full_team' : h.staffing_needed >= 3 ? 'standard' : 'skeleton',
    }));

    // Prep schedule: start prep 2 hours before peak
    const prepStart = Math.max(6, peakHour - 2);
    const prepSchedule = [
      { prep_start_hour: prepStart, items_to_prep: 'Peak hour prep (sauces, dough, pre-portion)', target_completion_hour: peakHour },
    ];

    predictions.push({
      day_of_week: dow,
      predicted_peak_hour: peakHour,
      predicted_peak_orders: Math.round(peakOrders * 10) / 10,
      predicted_peak_revenue: Math.round(peakRevenue * 100) / 100,
      second_peak_hour: secondPeakHour,
      quietest_hour: quietestHour,
      hourly_breakdown: hourlyBreakdown,
      recommended_staffing: recommendedStaffing,
      prep_schedule: prepSchedule,
      generated_at: new Date(),
    });
  }

  return predictions;
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  predictions: PeakHourPrediction[],
  _config: PeakHourConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[peak-hour] OpenAI not available — skipping AI');
    return;
  }

  const prompt = `You are a restaurant operations expert.
Analyze these peak hour predictions and provide operational insights.

Predictions (JSON):
${JSON.stringify(predictions.map(p => ({
  day: DAY_NAMES[p.day_of_week],
  peak_hour: `${p.predicted_peak_hour}:00`,
  peak_orders: p.predicted_peak_orders,
  second_peak: p.second_peak_hour !== undefined ? `${p.second_peak_hour}:00` : 'none',
  quietest: `${p.quietest_hour}:00`,
  peak_revenue: p.predicted_peak_revenue,
})), null, 2)}

Respond with JSON array:
[{
  "day": "<match day name>",
  "insight": "<max 200 chars — operational insight for this day's pattern>"
}]

Focus on: staffing strategy, prep timing, break scheduling.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant operations AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ day: string; insight?: string }>;

    for (const item of parsed) {
      const pred = predictions.find(p => DAY_NAMES[p.day_of_week] === item.day);
      if (!pred) continue;
      if (item.insight) pred.ai_insight = item.insight.slice(0, 200);
    }
  } catch (err) {
    console.warn('[peak-hour] AI enhancement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const generatePeakHourPredictions = async (
  db: ReturnType<typeof useDB>,
  config: PeakHourConfig = DEFAULT_PEAK_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ predictions: PeakHourPrediction[] }> => {
  if (onProgress) onProgress(0, 3);

  const byDay = await collectHourlyPatterns(db, config.lookbackDays);
  if (onProgress) onProgress(1, 3);

  const predictions = computePredictions(byDay, config);
  if (onProgress) onProgress(2, 3);

  if (config.aiEnabled && predictions.length > 0) {
    await enhanceWithAI(predictions, config);
  }
  if (onProgress) onProgress(3, 3);

  // Persist
  try {
    await db.query(`UPDATE peak_hour_prediction SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const pred of predictions) {
      try {
        await db.query(`CREATE peak_hour_prediction CONTENT $data`, {
          data: {
            ...pred,
            generated_at: pred.generated_at.toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });
      } catch {
        // Non-fatal
      }
    }
  } catch (err) {
    console.warn('[peak-hour] persist failed', err);
  }

  return { predictions };
};

export const getPeakHourPredictions = async (
  db: ReturnType<typeof useDB>
): Promise<PeakHourPrediction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM peak_hour_prediction
       WHERE expires_at > time::now()
       ORDER BY day_of_week ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[peak-hour] getPeakHourPredictions failed', err);
    return [];
  }
};

export { DAY_NAMES };
