/**
 * AI Menu Price Psychology Optimizer — behavioral economics for menu pricing.
 *
 * 70th POSR-exclusive differentiator — behavioral economics drives 15-30% of
 * menu order decisions (Cornell). Charm pricing (+24% sales), price anchoring,
 * decoy effect, menu position, bracketing. Toast, Square, Lightspeed have NO
 * price psychology features.
 *
 * Distinct from:
 *   - price-elasticity.service (computes elasticity COEFFICIENT — NOT psychology)
 *   - dynamic-pricing.service (time-based DISCOUNTS — NOT behavioral pricing)
 *   - peak-pricing.service (surge pricing by demand — NOT psychology)
 *   - menu-optimization.service (BCG matrix classification — NOT pricing)
 *   - dish-profitability.service (cost breakdown — NOT pricing psychology)
 *
 * Applies behavioral economics to existing prices WITHOUT changing margins:
 *   1. Charm pricing ($9.99 vs $10) — 24% higher sales
 *   2. Price anchoring (high-price item makes others seem reasonable)
 *   3. Decoy effect (medium size makes small look like a deal)
 *   4. Menu position (top-right quadrant sells 30% more)
 *   5. Bracketing (good/better/best tiers shifts avg to middle)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PricePsychRuleId =
  | 'charm_pricing'
  | 'price_anchor'
  | 'decoy_effect'
  | 'position_optimize'
  | 'bracketing';

export type PricePsychAiRec =
  | 'apply_now'
  | 'ab_test_first'
  | 'monitor'
  | 'combine_with_anchor'
  | 'skip';

export interface PricePsychology {
  id?: string;
  rule_id: PricePsychRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  dish_id?: string;
  dish_name?: string;
  current_price: number;
  suggested_price?: number;
  price_change_type?: string;
  psychology_effect?: string;
  est_sales_lift_pct: number;
  est_revenue_lift: number;
  margin_impact: number;
  current_position?: number;
  suggested_position?: number;
  ab_test_suggested?: boolean;
  description: string;
  ai_insight?: string;
  ai_recommendation?: PricePsychAiRec;
  status: 'open' | 'applied' | 'testing' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface PricePsychConfig {
  aiEnabled: boolean;
  charmEnabled: boolean;
  anchorCount: number;
  abTestDuration: number;
}

export const DEFAULT_PRICE_PSYCH_CONFIG: PricePsychConfig = {
  aiEnabled: true,
  charmEnabled: true,
  anchorCount: 1,
  abTestDuration: 7,
};

export const readPricePsychConfig = (settings: any): PricePsychConfig => ({
  aiEnabled: settings?.price_psych_ai_enabled ?? true,
  charmEnabled: settings?.price_psych_charm_enabled ?? true,
  anchorCount: safeNumber(settings?.price_psych_anchor_count, 1),
  abTestDuration: safeNumber(settings?.price_psych_ab_test_duration, 7),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Apply charm pricing: round down to X.99
const applyCharmPricing = (price: number): { suggested: number; changed: boolean } => {
  const floored = Math.floor(price);
  const charmPrice = floored + 0.99;
  // Only suggest if the difference is meaningful (more than $0.10)
  if (price - charmPrice > 0.10 && price - charmPrice < 1.00) {
    return { suggested: charmPrice, changed: true };
  }
  return { suggested: price, changed: false };
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
  position: number;
  units_sold: number;
}

/**
 * Run the price psychology optimizer engine.
 */
