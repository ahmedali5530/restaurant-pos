/**
 * AI Event-Driven Menu Optimizer — adjust menu for upcoming events.
 *
 * 72nd POSR-exclusive differentiator — restaurants near event venues see
 * 50-300% revenue spikes on event days (NRA). 73% of event attendees dine out
 * (Eventbrite). Yet most restaurants don't proactively adjust menus.
 *
 * Distinct from:
 *   - seasonal.service (monthly SEASONAL trends — NOT specific events)
 *   - weather-impact.service (WEATHER correlation — NOT events)
 *   - demand-forecast.service (general demand — NOT event-driven)
 *   - peak-hour.service (hourly peaks — NOT external events)
 *   - promo-analytics.service (promo performance — NOT event-specific menus)
 *
 * Detects upcoming events (holidays, sports, local festivals, weather events,
 * cultural events), recommends menu adjustments, inventory prep, staffing,
 * and promotions.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type EventMenuRuleId =
  | 'holiday_menu'
  | 'sports_event'
  | 'local_festival'
  | 'weather_event'
  | 'cultural_event';

export type EventMenuAiRec =
  | 'prepare_now'
  | 'adjust_menu'
  | 'add_staff'
  | 'order_inventory'
  | 'monitor';

export interface EventMenuOptimization {
  id?: string;
  rule_id: EventMenuRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  event_name: string;
  event_date: Date;
  days_until_event: number;
  event_type: string;
  est_traffic_multiplier: number;
  suggested_dishes?: string;
  suggested_promotions?: string;
  staffing_recommendation?: string;
  inventory_prep?: string;
  est_revenue_lift: number;
  est_extra_cost: number;
  net_profit: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: EventMenuAiRec;
  status: 'open' | 'prepared' | 'executed' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface EventMenuConfig {
  aiEnabled: boolean;
  lookaheadDays: number;
  minMultiplier: number;
  avgDailyRevenue: number;
}

export const DEFAULT_EVENT_MENU_CONFIG: EventMenuConfig = {
  aiEnabled: true,
  lookaheadDays: 14,
  minMultiplier: 1.5,
  avgDailyRevenue: 3000,
};

export const readEventMenuConfig = (settings: any): EventMenuConfig => ({
  aiEnabled: settings?.event_menu_ai_enabled ?? true,
  lookaheadDays: safeNumber(settings?.event_menu_lookahead_days, 14),
  minMultiplier: safeNumber(settings?.event_menu_min_multiplier, 1.5),
  avgDailyRevenue: safeNumber(settings?.event_menu_avg_daily_revenue, 3000),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Event catalog: known holidays + recurring events
// In production, would integrate with Google Calendar API / Eventbrite API
const EVENT_CATALOG: Array<{
  name: string;
  type: string;
  month: number; // 1-12
  day: number | null; // null = floating (e.g. Thanksgiving = 4th Thursday)
  weekday: number | null; // 0=Sun...6=Sat, for floating events
  weekOfMonth: number | null; // 1-5 for "nth weekday of month"
  trafficMultiplier: number;
  suggestedDishes: Array<{ name: string; reason: string; prepMultiplier: number }>;
  promotions: string[];
  staffing: string;
  inventory: Array<{ item: string; extraQty: string }>;
}> = [
  // Major holidays
  {
    name: "Valentine's Day", type: 'holiday', month: 2, day: 14, weekday: null, weekOfMonth: null,
    trafficMultiplier: 2.5,
    suggestedDishes: [
      { name: 'Steak for Two', reason: 'Romantic dinner classic', prepMultiplier: 2.0 },
      { name: 'Chocolate Dessert', reason: 'Valentine\'s chocolate tradition', prepMultiplier: 3.0 },
      { name: 'Wine Pairing Set', reason: 'Couples order wine 80% on V-Day', prepMultiplier: 2.5 },
    ],
    promotions: ['Couples prix fixe menu ($75/person)', 'Complimentary chocolate for reservations', 'Wine pairing add-on ($25)'],
    staffing: 'Add 2 servers + 1 bartender. Extend kitchen hours until 11pm.',
    inventory: [{ item: 'Steak (filet/ribeye)', extraQty: '3x normal' }, { item: 'Chocolate', extraQty: '5x normal' }, { item: 'Red wine', extraQty: '2x normal' }],
  },
  {
    name: "Mother's Day", type: 'holiday', month: 5, day: null, weekday: 0, weekOfMonth: 2,
    trafficMultiplier: 3.0,
    suggestedDishes: [
      { name: 'Brunch Menu', reason: 'Mother\'s Day brunch is #1 dining day', prepMultiplier: 3.0 },
      { name: 'Mimosa/Sparkling', reason: '80% of brunch tables order mimosas', prepMultiplier: 4.0 },
      { name: 'Floral Dessert', reason: 'Themed presentation for moms', prepMultiplier: 2.5 },
    ],
    promotions: ['Mother\'s Day brunch special ($45)', 'Free mimosa for moms', 'Floral table settings'],
    staffing: 'Full staff + 3 extra servers + 2 extra kitchen. Open 1 hour earlier for brunch.',
    inventory: [{ item: 'Eggs', extraQty: '4x normal' }, { item: 'Champagne', extraQty: '5x normal' }, { item: 'Flowers', extraQty: '20 arrangements' }],
  },
  {
    name: "Independence Day (July 4th)", type: 'holiday', month: 7, day: 4, weekday: null, weekOfMonth: null,
    trafficMultiplier: 1.8,
    suggestedDishes: [
      { name: 'BBQ/Grilled Items', reason: 'July 4th = BBQ tradition', prepMultiplier: 2.5 },
      { name: 'Burgers & Hot Dogs', reason: 'Classic American fare', prepMultiplier: 3.0 },
      { name: 'Beer Buckets', reason: '#1 beer sales day', prepMultiplier: 4.0 },
    ],
    promotions: ['All-American BBQ platter ($25)', 'Beer bucket special (5 for $25)', 'Red/white/blue dessert'],
    staffing: 'Add 2 kitchen + 1 bar. Extended patio seating.',
    inventory: [{ item: 'Burger patties', extraQty: '3x normal' }, { item: 'Beer', extraQty: '4x normal' }, { item: 'Hot dogs', extraQty: '5x normal' }],
  },
  {
    name: "Thanksgiving", type: 'holiday', month: 11, day: null, weekday: 4, weekOfMonth: 4,
    trafficMultiplier: 2.2,
    suggestedDishes: [
      { name: 'Turkey Dinner', reason: 'Thanksgiving tradition', prepMultiplier: 3.0 },
      { name: 'Pumpkin Pie', reason: '#1 dessert day', prepMultiplier: 4.0 },
      { name: 'Cranberry/Wine', reason: 'Pairing tradition', prepMultiplier: 2.5 },
    ],
    promotions: ['Thanksgiving prix fixe ($55)', 'Turkey to-go orders ($80)', 'Pie by the slice ($8)'],
    staffing: 'Full kitchen staff. Add 2 servers. Prep starts 2 days early.',
    inventory: [{ item: 'Turkey', extraQty: '5x normal' }, { item: 'Pumpkin', extraQty: '4x normal' }, { item: 'Cranberries', extraQty: '10x normal' }],
  },
  {
    name: "New Year's Eve", type: 'holiday', month: 12, day: 31, weekday: null, weekOfMonth: null,
    trafficMultiplier: 2.8,
    suggestedDishes: [
      { name: 'Champagne Toast', reason: 'NYE = champagne night', prepMultiplier: 5.0 },
      { name: 'Premium Tasting Menu', reason: 'Special occasion dining', prepMultiplier: 3.0 },
      { name: 'Late-Night Snacks', reason: 'Post-midnight crowd', prepMultiplier: 2.0 },
    ],
    promotions: ['NYE prix fixe ($120 with champagne)', 'Midnight toast package', 'Late-night menu until 2am'],
    staffing: 'Full staff + 3 extra. Two seatings (7pm + 10pm). Bar open until 2am.',
    inventory: [{ item: 'Champagne', extraQty: '8x normal' }, { item: 'Premium spirits', extraQty: '3x normal' }, { item: 'Party supplies', extraQty: '100 favors' }],
  },
  // Sports events (generic — would be location-specific in production)
  {
    name: "Super Bowl Sunday", type: 'sports', month: 2, day: null, weekday: 0, weekOfMonth: 1,
    trafficMultiplier: 1.5,
    suggestedDishes: [
      { name: 'Wings', reason: '#1 Super Bowl food', prepMultiplier: 5.0 },
      { name: 'Pizza', reason: '#2 Super Bowl food', prepMultiplier: 3.0 },
      { name: 'Beer Buckets', reason: 'Game day essential', prepMultiplier: 4.0 },
    ],
    promotions: ['Wings special (12 for $15)', 'Game day beer buckets', 'Large pizza + wings combo ($35)'],
    staffing: 'Add 2 kitchen for wings/pizza. Bar staff +1.',
    inventory: [{ item: 'Chicken wings', extraQty: '8x normal' }, { item: 'Pizza dough', extraQty: '4x normal' }, { item: 'Beer', extraQty: '3x normal' }],
  },
  // Cultural events
  {
    name: "Cinco de Mayo", type: 'cultural', month: 5, day: 5, weekday: null, weekOfMonth: null,
    trafficMultiplier: 2.0,
    suggestedDishes: [
      { name: 'Tacos', reason: 'Cinco de Mayo staple', prepMultiplier: 3.0 },
      { name: 'Margaritas', reason: '#1 margarita day', prepMultiplier: 5.0 },
      { name: 'Guacamole', reason: 'Party favorite', prepMultiplier: 4.0 },
    ],
    promotions: ['Taco platter special ($18)', 'Margarita pitcher ($25)', 'Guac + chips free with entree'],
    staffing: 'Add 2 bar (margarita volume) + 1 kitchen.',
    inventory: [{ item: 'Tequila', extraQty: '6x normal' }, { item: 'Tortillas', extraQty: '4x normal' }, { item: 'Avocados', extraQty: '5x normal' }],
  },
];

/**
 * Calculate floating holiday date (e.g. "4th Thursday of November")
 */
