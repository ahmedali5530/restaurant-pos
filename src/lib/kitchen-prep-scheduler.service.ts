/**
 * AI Kitchen Prep Scheduler — predict optimal prep start times per dish.
 *
 * 62nd POSR-exclusive differentiator — kitchen timing is the #1 driver of food
 * quality and customer satisfaction (CIA). Starting prep too early → food sits,
 * loses quality. Starting too late → delays, cold food, complaints. Restaurants
 * lose 15-20% of satisfaction to timing issues (NRA).
 *
 * Distinct from:
 *   - kitchen-bottleneck.service (detects bottlenecks AFTER they happen — NOT
 *     predictive prep scheduling)
 *   - demand-forecast.service (predicts ORDER VOLUME — NOT prep start times)
 *   - peak-hour.service (predicts peak hours — NOT dish-level prep timing)
 *   - wait-prediction.service (predicts customer WAIT — NOT kitchen prep)
 *   - scheduling.service (STAFF scheduling — NOT dish prep scheduling)
 *
 * Predicts optimal prep start times per dish per hour based on:
 *   1. Historical order patterns (which dishes ordered when)
 *   2. Dish complexity (prep time per dish)
 *   3. Kitchen capacity (cooks × stations)
 *   4. Holding time (how long dish stays fresh after prep)
 *   5. Order forecast (predicted demand per slot)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type KitchenPrepRuleId =
  | 'prep_now'
  | 'prep_ahead'
  | 'hold_alert'
  | 'capacity_warning'
  | 'batch_optimal';

export type KitchenPrepAiRec =
  | 'start_prep_now'
  | 'prep_batch'
  | 'hold'
  | 'add_cook'
  | 'monitor';

export interface KitchenPrepSchedule {
  id?: string;
  rule_id: KitchenPrepRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  dish_id?: string;
  dish_name?: string;
  target_hour: number;
  predicted_orders: number;
  prep_time_minutes: number;
  suggested_start_time?: Date;
  holding_time_minutes: number;
  kitchen_capacity_pct: number;
  batch_size: number;
  est_waste_risk: number;
  est_delay_risk: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: KitchenPrepAiRec;
  status: 'open' | 'prepping' | 'completed' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface KitchenPrepConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  capacityThreshold: number;
  holdingBufferPct: number;
}

export const DEFAULT_KITCHEN_PREP_CONFIG: KitchenPrepConfig = {
  aiEnabled: true,
  lookbackDays: 14,
  capacityThreshold: 0.80,
  holdingBufferPct: 0.20,
};

export const readKitchenPrepConfig = (settings: any): KitchenPrepConfig => ({
  aiEnabled: settings?.kitchen_prep_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.kitchen_prep_lookback_days, 14),
  capacityThreshold: safeNumber(settings?.kitchen_prep_capacity_threshold, 0.80),
  holdingBufferPct: safeNumber(settings?.kitchen_prep_holding_buffer_pct, 0.20),
});

// Dish complexity inference from dish name (prep time in minutes)
const DISH_PREP_TIMES: Array<{ keywords: string[]; prep_minutes: number; holding_minutes: number }> = [
  // Fast prep, short holding
  { keywords: ['salad', 'soup', 'appetizer', 'side', 'fries'], prep_minutes: 5, holding_minutes: 10 },
  // Medium prep
  { keywords: ['burger', 'sandwich', 'wrap', 'taco', 'quesadilla'], prep_minutes: 10, holding_minutes: 5 },
  // Slow prep, medium holding
  { keywords: ['pizza', 'pasta', 'risotto', 'curry', 'stir fry'], prep_minutes: 15, holding_minutes: 8 },
  // Very slow prep, long holding (can hold well)
  { keywords: ['roast', 'braise', 'stew', 'chili', 'soup of day'], prep_minutes: 30, holding_minutes: 60 },
  // Grilled/fried (must serve immediately)
  { keywords: ['grilled', 'fried', 'steak', 'chicken', 'fish', 'shrimp'], prep_minutes: 12, holding_minutes: 3 },
  // Desserts
  { keywords: ['cake', 'ice cream', 'dessert', 'pudding', 'tart'], prep_minutes: 5, holding_minutes: 15 },
];

const inferPrepTime = (dishName: string): { prep: number; holding: number } => {
  const name = dishName.toLowerCase();
  for (const rule of DISH_PREP_TIMES) {
    if (rule.keywords.some(kw => name.includes(kw))) {
      return { prep: rule.prep_minutes, holding: rule.holding_minutes };
    }
  }
  return { prep: 12, holding: 8 }; // default
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface DishHourPattern {
  dish_id: string;
  dish_name: string;
  hour: number;
  avg_orders: number;
}

/**
 * Run the kitchen prep scheduler engine.
 * Fetches historical order patterns, generates prep schedules.
 */