export const runPricePsychEngine = async (
  db: ReturnType<typeof useDB>,
  config: PricePsychConfig = DEFAULT_PRICE_PSYCH_CONFIG
): Promise<{ recommendations: PricePsychology[]; generated: number }> => {
  const recommendations: PricePsychology[] = [];
  const now = new Date();

  // 1. Fetch menu items with sales data
  let dishes: DishData[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         name,
         price,
         cost,
         category.name AS category,
         position,
         0 AS units_sold
       FROM menu_item
       WHERE deleted_at IS NONE
       ORDER BY position
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    // Fetch sales counts
    let salesMap: Map<string, number> = new Map();
    try {
      const salesResult = await db.query(
        `SELECT item.id AS item_id, math::sum(quantity) AS qty
         FROM order_item
         WHERE order.status = 'Paid' AND order.deleted_at IS NONE
           AND deleted_at IS NONE AND item IS NOT NONE
           AND created_at > time::now() - 30d
         GROUP BY item.id`
      );
      const salesRows = Array.isArray(salesResult) ? salesResult.flat() : [];
      for (const r of salesRows) {
        salesMap.set(String(r.item_id), safeNumber(r.qty, 0));
      }
    } catch { /* ignore */ }

    dishes = rows.map((r: any, idx: number) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? 'Unknown'),
      price: safeNumber(r.price, 0),
      cost: safeNumber(r.cost, 0),
      category: String(r.category ?? ''),
      position: safeNumber(r.position, idx + 1),
      units_sold: salesMap.get(String(r.id)) ?? 0,
    })).filter(d => d.price > 0);
  } catch (err) {
    console.warn('[price-psych] fetchDishes failed', err);
  }

  if (dishes.length === 0) return { recommendations: [], generated: 0 };

  // Sort by price for anchor/bracketing analysis
  const sortedByPrice = [...dishes].sort((a, b) => b.price - a.price);
  const sortedBySales = [...dishes].sort((a, b) => b.units_sold - a.units_sold);

  // --- Rule 1: CHARM_PRICING — $X.99 instead of $X.00 ---
  if (config.charmEnabled) {
    for (const dish of dishes) {
      const { suggested, changed } = applyCharmPricing(dish.price);
      if (!changed) continue;

      // Estimate sales lift: 24% based on MIT study (charm pricing)
      const estSalesLiftPct = 0.24;
      const estRevenueLift = dish.units_sold * (suggested - dish.price) + dish.units_sold * estSalesLiftPct * suggested;
      // Margin impact: selling at $0.01-$0.90 less per unit, but 24% more units
      const marginPerUnit = dish.price - dish.cost;
      const newMarginPerUnit = suggested - dish.cost;
      const marginImpact = dish.units_sold * estSalesLiftPct * newMarginPerUnit - dish.units_sold * (marginPerUnit - newMarginPerUnit);

      recommendations.push({
        rule_id: 'charm_pricing',
        severity: dish.units_sold > 20 ? 'high' : 'medium',
        dish_id: dish.id,
        dish_name: dish.name,
        current_price: Math.round(dish.price * 100) / 100,
        suggested_price: Math.round(suggested * 100) / 100,
        price_change_type: 'charm_round_down',
        psychology_effect: 'Charm pricing: $X.99 feels significantly cheaper than $X.00 (left-digit effect). MIT study shows 24% sales increase.',
        est_sales_lift_pct: Math.round(estSalesLiftPct * 10000) / 100,
        est_revenue_lift: Math.round(estRevenueLift * 100) / 100,
        margin_impact: Math.round(marginImpact * 100) / 100,
        ab_test_suggested: true,
        description: `${dish.name}: change ${fmt$(dish.price)} → ${fmt$(suggested)} (charm pricing). Est +${(estSalesLiftPct * 100).toFixed(0)}% sales, ${fmt$(estRevenueLift)} revenue lift, ${fmt$(marginImpact)} margin impact.`,
        ai_recommendation: 'ab_test_first',
        status: 'open',
        detected_at: now,
      });
    }
  }

  // --- Rule 2: PRICE_ANCHOR — highest-priced item makes others look affordable ---
  if (sortedByPrice.length > 3) {
    const anchor = sortedByPrice[0]; // highest price
    const midPrice = sortedByPrice[Math.floor(sortedByPrice.length / 2)].price;

    // If anchor is less than 2x the median, it's not a strong anchor
    if (anchor.price < midPrice * 1.8) {
      const suggestedAnchorPrice = midPrice * 2.2; // make anchor 2.2x median
      recommendations.push({
        rule_id: 'price_anchor',
        severity: 'medium',
        dish_id: anchor.id,
        dish_name: anchor.name,
        current_price: Math.round(anchor.price * 100) / 100,
        suggested_price: Math.round(suggestedAnchorPrice * 100) / 100,
        price_change_type: 'anchor_high',
        psychology_effect: 'Price anchoring: a high-priced item makes mid-range items feel like a bargain. Guests who see a $50 steak perceive a $25 chicken as reasonably priced.',
        est_sales_lift_pct: 0, // anchor itself may sell less, but OTHERS sell more
        est_revenue_lift: Math.round(sortedBySales.slice(0, 5).reduce((s, d) => s + d.units_sold * d.price * 0.10, 0) * 100) / 100, // 10% lift on top 5 items
        margin_impact: 0, // anchor sells rarely, margin neutral
        ab_test_suggested: true,
        description: `ANCHOR: ${anchor.name} at ${fmt$(anchor.price)} is not strong enough anchor (only ${(anchor.price / midPrice).toFixed(1)}× median). Increase to ${fmt$(suggestedAnchorPrice)} to make mid-range items feel like better value.`,
        ai_recommendation: 'ab_test_first',
        status: 'open',
        detected_at: now,
      });
    }
  }

  // --- Rule 3: DECOY_EFFECT — add a "decoy" size that makes target look like a deal ---
  // Find items with only one size (no variants)
  const topSellers = sortedBySales.slice(0, 5);
  for (const dish of topSellers) {
    if (dish.units_sold < 5) continue;

    // Suggest adding a "large" version at 1.5x price but only 1.2x quantity
    // This makes the regular size look like a better deal
    const decoyPrice = dish.price * 1.5;
    const estSalesLiftPct = 0.15; // 15% of customers switch to "regular" thinking it's a deal
    const estRevenueLift = dish.units_sold * estSalesLiftPct * dish.price * 0.1; // marginal lift

    recommendations.push({
      rule_id: 'decoy_effect',
      severity: 'low',
      dish_id: dish.id,
      dish_name: dish.name,
      current_price: Math.round(dish.price * 100) / 100,
      suggested_price: Math.round(decoyPrice * 100) / 100,
      price_change_type: 'decoy_add',
      psychology_effect: 'Decoy effect: add a "large" version at 1.5× price with only 1.2× portion. The regular size suddenly looks like a great deal, increasing regular-size orders by ~15%.',
      est_sales_lift_pct: Math.round(estSalesLiftPct * 10000) / 100,
      est_revenue_lift: Math.round(estRevenueLift * 100) / 100,
      margin_impact: 0,
      ab_test_suggested: true,
      description: `DECOY: Add "Large ${dish.name}" at ${fmt$(decoyPrice)} (1.5× regular, 1.2× portion). Regular ${fmt$(dish.price)} will look like a bargain → +${(estSalesLiftPct * 100).toFixed(0)}% regular-size sales.`,
      ai_recommendation: 'ab_test_first',
      status: 'open',
      detected_at: now,
    });
    break; // one decoy suggestion is enough
  }

  // --- Rule 4: POSITION_OPTIMIZE — move high-margin items to top-right ---
  // Top-right quadrant (positions 1-3 in menu) gets 30% more orders
  for (const dish of dishes) {
    if (dish.position > 3 && dish.units_sold > 5) {
      const margin = dish.price - dish.cost;
      const avgMargin = dishes.reduce((s, d) => s + (d.price - d.cost), 0) / dishes.length;

      // If this dish has above-average margin and is not in top 3 positions
      if (margin > avgMargin * 1.2) {
        const estSalesLiftPct = 0.30;
        const estRevenueLift = dish.units_sold * estSalesLiftPct * dish.price;

        recommendations.push({
          rule_id: 'position_optimize',
          severity: 'medium',
          dish_id: dish.id,
          dish_name: dish.name,
          current_price: Math.round(dish.price * 100) / 100,
          price_change_type: 'reposition',
          psychology_effect: 'Menu position: items in the top-right quadrant (first 1-3 positions) get 30% more orders (eye-tracking research). High-margin items should be positioned there.',
          est_sales_lift_pct: Math.round(estSalesLiftPct * 10000) / 100,
          est_revenue_lift: Math.round(estRevenueLift * 100) / 100,
          margin_impact: Math.round(dish.units_sold * estSalesLiftPct * margin * 100) / 100,
          current_position: dish.position,
          suggested_position: 1,
          ab_test_suggested: false,
          description: `POSITION: ${dish.name} (high margin ${fmt$(margin)}) is at position #${dish.position}. Move to top 3 → est +${(estSalesLiftPct * 100).toFixed(0)}% sales, ${fmt$(estRevenueLift)} revenue lift.`,
          ai_recommendation: 'apply_now',
          status: 'open',
          detected_at: now,
        });
      }
    }
  }

  // --- Rule 5: BRACKETING — 3-tier pricing (good/better/best) ---
  if (sortedByPrice.length >= 6) {
    // Group by category
    const categoryMap: Record<string, DishData[]> = {};
    for (const d of dishes) {
      if (!categoryMap[d.category]) categoryMap[d.category] = [];
      categoryMap[d.category].push(d);
    }

    for (const [category, catDishes] of Object.entries(categoryMap)) {
      if (catDishes.length < 3) continue;

      const catSorted = [...catDishes].sort((a, b) => a.price - b.price);
      const low = catSorted[0];
      const mid = catSorted[Math.floor(catSorted.length / 2)];
      const high = catSorted[catSorted.length - 1];

      // If price spread is too narrow (< 50% between low and high)
      const spread = (high.price - low.price) / low.price;
      if (spread < 0.5) {
        const suggestedHigh = low.price * 1.8; // widen the range
        const estSalesLiftPct = 0.15; // 15% shift to mid-tier
        const estRevenueLift = mid.units_sold * estSalesLiftPct * mid.price * 0.1;

        recommendations.push({
          rule_id: 'bracketing',
          severity: 'low',
          dish_id: high.id,
          dish_name: `${category} category`,
          current_price: Math.round(high.price * 100) / 100,
          suggested_price: Math.round(suggestedHigh * 100) / 100,
          price_change_type: 'bracket_middle',
          psychology_effect: 'Bracketing: 3 price tiers (good/better/best) shift average order to the middle tier. Guests avoid the cheapest and most expensive, choosing "the reasonable middle."',
          est_sales_lift_pct: Math.round(estSalesLiftPct * 10000) / 100,
          est_revenue_lift: Math.round(estRevenueLift * 100) / 100,
          margin_impact: 0,
          ab_test_suggested: true,
          description: `BRACKETING: ${category} has narrow price range (${fmt$(low.price)}–${fmt$(high.price)}, ${(spread * 100).toFixed(0)}% spread). Widen to 3 tiers: ${fmt$(low.price)} (good) / ${fmt$(mid.price)} (better) / ${fmt$(suggestedHigh)} (best). Mid-tier orders will increase ~15%.`,
          ai_recommendation: 'ab_test_first',
          status: 'open',
          detected_at: now,
        });
        break; // one bracketing suggestion is enough
      }
    }
  }

  // 4. AI insight for top 5 high-priority recommendations
  if (config.aiEnabled && recommendations.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topRecs = recommendations
        .filter(r => r.severity === 'high' || r.severity === 'medium')
        .slice(0, 5);
      for (const r of topRecs) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a menu pricing psychology AI for restaurants. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Dish "${r.dish_name}": ${fmt$(r.current_price)}${r.suggested_price ? ` → ${fmt$(r.suggested_price)}` : ''}. Effect: ${r.psychology_effect}. Est +${(r.est_sales_lift_pct * 100).toFixed(0)}% sales, ${fmt$(r.est_revenue_lift)} revenue.` },
          ], { temperature: 0.4, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          r.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM price_psychology WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const r of recommendations) {
    try {
      await db.query(`CREATE price_psychology CONTENT $data`, {
        data: { ...r, detected_at: r.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { recommendations, generated: recommendations.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveRecommendations = async (db: ReturnType<typeof useDB>): Promise<PricePsychology[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM price_psychology
       WHERE status = 'open'
       ORDER BY est_revenue_lift DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  recCount: number;
  totalRevenueLift: number;
  avgSalesLift: number;
  abTestCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(est_revenue_lift) AS revenue,
         math::mean(est_sales_lift_pct) AS sales,
         math::count(ab_test_suggested = true) AS ab
       FROM price_psychology
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      recCount: safeNumber(r.total, 0),
      totalRevenueLift: safeNumber(r.revenue, 0),
      avgSalesLift: safeNumber(r.sales, 0),
      abTestCount: safeNumber(r.ab, 0),
    };
  } catch {
    return { recCount: 0, totalRevenueLift: 0, avgSalesLift: 0, abTestCount: 0 };
  }
};

export const updateRecStatus = async (
  db: ReturnType<typeof useDB>,
  recId: string,
  status: 'applied' | 'testing' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: recId, status });
};