const getNthWeekdayOfMonth = (year: number, month: number, weekday: number, weekOfMonth: number): Date => {
  const firstDay = new Date(year, month - 1, 1);
  const firstWeekday = firstDay.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return new Date(year, month - 1, 1 + offset + (weekOfMonth - 1) * 7);
};

/**
 * Run the event-driven menu optimizer engine.
 */
export const runEventMenuEngine = async (
  db: ReturnType<typeof useDB>,
  config: EventMenuConfig = DEFAULT_EVENT_MENU_CONFIG
): Promise<{ optimizations: EventMenuOptimization[]; generated: number }> => {
  const optimizations: EventMenuOptimization[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const lookaheadMs = config.lookaheadDays * 24 * 60 * 60 * 1000;

  // 1. Check each event in catalog for upcoming dates
  for (const event of EVENT_CATALOG) {
    let eventDate: Date;

    if (event.day !== null) {
      // Fixed date holiday
      eventDate = new Date(currentYear, event.month - 1, event.day);
      // If already passed this year, check next year
      if (eventDate < now) {
        eventDate = new Date(currentYear + 1, event.month - 1, event.day);
      }
    } else if (event.weekday !== null && event.weekOfMonth !== null) {
      // Floating holiday (nth weekday of month)
      eventDate = getNthWeekdayOfMonth(currentYear, event.month, event.weekday, event.weekOfMonth);
      if (eventDate < now) {
        eventDate = getNthWeekdayOfMonth(currentYear + 1, event.month, event.weekday, event.weekOfMonth);
      }
    } else {
      continue;
    }

    const daysUntil = Math.floor((eventDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    // Skip if beyond lookahead window
    if (daysUntil > config.lookaheadDays || daysUntil < 0) continue;

    // Skip if traffic multiplier below threshold
    if (event.trafficMultiplier < config.minMultiplier) continue;

    // Calculate financial projections
    const estRevenueLift = config.avgDailyRevenue * (event.trafficMultiplier - 1);
    const estExtraCost = estRevenueLift * 0.35; // 35% of extra revenue goes to extra food + labor
    const netProfit = estRevenueLift - estExtraCost;

    // Determine severity based on days until + traffic multiplier
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let aiRec: EventMenuAiRec;

    if (daysUntil <= 3 && event.trafficMultiplier >= 2.5) {
      severity = 'critical';
      aiRec = 'prepare_now';
    } else if (daysUntil <= 7) {
      severity = 'high';
      aiRec = daysUntil <= 3 ? 'order_inventory' : 'adjust_menu';
    } else if (daysUntil <= 14) {
      severity = 'medium';
      aiRec = 'adjust_menu';
    } else {
      severity = 'low';
      aiRec = 'monitor';
    }

    const ruleId: EventMenuRuleId = event.type === 'holiday' ? 'holiday_menu'
      : event.type === 'sports' ? 'sports_event'
      : event.type === 'cultural' ? 'cultural_event'
      : 'local_festival';

    optimizations.push({
      rule_id: ruleId,
      severity,
      event_name: event.name,
      event_date: eventDate,
      days_until_event: daysUntil,
      event_type: event.type,
      est_traffic_multiplier: event.trafficMultiplier,
      suggested_dishes: JSON.stringify(event.suggestedDishes),
      suggested_promotions: JSON.stringify(event.promotions),
      staffing_recommendation: event.staffing,
      inventory_prep: JSON.stringify(event.inventory),
      est_revenue_lift: Math.round(estRevenueLift * 100) / 100,
      est_extra_cost: Math.round(estExtraCost * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      description: `${event.name} in ${daysUntil}d — est ${event.trafficMultiplier}× traffic (${fmt$(estRevenueLift)} extra revenue, ${fmt$(netProfit)} net profit). ${event.suggestedDishes.length} dishes to feature, ${event.inventory.length} items to stock up.`,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 2. AI insight for top 5 high-priority optimizations
  if (config.aiEnabled && optimizations.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topOpts = optimizations
        .filter(o => o.severity === 'critical' || o.severity === 'high')
        .slice(0, 5);
      for (const o of topOpts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant event planning AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Event: ${o.event_name} in ${o.days_until_event}d. Traffic: ${o.est_traffic_multiplier}×. Revenue lift: ${fmt$(o.est_revenue_lift)}, net profit: ${fmt$(o.net_profit)}. Type: ${o.event_type}.` },
          ], { temperature: 0.4, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          o.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 3. Persist
  try {
    await db.query(`DELETE FROM event_menu_optimization WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const o of optimizations) {
    try {
      await db.query(`CREATE event_menu_optimization CONTENT $data`, {
        data: {
          ...o,
          event_date: o.event_date.toISOString(),
          detected_at: o.detected_at.toISOString(),
        },
      });
    } catch { /* ignore */ }
  }

  return { optimizations, generated: optimizations.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveOptimizations = async (db: ReturnType<typeof useDB>): Promise<EventMenuOptimization[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM event_menu_optimization
       WHERE status = 'open'
       ORDER BY days_until_event ASC
       LIMIT 20`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  eventCount: number;
  criticalCount: number;
  totalRevenueLift: number;
  totalNetProfit: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_revenue_lift) AS revenue,
         math::sum(net_profit) AS profit
       FROM event_menu_optimization
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      eventCount: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalRevenueLift: safeNumber(r.revenue, 0),
      totalNetProfit: safeNumber(r.profit, 0),
    };
  } catch {
    return { eventCount: 0, criticalCount: 0, totalRevenueLift: 0, totalNetProfit: 0 };
  }
};

export const updateOptimizationStatus = async (
  db: ReturnType<typeof useDB>,
  optId: string,
  status: 'prepared' | 'executed' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: optId, status });
};
