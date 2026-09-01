/**
 * AI Catering Order Optimizer — bulk event order optimization.
 *
 * 53rd POSR-exclusive differentiator — catering is a $60B+ US market.
 * Restaurants struggle with: recipe scaling (1→100 servings), bulk pricing,
 * waste prediction, menu travel-friendliness, staffing needs. Toast/Square/
 * Lightspeed have NO catering optimization. ezCater charges $99/mo + 7%
 * commission.
 *
 * Distinct from:
 *   - buffet-demand.service (predicts guest count for buffets — NOT off-site
 *     catering orders with fixed guest counts)
 *   - recipe-optimization.service (per-dish cost — NOT bulk scaling)
 *   - yield-variance.service (production waste — NOT catering-specific)
 *   - menu-optimization.service (BCG matrix — NOT catering menu mix)
 *   - demand-forecast.service (overall demand — NOT per-event catering)
 *   - procurement.service (ingredient prices — NOT bulk event ordering)
 *
 * Optimizes CATERING ORDERS: recipe scaling, bulk pricing, waste prediction,
 * menu travel-friendliness, staffing needs.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type CateringRuleId =
  | 'bulk_pricing'
  | 'waste_prediction'
  | 'travel_suitability'
  | 'staffing_alert'
  | 'menu_mix_optimal';

export type CateringAiRec =
  | 'accept_order'
  | 'negotiate_price'
  | 'adjust_menu'
  | 'add_staff'
  | 'decline'
  | 'monitor';

export interface CateringOptimization {
  id?: string;
  rule_id: CateringRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  order_id?: string;
  event_name?: string;
  guest_count: number;
  event_date?: Date;
  event_type?: string;
  suggested_dishes?: string;
  total_est_cost: number;
  suggested_price: number;
  bulk_discount_pct: number;
  predicted_waste_pct: number;
  est_waste_cost: number;
  travel_suitability_score: number;
  prep_hours_needed: number;
  staff_needed: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: CateringAiRec;
  status: 'open' | 'accepted' | 'adjusted' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface CateringConfig {
  aiEnabled: boolean;
  targetMarginPct: number;
  bulkDiscountThreshold: number;
  wasteBenchmarkPct: number;
}

export const DEFAULT_CATERING_CONFIG: CateringConfig = {
  aiEnabled: true,
  targetMarginPct: 0.65,
  bulkDiscountThreshold: 25,
  wasteBenchmarkPct: 0.10,
};

export const readCateringConfig = (settings: any): CateringConfig => ({
  aiEnabled: settings?.catering_ai_enabled ?? true,
  targetMarginPct: safeNumber(settings?.catering_target_margin_pct, 0.65),
  bulkDiscountThreshold: safeNumber(settings?.catering_bulk_discount_threshold, 25),
  wasteBenchmarkPct: safeNumber(settings?.catering_waste_benchmark_pct, 0.10),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Dishes that travel well (high score) vs don't (low score)
// Based on cuisine science: fried foods get soggy, delicate greens wilt,
// soups leak, dairy spoils, etc.
const TRAVEL_SCORES: Record<string, number> = {
  // Proteins (travel well)
  'chicken': 85, 'beef': 80, 'pork': 80, 'turkey': 85,
  'meatball': 90, 'pulled pork': 90, 'brisket': 90,
  // Pasta/grain (travel well)
  'pasta': 75, 'lasagna': 90, 'risotto': 60, 'rice': 80,
  // Fried (travel poorly)
  'fried chicken': 40, 'fries': 20, 'onion rings': 25, 'tempura': 20,
  // Delicate (travel poorly)
  'salad': 30, 'sushi': 15, 'ceviche': 20, 'steak (rare)': 35,
  // Soups/sauces (medium — need containers)
  'soup': 60, 'stew': 75, 'curry': 80, 'chili': 85,
  // Desserts
  'cake': 80, 'cookie': 90, 'brownie': 85, 'ice cream': 10, 'mousse': 40,
};

const getTravelScore = (dishName: string): number => {
  const name = dishName.toLowerCase();
  for (const [keyword, score] of Object.entries(TRAVEL_SCORES)) {
    if (name.includes(keyword)) return score;
  }
  return 60; // default medium
};

// Event type → typical waste rate (industry benchmarks)
const EVENT_WASTE_RATES: Record<string, number> = {
  corporate: 0.08,      // 8% — corporate events are punctual, less waste
  wedding: 0.15,        // 15% — weddings have unpredictable attendance
  birthday: 0.12,       // 12% — parties vary
  conference: 0.10,     // 10% — conferences are scheduled but attendance varies
  holiday: 0.18,        // 18% — holiday parties have high no-shows
  other: 0.12,          // 12% — default
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface DishData {
  id: string;
  name: string;
  price: number;
  cost: number;
  category: string;
}

/**
 * Run the catering optimizer engine.
 * Fetches top dishes, generates catering optimization recommendations.
 */