export const runKitchenPrepEngine = async (
  db: ReturnType<typeof useDB>,
  config: KitchenPrepConfig = DEFAULT_KITCHEN_PREP_CONFIG
): Promise<{ schedules: KitchenPrepSchedule[]; generated: number }> => {
  const schedules: KitchenPrepSchedule[] = [];
  const now = new Date();

  // 1. Fetch historical dish × hour patterns
  let patterns: DishHourPattern[] = [];
  try {
    const result = await db.query(
      `SELECT
         item.id AS dish_id,
         item.name AS dish_name,
         time::hour(created_at) AS hour,
         math::sum(quantity) / ${config.lookbackDays} AS avg_orders
       FROM order_item
       WHERE order.status = 'Paid'
         AND order.deleted_at IS NONE
         AND deleted_at IS NONE
         AND item IS NOT NONE
         AND created_at > time::now() - ${config.lookbackDays}d
       GROUP BY item.id, item.name, time::hour(created_at)`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    patterns = rows.map((r: any) => ({
      dish_id: String(r.dish_id ?? ''),
      dish_name: String(r.dish_name ?? 'Unknown'),
      hour: safeNumber(r.hour, 0),
      avg_orders: safeNumber(r.avg_orders, 0),
    })).filter(p => p.avg_orders >= 1 && p.hour >= 10 && p.hour <= 22);
  } catch (err) {
    console.warn('[kitchen-prep] fetchPatterns failed', err);
  }

  if (patterns.length === 0) return { schedules: [], generated: 0 };

  // 2. Fetch current kitchen capacity (active orders in kitchen now)
  let kitchenLoad = 0;
  try {
    const loadResult = await db.query(
      `SELECT count() AS active
       FROM order_item_kitchen
       WHERE status = 'preparing'
       AND created_at > time::now() - 30m`
    );
    const loadRows = Array.isArray(loadResult) ? loadResult.flat() : [];
    kitchenLoad = safeNumber(loadRows[0]?.active, 0);
  } catch (err) {
    console.warn('[kitchen-prep] fetchKitchenLoad failed', err);
  }

  // Estimate kitchen capacity (assume max 15 concurrent items)
  const maxKitchenCapacity = 15;
  const kitchenCapacityPct = Math.min(100, (kitchenLoad / maxKitchenCapacity) * 100);

  // 3. Group patterns by dish for batch analysis
  const dishesByHour = new Map<number, DishHourPattern[]>();
  for (const p of patterns) {
    if (!dishesByHour.has(p.hour)) dishesByHour.set(p.hour, []);
    dishesByHour.get(p.hour)!.push(p);
  }

  // 4. Generate prep schedules for upcoming hours
  const currentHour = now.getHours();

  for (const [hour, dishPatterns] of dishesByHour.entries()) {
    // Only schedule for upcoming hours (next 4 hours)
    const hoursAhead = hour - currentHour;
    if (hoursAhead < 0 || hoursAhead > 4) continue;

    // Sort dishes by predicted orders (highest demand first)
    const sortedDishes = [...dishPatterns].sort((a, b) => b.avg_orders - a.avg_orders);

    for (const dish of sortedDishes.slice(0, 10)) { // top 10 dishes per hour
      const { prep: prepTime, holding: holdingTime } = inferPrepTime(dish.dish_name);

      // Calculate suggested start time
      // Start: target_hour - prep_time - buffer
      // Buffer = prep_time × holdingBufferPct (20% earlier to allow for delays)
      const bufferMinutes = Math.round(prepTime * config.holdingBufferPct);
      const startMinutesBefore = prepTime + bufferMinutes;

      const targetTime = new Date(now);
      targetTime.setHours(hour, 0, 0, 0);
      if (targetTime < now) targetTime.setDate(targetTime.getDate() + 1);

      const suggestedStart = new Date(targetTime.getTime() - startMinutesBefore * 60 * 1000);

      // Risk calculations
      // Waste risk: if we prep too early (before holding window)
      const earliestValidStart = new Date(targetTime.getTime() - holdingTime * 60 * 1000);
      const isTooEarly = suggestedStart < earliestValidStart;
      const wasteRisk = isTooEarly ? 0.5 : 0;

      // Delay risk: if kitchen is at capacity during prep window
      const delayRisk = kitchenCapacityPct > config.capacityThreshold * 100 ? 0.6 : 0.15;

      // Batch size: if predicted orders >= 5, suggest batch of 3
      const batchSize = dish.avg_orders >= 5 ? Math.ceil(dish.avg_orders / 2) : 1;

      // Determine rule
      let ruleId: KitchenPrepRuleId;
      let severity: 'critical' | 'high' | 'medium' | 'low';
      let aiRec: KitchenPrepAiRec;
      let desc = '';

      if (hoursAhead === 0 && dish.avg_orders >= 3) {
        // Need to prep NOW for current hour
        ruleId = 'prep_now';
        severity = 'high';
        aiRec = 'start_prep_now';
        desc = `${dish.dish_name}: ${dish.avg_orders.toFixed(0)} orders predicted for ${hour}:00 — start prep NOW (${prepTime}min prep, batch ${batchSize})`;
      } else if (hoursAhead === 1 && dish.avg_orders >= 4) {
        // Prep ahead for next hour
        ruleId = 'prep_ahead';
        severity = 'medium';
        aiRec = 'prep_batch';
        desc = `${dish.dish_name}: ${dish.avg_orders.toFixed(0)} orders predicted for ${hour}:00 — start prep at ${suggestedStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} (${prepTime}min, batch ${batchSize})`;
      } else if (isTooEarly) {
        // Holding alert — can't prep too early
        ruleId = 'hold_alert';
        severity = 'medium';
        aiRec = 'hold';
        desc = `${dish.dish_name}: can't start prep yet — holding time only ${holdingTime}min (would degrade quality before ${hour}:00)`;
      } else if (kitchenCapacityPct > config.capacityThreshold * 100 && hoursAhead <= 2) {
        // Capacity warning
        ruleId = 'capacity_warning';
        severity = 'high';
        aiRec = 'add_cook';
        desc = `${dish.dish_name}: kitchen at ${kitchenCapacityPct.toFixed(0)}% capacity — risk of delay for ${hour}:00 orders. Consider adding cook or staggering prep.`;
      } else if (batchSize >= 3) {
        // Batch optimal
        ruleId = 'batch_optimal';
        severity = 'low';
        aiRec = 'prep_batch';
        desc = `${dish.dish_name}: batch ${batchSize} portions for ${hour}:00 (${dish.avg_orders.toFixed(0)} predicted orders, ${prepTime}min prep)`;
      } else {
        continue; // skip uninteresting items
      }

      schedules.push({
        rule_id: ruleId,
        severity,
        dish_id: dish.dish_id,
        dish_name: dish.dish_name,
        target_hour: hour,
        predicted_orders: Math.round(dish.avg_orders),
        prep_time_minutes: prepTime,
        suggested_start_time: suggestedStart,
        holding_time_minutes: holdingTime,
        kitchen_capacity_pct: Math.round(kitchenCapacityPct * 10) / 10,
        batch_size: batchSize,
        est_waste_risk: Math.round(wasteRisk * 100) / 100,
        est_delay_risk: Math.round(delayRisk * 100) / 100,
        description: desc,
        ai_recommendation: aiRec,
        status: 'open',
        detected_at: now,
      });
    }
  }

  // 5. AI insight for top 5 high-priority schedules
  if (config.aiEnabled && schedules.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topSchedules = schedules
        .filter(s => s.severity === 'high' || s.severity === 'medium')
        .slice(0, 5);
      for (const s of topSchedules) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a kitchen operations AI for restaurants. Respond with a single actionable prep insight (max 200 chars).' },
            { role: 'user', content: `Dish "${s.dish_name}" for ${s.target_hour}:00: ${s.predicted_orders} predicted orders, ${s.prep_time_minutes}min prep, ${s.holding_time_minutes}min hold, batch ${s.batch_size}. Kitchen at ${s.kitchen_capacity_pct.toFixed(0)}% capacity. Waste risk ${(s.est_waste_risk * 100).toFixed(0)}%, delay risk ${(s.est_delay_risk * 100).toFixed(0)}%.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          s.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 6. Persist
  try {
    await db.query(`DELETE FROM kitchen_prep_schedule WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const s of schedules) {
    try {
      await db.query(`CREATE kitchen_prep_schedule CONTENT $data`, {
        data: {
          ...s,
          suggested_start_time: s.suggested_start_time?.toISOString(),
          detected_at: s.detected_at.toISOString(),
        },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { schedules, generated: schedules.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveSchedules = async (db: ReturnType<typeof useDB>): Promise<KitchenPrepSchedule[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM kitchen_prep_schedule
       WHERE status = 'open'
       ORDER BY target_hour ASC, predicted_orders DESC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  prepNowCount: number;
  capacityWarnings: number;
  totalDishes: number;
  avgDelayRisk: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'prep_now') AS prep_now,
         math::count(rule_id = 'capacity_warning') AS capacity,
         math::mean(est_delay_risk) AS delay
       FROM kitchen_prep_schedule
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      prepNowCount: safeNumber(r.prep_now, 0),
      capacityWarnings: safeNumber(r.capacity, 0),
      totalDishes: safeNumber(r.total, 0),
      avgDelayRisk: safeNumber(r.delay, 0),
    };
  } catch {
    return { prepNowCount: 0, capacityWarnings: 0, totalDishes: 0, avgDelayRisk: 0 };
  }
};

export const updateScheduleStatus = async (
  db: ReturnType<typeof useDB>,
  scheduleId: string,
  status: 'prepping' | 'completed' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: scheduleId, status });
};
