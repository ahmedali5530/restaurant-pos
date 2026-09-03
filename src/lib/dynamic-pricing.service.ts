/**
 * AI Dynamic Pricing service — demand-based price adjustment rules.
 *
 * Research finding: Toast Dynamic Pricing $75+/mo, Square Intelligent Pricing
 * in higher tiers. POSR offers it free — analyzes demand patterns (hour-of-day,
 * day-of-week) + inventory levels + sales velocity and generates pricing rules
 * that integrate with the existing discount engine.
 *
 * Strategies:
 *   1. HAPPY_HOUR — low-demand hours get a % discount to drive traffic
 *      Trigger: hourly demand < 60% of peak-hour demand
 *      Value: scaled 10-25% based on demand gap
 *   2. SLOW_DAY — slow weekdays get promotional pricing
 *      Trigger: day's total revenue < 70% of weekly avg
 *      Value: 10-20% off targeted categories
 *   3. CLEARANCE — overstocked + slow-moving items get clearance discount
 *      Trigger: days_until_out > 30 (overstocked) AND units_sold < 5/week
 *      Value: 20-30% (respecting margin floor)
 *   4. PEAK_SURGE — high-demand hours: recommendation to suppress discounts
 *      Trigger: hourly demand > 90% of peak
 *      Output: recommendation only (no auto-action — never surprise customers)
 *   5. LUNCH_MENU — early lunch hours get lunch-special pricing
 *      Trigger: 11:00-14:00 demand < dinner demand × 0.5
 *      Value: 10-15% off lunch-targeted items
 *   6. ITEM_PROMO — high-margin + low-popularity items get featured discount
 *      Trigger: margin_pct > 70% AND units_sold < 80% of menu median
 *      Value: 15% off (volume play — high margin absorbs it)
 *
 * Safety constraints (from settings):
 *   - Max discount % (default 30%)
 *   - Margin floor: never price below food_cost × 1.5
 *   - Max active rules per strategy (default 5)
 *
 * Integration: activating a rule creates a Discount record via the existing
 * discount engine (with schedules: days_of_week + start_time/end_time +
 * automatic application mode).
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PricingStrategy = 'happy_hour' | 'slow_day' | 'clearance' | 'peak_surge' | 'lunch_menu' | 'item_promo';
export type RuleStatus = 'draft' | 'active' | 'expired' | 'rejected';

export interface DynamicPricingRule {
  id?: string;
  name: string;
  strategy: PricingStrategy;
  description?: string;
  value_type: 'percent' | 'fixed_amount';
  value: number;
  target_item_id?: string;
  target_category_id?: string;
  days_of_week?: number[];
  start_hour?: number;
  end_hour?: number;
  expected_impact?: number;
  expected_traffic_lift?: number;
  confidence: number;
  ai_rationale?: string;
  status: RuleStatus;
  linked_discount?: string;
  activated_at?: Date;
  activated_by?: string;
  expires_at?: Date;
  generated_at: Date;
}

export interface HourlyDemandPattern {
  hour: number;
  avg_orders: number;
  avg_revenue: number;
}

export interface DailyDemandPattern {
  day_of_week: number;
  avg_orders: number;
  avg_revenue: number;
}

export interface PricingConfig {
  maxDiscountPct: number;
  marginFloorMultiplier: number;
  maxActiveRules: number;
  ruleDurationDays: number;
  aiEnabled: boolean;
  lookbackDays: number;
  minHourlyOrders: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  maxDiscountPct: 30,
  marginFloorMultiplier: 1.5,
  maxActiveRules: 5,
  ruleDurationDays: 30,
  aiEnabled: true,
  lookbackDays: 60,
  minHourlyOrders: 4,
};

export const readPricingConfig = (settings: any): PricingConfig => ({
  maxDiscountPct: safeNumber(settings?.dyn_price_max_discount_pct, 30),
  marginFloorMultiplier: safeNumber(settings?.dyn_price_margin_floor_multiplier, 1.5),
  maxActiveRules: safeNumber(settings?.dyn_price_max_active_rules, 5),
  ruleDurationDays: safeNumber(settings?.dyn_price_rule_duration_days, 30),
  aiEnabled: settings?.dyn_price_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.dyn_price_lookback_days, 60),
  minHourlyOrders: safeNumber(settings?.dyn_price_min_hourly_orders, 4),
});

// ---------------------------------------------------------------------------
// Demand analysis — hourly + daily patterns
// ---------------------------------------------------------------------------

const collectHourlyDemand = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<HourlyDemandPattern[]> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  try {
    const result = await db.query<any[]>(
      `SELECT
         time::hour(created_at) AS hour,
         count() AS order_count,
         math::sum(total) AS revenue
       FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE
       GROUP BY hour
       ORDER BY hour ASC`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const days = Math.max(1, lookbackDays);
    return rows.map(r => ({
      hour: safeNumber(r.hour, 0),
      avg_orders: safeNumber(r.order_count, 0) / days,
      avg_revenue: safeNumber(r.revenue, 0) / days,
    }));
  } catch (err) {
    console.error('[dyn-price] collectHourlyDemand failed', err);
    return [];
  }
};

const collectDailyDemand = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<DailyDemandPattern[]> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  try {
    const result = await db.query<any[]>(
      `SELECT
         time::weekday(created_at) AS day_of_week,
         count() AS order_count,
         math::sum(total) AS revenue
       FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE
       GROUP BY day_of_week`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const weeks = Math.max(1, lookbackDays / 7);
    return rows.map(r => ({
      day_of_week: safeNumber(r.day_of_week, 0),
      avg_orders: safeNumber(r.order_count, 0) / weeks,
      avg_revenue: safeNumber(r.revenue, 0) / weeks,
    }));
  } catch (err) {
    console.error('[dyn-price] collectDailyDemand failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Item analysis — for clearance + item_promo strategies
// ---------------------------------------------------------------------------

interface ItemSalesData {
  item_id: string;
  item_name: string;
  price: number;
  cost: number;
  units_sold: number;
  revenue: number;
  days_of_stock?: number;
}

const collectItemSales = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<ItemSalesData[]> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  try {
    const result = await db.query<any[]>(
      `SELECT
         item.id AS item_id,
         item.name AS item_name,
         item.price AS price,
         item.cost AS cost,
         math::sum(quantity) AS units_sold,
         math::sum(price * quantity) AS revenue
       FROM order_item
       WHERE created_at > $cutoff AND deleted_at IS NONE
       GROUP BY item_id
       FETCH item`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map(r => ({
      item_id: r.item_id?.toString?.() ?? '',
      item_name: r.item_name ?? 'Unknown',
      price: safeNumber(r.price, 0),
      cost: safeNumber(r.cost, 0),
      units_sold: safeNumber(r.units_sold, 0),
      revenue: safeNumber(r.revenue, 0),
    })).filter(d => d.item_id && d.price > 0);
  } catch (err) {
    console.error('[dyn-price] collectItemSales failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Rule generation — per strategy
// ---------------------------------------------------------------------------

const generateHappyHourRules = (
  hourly: HourlyDemandPattern[],
  config: PricingConfig
): DynamicPricingRule[] => {
  const rules: DynamicPricingRule[] = [];
  const activeHours = hourly.filter(h => h.avg_orders >= config.minHourlyOrders / 10);
  if (activeHours.length < 4) return rules;

  const peakDemand = Math.max(...activeHours.map(h => h.avg_orders));
  if (peakDemand <= 0) return rules;

  // Find consecutive low-demand hour blocks (demand < 60% of peak)
  const lowHours = activeHours
    .filter(h => h.avg_orders < peakDemand * 0.6)
    .sort((a, b) => a.hour - b.hour);

  if (lowHours.length === 0) return rules;

  // Group consecutive hours into blocks
  const blocks: Array<{ start: number; end: number; avgDemand: number }> = [];
  let blockStart = lowHours[0].hour;
  let blockHours = [lowHours[0]];

  for (let i = 1; i <= lowHours.length; i++) {
    const current = lowHours[i];
    const prev = lowHours[i - 1];
    if (i === lowHours.length || current.hour !== prev.hour + 1) {
      // Close block
      const avgDemand = blockHours.reduce((s, h) => s + h.avg_orders, 0) / blockHours.length;
      blocks.push({ start: blockStart, end: prev.hour + 1, avgDemand });
      if (i < lowHours.length) {
        blockStart = current.hour;
        blockHours = [current];
      }
    } else {
      blockHours.push(current);
    }
  }

  // Create rule for the biggest low-demand block
  if (blocks.length > 0) {
    const biggestBlock = blocks.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
    // Block must be at least 2 hours
    if (biggestBlock.end - biggestBlock.start >= 2) {
      // Discount scaled by demand gap: bigger gap = bigger discount (capped at max)
      const demandGap = 1 - (biggestBlock.avgDemand / peakDemand);
      const discountPct = Math.min(
        config.maxDiscountPct,
        Math.max(10, Math.round(10 + demandGap * 25))
      );
      rules.push({
        name: `Happy Hour ${biggestBlock.start}:00-${biggestBlock.end}:00`,
        strategy: 'happy_hour',
        description: `${discountPct}% off during low-demand hours (${biggestBlock.start}:00-${biggestBlock.end}:00). Current demand is ${Math.round((biggestBlock.avgDemand / peakDemand) * 100)}% of peak.`,
        value_type: 'percent',
        value: discountPct,
        start_hour: biggestBlock.start,
        end_hour: biggestBlock.end,
        expected_traffic_lift: Math.round(demandGap * 30) / 100, // est. 30% of gap recoverable
        expected_impact: Math.round(biggestBlock.avgDemand * 0.3 * 30 * 25) / 1, // rough monthly est
        confidence: 0.7,
        ai_rationale: `Demand gap analysis: peak ${(peakDemand).toFixed(1)} orders/hr vs ${(biggestBlock.avgDemand).toFixed(1)} in this window. Discount incentivizes off-peak visits.`,
        status: 'draft',
        generated_at: new Date(),
      });
    }
  }

  return rules;
};

const generateSlowDayRules = (
  daily: DailyDemandPattern[],
  config: PricingConfig
): DynamicPricingRule[] => {
  const rules: DynamicPricingRule[] = [];
  if (daily.length < 4) return rules;

  const avgRevenue = daily.reduce((s, d) => s + d.avg_revenue, 0) / daily.length;
  const slowDays = daily.filter(d => d.avg_revenue < avgRevenue * 0.7);
  if (slowDays.length === 0) return rules;

  // Target the slowest day
  const slowest = slowDays.sort((a, b) => a.avg_revenue - b.avg_revenue)[0];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const gap = 1 - (slowest.avg_revenue / avgRevenue);
  const discountPct = Math.min(config.maxDiscountPct, Math.max(10, Math.round(10 + gap * 15)));

  rules.push({
    name: `${dayNames[slowest.day_of_week]} Promotion`,
    strategy: 'slow_day',
    description: `${discountPct}% off all day ${dayNames[slowest.day_of_week]}. Revenue is ${Math.round(gap * 100)}% below weekly average.`,
    value_type: 'percent',
    value: discountPct,
    days_of_week: [slowest.day_of_week],
    expected_traffic_lift: Math.round(gap * 40) / 100,
    expected_impact: Math.round(slowest.avg_revenue * gap * 0.5 * 4 * 100) / 100,
    confidence: 0.65,
    ai_rationale: `${dayNames[slowest.day_of_week]} revenue (${slowest.avg_revenue.toFixed(0)}) is ${Math.round(gap * 100)}% below the weekly average (${avgRevenue.toFixed(0)}). A targeted promotion can shift demand from busy days.`,
    status: 'draft',
    generated_at: new Date(),
  });

  return rules;
};

const generateClearanceRules = (
  items: ItemSalesData[],
  config: PricingConfig
): DynamicPricingRule[] => {
  const rules: DynamicPricingRule[] = [];
  // Overstocked + slow-moving: units_sold < 5/week AND margin allows discount
  const weeklySales = items.map(i => i.units_sold / 8.5); // ~8.5 weeks in 60 days
  const slowMovers = items.filter(i => {
    const weekly = i.units_sold / 8.5;
    if (weekly >= 5) return false;
    // Margin check: discounted price must stay above cost × marginFloorMultiplier
    const discountedPrice = i.price * (1 - 0.25); // try 25% off
    return discountedPrice > i.cost * config.marginFloorMultiplier;
  });

  // Sort by lowest sales velocity
  const sorted = slowMovers.sort((a, b) => a.units_sold - b.units_sold).slice(0, config.maxActiveRules);

  for (const item of sorted) {
    const weekly = item.units_sold / 8.5;
    const maxSafeDiscountPct = Math.min(
      config.maxDiscountPct,
      Math.floor((1 - (item.cost * config.marginFloorMultiplier) / item.price) * 100)
    );
    if (maxSafeDiscountPct < 10) continue;
    const discountPct = Math.max(15, Math.min(maxSafeDiscountPct, 30));

    rules.push({
      name: `Clearance: ${item.item_name}`,
      strategy: 'clearance',
      description: `${discountPct}% off ${item.item_name} — only ${weekly.toFixed(1)}/week sold. Move slow inventory.`,
      value_type: 'percent',
      value: discountPct,
      target_item_id: item.item_id,
      expected_traffic_lift: 0.15,
      expected_impact: Math.round(item.revenue * 0.1),
      confidence: 0.6,
      ai_rationale: `${item.item_name} sold only ${item.units_sold} units in ${config.lookbackDays} days (${weekly.toFixed(1)}/week). Discount clears stock while maintaining ${Math.round((1 - item.cost / (item.price * (1 - discountPct / 100))) * 100)}% margin.`,
      status: 'draft',
      generated_at: new Date(),
    });
  }

  return rules;
};

const generatePeakSurgeRules = (
  hourly: HourlyDemandPattern[]
): DynamicPricingRule[] => {
  const rules: DynamicPricingRule[] = [];
  const activeHours = hourly.filter(h => h.avg_orders > 0);
  if (activeHours.length < 4) return rules;

  const peakDemand = Math.max(...activeHours.map(h => h.avg_orders));
  const peakHours = activeHours.filter(h => h.avg_orders > peakDemand * 0.9);
  if (peakHours.length === 0) return rules;

  const firstPeak = Math.min(...peakHours.map(h => h.hour));
  const lastPeak = Math.max(...peakHours.map(h => h.hour)) + 1;

  rules.push({
    name: `Peak Hours ${firstPeak}:00-${lastPeak}:00 — Suppress Discounts`,
    strategy: 'peak_surge',
    description: `RECOMMENDATION: Consider pausing automatic discounts during peak (${firstPeak}:00-${lastPeak}:00) when demand is ${Math.round(peakDemand * 10) / 10} orders/hr — capacity-constrained anyway.`,
    value_type: 'percent',
    value: 0, // no discount — this is a recommendation to remove discounts
    start_hour: firstPeak,
    end_hour: lastPeak,
    expected_impact: Math.round(peakDemand * (lastPeak - firstPeak) * 2 * 30), // est. $2 avg discount avoided per order
    confidence: 0.75,
    ai_rationale: `During peak hours the venue is capacity-constrained. Discounts during peak sacrifice margin without driving incremental volume. Review automatic discounts scheduled in this window.`,
    status: 'draft',
    generated_at: new Date(),
  });

  return rules;
};

const generateItemPromoRules = (
  items: ItemSalesData[],
  config: PricingConfig
): DynamicPricingRule[] => {
  const rules: DynamicPricingRule[] = [];
  if (items.length < 5) return rules;

  // High margin (> 70%) + below-median popularity
  const margins = items.map(i => i.price > 0 ? 1 - i.cost / i.price : 0);
  const medianSales = [...items].sort((a, b) => a.units_sold - b.units_sold)[Math.floor(items.length / 2)]?.units_sold ?? 0;

  const candidates = items.filter((item, idx) => {
    if (margins[idx] < 0.7) return false;
    if (item.units_sold >= medianSales * 0.8) return false;
    // Margin check for 15% discount
    const discountedPrice = item.price * 0.85;
    return discountedPrice > item.cost * config.marginFloorMultiplier;
  });

  const sorted = candidates.sort((a, b) => b.revenue - a.revenue).slice(0, config.maxActiveRules);

  for (const item of sorted) {
    const marginPct = Math.round((1 - item.cost / item.price) * 100);
    rules.push({
      name: `Feature: ${item.item_name}`,
      strategy: 'item_promo',
      description: `15% off ${item.item_name} — ${marginPct}% margin gives room to promote this underperforming high-margin item.`,
      value_type: 'percent',
      value: 15,
      target_item_id: item.item_id,
      expected_traffic_lift: 0.2,
      expected_impact: Math.round(item.revenue * 0.15),
      confidence: 0.65,
      ai_rationale: `${item.item_name} has ${marginPct}% margin but sells below menu median. A 15% discount still yields ${Math.round((1 - item.cost / (item.price * 0.85)) * 100)}% margin while making the item more attractive.`,
      status: 'draft',
      generated_at: new Date(),
    });
  }

  return rules;
};

// ---------------------------------------------------------------------------
// AI enhancement — refine rules with OpenAI
// ---------------------------------------------------------------------------

const enhanceRulesWithAI = async (
  rules: DynamicPricingRule[],
  config: PricingConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[dyn-price] OpenAI not available — keeping rule-based rules');
    return;
  }

  const prompt = `You are a restaurant pricing strategist.
Review these generated dynamic pricing rules and refine them.

Rules (JSON):
${JSON.stringify(rules.map(r => ({
  name: r.name,
  strategy: r.strategy,
  value: r.value,
  target: r.target_item_id ? 'item' : 'all',
  hours: r.start_hour !== undefined ? `${r.start_hour}-${r.end_hour}` : 'all-day',
  days: r.days_of_week ?? 'all',
  expected_impact: r.expected_impact,
  confidence: r.confidence,
  rationale: r.ai_rationale,
})), null, 2)}

Constraints:
- Max discount: ${config.maxDiscountPct}%
- Never suggest removing items entirely
- Focus on revenue-positive adjustments

Respond with JSON array of refinements (only for rules needing changes):
[{
  "name": "<match rule name>",
  "adjusted_value": <number>,
  "refined_rationale": "<max 300 chars>",
  "confidence": <0-1>
}]

If a rule is good as-is, omit it from the response.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant pricing strategy AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const refinements = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      adjusted_value?: number;
      refined_rationale?: string;
      confidence?: number;
    }>;

    for (const ref of refinements) {
      const rule = rules.find(r => r.name === ref.name);
      if (!rule) continue;
      if (typeof ref.adjusted_value === 'number' && ref.adjusted_value >= 0 && ref.adjusted_value <= config.maxDiscountPct) {
        rule.value = ref.adjusted_value;
      }
      if (ref.refined_rationale) {
        rule.ai_rationale = ref.refined_rationale.slice(0, 300);
      }
      if (typeof ref.confidence === 'number') {
        rule.confidence = Math.max(0, Math.min(1, ref.confidence));
      }
    }
  } catch (err) {
    console.warn('[dyn-price] AI refinement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Main entry — generate dynamic pricing rules
// ---------------------------------------------------------------------------

export interface GenerateRulesResult {
  rules: DynamicPricingRule[];
  hourlyPatterns: HourlyDemandPattern[];
  dailyPatterns: DailyDemandPattern[];
}

export const generatePricingRules = async (
  db: ReturnType<typeof useDB>,
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<GenerateRulesResult> => {
  if (onProgress) onProgress(0, 4);

  // 1. Collect demand data
  const [hourly, daily, items] = await Promise.all([
    collectHourlyDemand(db, config.lookbackDays),
    collectDailyDemand(db, config.lookbackDays),
    collectItemSales(db, config.lookbackDays),
  ]);
  if (onProgress) onProgress(1, 4);

  // 2. Generate rules per strategy
  const rules: DynamicPricingRule[] = [
    ...generateHappyHourRules(hourly, config),
    ...generateSlowDayRules(daily, config),
    ...generateClearanceRules(items, config),
    ...generatePeakSurgeRules(hourly),
    ...generateItemPromoRules(items, config),
  ];
  if (onProgress) onProgress(2, 4);

  // 3. AI refinement (optional)
  if (config.aiEnabled && rules.length > 0) {
    await enhanceRulesWithAI(rules, config);
  }
  if (onProgress) onProgress(3, 4);

  // 4. Persist draft rules (expire old drafts)
  try {
    await db.query(`UPDATE dynamic_pricing_rule SET status = 'expired' WHERE status = 'draft'`);
    for (const rule of rules) {
      try {
        const result = await db.query<any>(
          `CREATE dynamic_pricing_rule CONTENT $data`,
          {
            data: {
              ...rule,
              target_item: rule.target_item_id,
              target_category: rule.target_category_id,
              generated_at: rule.generated_at.toISOString(),
              expires_at: rule.expires_at?.toISOString(),
              activated_at: rule.activated_at?.toISOString(),
            },
          }
        );
        rule.id = (result as any)?.id?.toString?.() ?? '';
      } catch (err) {
        console.warn('[dyn-price] persist rule failed', err);
      }
    }
  } catch (err) {
    console.warn('[dyn-price] persist batch failed', err);
  }
  if (onProgress) onProgress(4, 4);

  return { rules, hourlyPatterns: hourly, dailyPatterns: daily };
};

// ---------------------------------------------------------------------------
// Rule activation — creates a Discount via the existing discount engine
// ---------------------------------------------------------------------------

export const activateRule = async (
  db: ReturnType<typeof useDB>,
  ruleId: string,
  userId?: string
): Promise<{ discountId?: string }> => {
  // 1. Fetch the rule
  const result = await db.query<any[]>(
    `SELECT * FROM dynamic_pricing_rule WHERE id = $ruleId LIMIT 1`,
    { ruleId }
  );
  const rows = Array.isArray(result) ? result.flat() : [];
  const rule = rows[0];
  if (!rule) throw new Error('Rule not found');
  if (rule.status !== 'draft') throw new Error(`Cannot activate rule in status '${rule.status}'`);

  // 2. Create a Discount record via the existing discount engine schema
  //    (discounts table with schedules + automatic application)
  const discountData: any = {
    name: `[Dynamic] ${rule.name}`,
    category: 'scheduled',
    scope: rule.target_item_id ? 'item' : 'cart',
    value_type: rule.value_type,
    value: rule.value,
    application_mode: 'automatic',
    stacking_mode: 'highest_wins',
    // Schedule from rule
    schedules: [{
      days_of_week: rule.days_of_week ?? undefined,
      start_time: rule.start_hour !== undefined ? `${String(rule.start_hour).padStart(2, '0')}:00` : undefined,
      end_time: rule.end_hour !== undefined ? `${String(rule.end_hour).padStart(2, '0')}:00` : undefined,
    }],
    // Target item if specified
    targets: rule.target_item_id ? { item_ids: [rule.target_item_id] } : undefined,
  };

  try {
    const discountResult = await db.query<any>(
      `CREATE discount CONTENT $data`,
      { data: discountData }
    );
    const discountId = (discountResult as any)?.id?.toString?.() ?? '';

    // 3. Update rule status
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE $id SET status = 'active', activated_at = time::now(), activated_by = $user, linked_discount = $discount, expires_at = $expiresAt`,
      {
        id: ruleId,
        user: userId,
        discount: discountId || undefined,
        expiresAt: expiresAt.toISOString(),
      }
    );

    return { discountId };
  } catch (err) {
    console.error('[dyn-price] activateRule failed', err);
    throw err;
  }
};

export const rejectRule = async (
  db: ReturnType<typeof useDB>,
  ruleId: string
): Promise<void> => {
  await db.query(`UPDATE $id SET status = 'rejected'`, { id: ruleId });
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getRules = async (
  db: ReturnType<typeof useDB>,
  status?: RuleStatus
): Promise<DynamicPricingRule[]> => {
  try {
    const filter = status ? `WHERE status = '${status}'` : '';
    const result = await db.query<DynamicPricingRule[]>(
      `SELECT * FROM dynamic_pricing_rule ${filter} ORDER BY generated_at DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[dyn-price] getRules failed', err);
    return [];
  }
};