export const runCateringEngine = async (
  db: ReturnType<typeof useDB>,
  config: CateringConfig = DEFAULT_CATERING_CONFIG
): Promise<{ optimizations: CateringOptimization[]; generated: number }> => {
  const optimizations: CateringOptimization[] = [];
  const now = new Date();

  // 1. Fetch dishes available for catering
  let dishes: DishData[] = [];
  try {
    const result = await db.query(
      `SELECT id, name, price, cost, category.name AS category
       FROM menu_item
       WHERE deleted_at IS NONE
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    dishes = rows.map((r: any) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? 'Unknown'),
      price: safeNumber(r.price, 0),
      cost: safeNumber(r.cost, 0),
      category: String(r.category ?? ''),
    })).filter(d => d.price > 0);
  } catch (err) {
    console.warn('[catering] fetchDishes failed', err);
  }

  if (dishes.length === 0) return { optimizations: [], generated: 0 };

  // 2. Fetch upcoming catering events (orders with large party_size or tagged 'catering')
  let events: Array<{ order_id: string; event_name: string; guest_count: number; event_date: string; event_type: string }> = [];
  try {
    const result = await db.query(
      `SELECT
         id AS order_id,
         customer.name AS event_name,
         math::sum(order_item.quantity) AS guest_count,
         created_at AS event_date,
         'corporate' AS event_type
       FROM order
       WHERE status = 'Open'
         AND deleted_at IS NONE
         AND created_at > time::now() - 7d
       GROUP BY id, customer.name, created_at
       HAVING math::sum(order_item.quantity) >= 20
       LIMIT 10`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    events = rows.map((r: any) => ({
      order_id: String(r.order_id ?? ''),
      event_name: String(r.event_name ?? 'Catering Event'),
      guest_count: safeNumber(r.guest_count, 25),
      event_date: String(r.event_date ?? ''),
      event_type: String(r.event_type ?? 'corporate'),
    }));
  } catch (err) {
    console.warn('[catering] fetchEvents failed', err);
  }

  // 3. If no upcoming events, generate sample recommendations for common scenarios
  if (events.length === 0) {
    // Generate 3 sample catering scenarios
    const scenarios = [
      { guest_count: 25, event_type: 'corporate', event_name: 'Corporate Lunch (sample)' },
      { guest_count: 50, event_type: 'wedding', event_name: 'Wedding Reception (sample)' },
      { guest_count: 100, event_type: 'conference', event_name: 'Conference Dinner (sample)' },
    ];

    for (const scenario of scenarios) {
      const opt = await generateCateringOptimization(db, config, scenario.event_name, scenario.guest_count, scenario.event_type, dishes, now);
      if (opt) optimizations.push(opt);
    }
  } else {
    // Generate optimization per real event
    for (const event of events) {
      const opt = await generateCateringOptimization(db, config, event.event_name, event.guest_count, event.event_type, dishes, now, event.order_id);
      if (opt) optimizations.push(opt);
    }
  }

  // 4. AI insight for top 5 high-priority optimizations
  if (config.aiEnabled && optimizations.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topOpts = optimizations
        .filter(o => o.severity === 'high' || o.severity === 'medium')
        .slice(0, 5);
      for (const o of topOpts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a catering operations AI for restaurants. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Catering event "${o.event_name}": ${o.guest_count} guests, ${o.event_type}. Est cost ${fmt$(o.total_est_cost)}, suggested price ${fmt$(o.suggested_price)} (${(o.bulk_discount_pct * 100).toFixed(0)}% bulk discount). Waste prediction ${(o.predicted_waste_pct * 100).toFixed(0)}%. Travel score ${o.travel_suitability_score}/100. Prep ${o.prep_hours_needed}h, staff ${o.staff_needed}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          o.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM catering_optimization WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const o of optimizations) {
    try {
      await db.query(`CREATE catering_optimization CONTENT $data`, {
        data: {
          ...o,
          event_date: o.event_date?.toISOString(),
          detected_at: o.detected_at.toISOString(),
        },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { optimizations, generated: optimizations.length };
};

// ---------------------------------------------------------------------------
// Optimization generator
// ---------------------------------------------------------------------------

const generateCateringOptimization = async (
  db: ReturnType<typeof useDB>,
  config: CateringConfig,
  eventName: string,
  guestCount: number,
  eventType: string,
  dishes: DishData[],
  now: Date,
  orderId?: string
): Promise<CateringOptimization | null> => {
  // Select top 5 dishes for catering (sorted by travel score)
  const scoredDishes = dishes.map(d => ({
    ...d,
    travelScore: getTravelScore(d.name),
  })).sort((a, b) => b.travelScore - a.travelScore);

  const selectedDishes = scoredDishes.slice(0, 5);

  // Calculate portions per dish (assume 1.5 dishes per guest for variety)
  const dishesPerGuest = 1.5;
  const totalPortions = guestCount * dishesPerGuest;
  const portionsPerDish = Math.ceil(totalPortions / selectedDishes.length);

  // Calculate total cost
  const totalEstCost = selectedDishes.reduce((s, d) => s + d.cost * portionsPerDish, 0);

  // Calculate suggested price (with target margin)
  const basePrice = totalEstCost / (1 - config.targetMarginPct);

  // Bulk discount (if guest count exceeds threshold)
  const bulkDiscountPct = guestCount >= config.bulkDiscountThreshold
    ? Math.min(0.15, (guestCount - config.bulkDiscountThreshold) * 0.002) // 0.2% per guest over threshold, max 15%
    : 0;

  const suggestedPrice = Math.round(basePrice * (1 - bulkDiscountPct) * 100) / 100;

  // Predicted waste based on event type
  const wasteRate = EVENT_WASTE_RATES[eventType] ?? EVENT_WASTE_RATES.other;
  const predictedWastePct = Math.min(wasteRate + (guestCount > 50 ? 0.03 : 0), 0.25); // larger events waste more
  const estWasteCost = totalEstCost * predictedWastePct;

  // Average travel score of selected dishes
  const avgTravelScore = selectedDishes.length > 0
    ? selectedDishes.reduce((s, d) => s + d.travelScore, 0) / selectedDishes.length
    : 50;

  // Prep hours (rough estimate: 1 hour per 10 guests)
  const prepHoursNeeded = Math.ceil(guestCount / 10);

  // Staff needed (1 server per 25 guests, 1 cook per 30 guests)
  const staffNeeded = Math.ceil(guestCount / 25) + Math.ceil(guestCount / 30);

  // Determine rule based on analysis
  let ruleId: CateringRuleId = 'bulk_pricing';
  let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  let aiRec: CateringAiRec = 'accept_order';
  let desc = '';

  // Determine most pressing issue
  if (avgTravelScore < 50) {
    ruleId = 'travel_suitability';
    severity = 'high';
    aiRec = 'adjust_menu';
    desc = `${eventName} (${guestCount} guests): selected dishes avg travel score ${avgTravelScore.toFixed(0)}/100 — replace poorly-traveling dishes.`;
  } else if (predictedWastePct > config.wasteBenchmarkPct + 0.05) {
    ruleId = 'waste_prediction';
    severity = predictedWastePct > 0.20 ? 'critical' : 'high';
    aiRec = 'adjust_menu';
    desc = `${eventName} (${guestCount} guests, ${eventType}): predicted waste ${(predictedWastePct * 100).toFixed(0)}% (est loss ${fmt$(estWasteCost)}) — reduce portions or menu variety.`;
  } else if (guestCount >= 50 && staffNeeded < 4) {
    ruleId = 'staffing_alert';
    severity = 'high';
    aiRec = 'add_staff';
    desc = `${eventName} (${guestCount} guests): need ${staffNeeded} staff for safe service — large event requires more hands.`;
  } else if (bulkDiscountPct > 0) {
    ruleId = 'bulk_pricing';
    severity = 'medium';
    aiRec = 'accept_order';
    desc = `${eventName} (${guestCount} guests, ${eventType}): bulk discount ${(bulkDiscountPct * 100).toFixed(0)}% applied — suggested price ${fmt$(suggestedPrice)} (margin ${((1 - totalEstCost / suggestedPrice) * 100).toFixed(0)}%).`;
  } else {
    ruleId = 'menu_mix_optimal';
    severity = 'low';
    aiRec = 'accept_order';
    desc = `${eventName} (${guestCount} guests): optimal menu mix — ${selectedDishes.length} dishes, avg travel ${avgTravelScore.toFixed(0)}/100, waste ${(predictedWastePct * 100).toFixed(0)}%.`;
  }

  const suggestedDishesJson = JSON.stringify(
    selectedDishes.map(d => ({
      name: d.name,
      portions: portionsPerDish,
      travel_score: d.travelScore,
      cost_per_portion: Math.round(d.cost * 100) / 100,
    }))
  );

  return {
    rule_id: ruleId,
    severity,
    order_id: orderId,
    event_name: eventName,
    guest_count: guestCount,
    event_date: now,
    event_type: eventType,
    suggested_dishes: suggestedDishesJson,
    total_est_cost: Math.round(totalEstCost * 100) / 100,
    suggested_price: suggestedPrice,
    bulk_discount_pct: Math.round(bulkDiscountPct * 10000) / 10000,
    predicted_waste_pct: Math.round(predictedWastePct * 10000) / 10000,
    est_waste_cost: Math.round(estWasteCost * 100) / 100,
    travel_suitability_score: Math.round(avgTravelScore),
    prep_hours_needed: prepHoursNeeded,
    staff_needed: staffNeeded,
    description: desc,
    ai_recommendation: aiRec,
    status: 'open',
    detected_at: now,
  };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveOptimizations = async (db: ReturnType<typeof useDB>): Promise<CateringOptimization[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM catering_optimization
       WHERE status = 'open'
       ORDER BY guest_count DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  activeEvents: number;
  totalGuests: number;
  totalEstRevenue: number;
  avgWastePct: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(guest_count) AS guests,
         math::sum(suggested_price) AS revenue,
         math::mean(predicted_waste_pct) AS waste
       FROM catering_optimization
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      activeEvents: safeNumber(r.total, 0),
      totalGuests: safeNumber(r.guests, 0),
      totalEstRevenue: safeNumber(r.revenue, 0),
      avgWastePct: safeNumber(r.waste, 0),
    };
  } catch {
    return { activeEvents: 0, totalGuests: 0, totalEstRevenue: 0, avgWastePct: 0 };
  }
};

export const updateOptimizationStatus = async (
  db: ReturnType<typeof useDB>,
  optId: string,
  status: 'accepted' | 'adjusted' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: optId, status });
};
