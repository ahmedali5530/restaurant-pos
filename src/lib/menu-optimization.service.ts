/**
 * AI Menu Optimization service — menu engineering matrix + pricing recs.
 *
 * Research finding: Toast Menu Intelligence $100+/mo, Square Menu Insights
 * gated to Plus/Pro, Lightspeed Menu Engineering is an add-on. POSR offers
 * it free — analyzes dish popularity + profitability + cost margins and
 * generates BCG-style recommendations.
 *
 * Menu engineering matrix (Boston Consulting Group adapted for restaurants):
 *   STARS       — high popularity + high margin  (promote, feature, protect)
 *   PLOWHORSES  — high popularity + low margin   (raise price or cut cost)
 *   PUZZLES     — low popularity + high margin    (reposition, rename, photo)
 *   DOGS        — low popularity + low margin     (remove or reprice)
 *
 * Algorithm:
 *   1. For each dish, fetch last N days of sales:
 *      - units_sold (sum of order_item.quantity)
 *      - revenue (sum of order_item.price × quantity)
 *      - cost_total (sum of dish.cost × quantity, from recipe items)
 *      - profit = revenue - cost_total
 *      - margin_pct = profit / revenue × 100
 *      - food_cost_pct = cost / price × 100
 *   2. Classify using median split:
 *      - popular = units_sold >= median OR >= min_sales_for_popular
 *      - profitable = margin_pct >= median OR >= (100 - target_food_cost_pct - 10)
 *      → STARS (popular + profitable), PLOWHORSES (popular + !profitable),
 *        PUZZLES (!popular + profitable), DOGS (!popular + !profitable)
 *   3. Pricing recommendation:
 *      - UNDERPRICED if food_cost_pct > target + 10 → suggest increase
 *      - OVERPRICED if food_cost_pct < target - 10 → suggest decrease
 *      - OPTIMAL otherwise
 *   4. AI enhancement (optional):
 *      - OpenAI analyzes the full menu + generates per-dish insights + actions
 *      - Falls back to rule-based actions when AI disabled or unavailable
 *
 * Output: array of MenuInsight, persisted to menu_insight table (24h cache).
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MenuClassification = 'star' | 'plowhorse' | 'puzzle' | 'dog';
export type PricingRecommendation = 'underpriced' | 'overpriced' | 'optimal' | 'no_data';
export type MenuAction = 'promote' | 'reprice' | 'reposition' | 'remove' | 'keep';

export interface MenuInsight {
  id?: string;
  dish?: string;
  dish_id: string;
  dish_name: string;
  category?: string;
  classification: MenuClassification;
  units_sold: number;
  revenue: number;
  cost_total: number;
  profit: number;
  margin_pct: number;
  food_cost_pct: number;
  popularity_rank: number;
  profitability_rank: number;
  pricing_recommendation: PricingRecommendation;
  suggested_price?: number;
  price_change_pct?: number;
  ai_insight?: string;
  ai_action?: MenuAction;
  generated_at: Date;
  expires_at?: Date;
}

export interface MenuOptimizationConfig {
  targetFoodCostPct: number;
  lookbackDays: number;
  minSalesForPopular: number;
  aiEnabled: boolean;
}

export const DEFAULT_MENU_OPT_CONFIG: MenuOptimizationConfig = {
  targetFoodCostPct: 30,
  lookbackDays: 30,
  minSalesForPopular: 20,
  aiEnabled: true,
};

export interface MenuOptimizationSummary {
  totalDishes: number;
  stars: number;
  plowhorses: number;
  puzzles: number;
  dogs: number;
  totalRevenue: number;
  totalProfit: number;
  avgMarginPct: number;
  underpricedCount: number;
  overpricedCount: number;
  potentialRevenueGain: number;
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Config reader
// ---------------------------------------------------------------------------

export const readMenuOptConfig = (settings: any): MenuOptimizationConfig => ({
  targetFoodCostPct: safeNumber(settings?.menu_opt_target_food_cost_pct, 30),
  lookbackDays: safeNumber(settings?.menu_opt_lookback_days, 30),
  minSalesForPopular: safeNumber(settings?.menu_opt_min_sales_for_popular, 20),
  aiEnabled: settings?.menu_opt_ai_enabled ?? true,
});

// ---------------------------------------------------------------------------
// Sales data collection — last N days of dish sales
// ---------------------------------------------------------------------------

interface DishSalesData {
  dish_id: string;
  dish_name: string;
  category?: string;
  price: number;
  cost: number;
  units_sold: number;
  revenue: number;
}

const collectDishSales = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<DishSalesData[]> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  try {
    const result = await db.query<any[]>(
      `SELECT
         item.id AS dish_id,
         item.name AS dish_name,
         item.price AS price,
         item.cost AS cost,
         math::sum(quantity) AS units_sold,
         math::sum(price * quantity) AS revenue
       FROM order_item
       WHERE created_at > $cutoff
         AND deleted_at IS NONE
       GROUP BY dish_id
       FETCH item, item.categories`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map(r => ({
      dish_id: r.dish_id?.toString?.() ?? '',
      dish_name: r.dish_name ?? 'Unknown',
      category: r.category,
      price: safeNumber(r.price, 0),
      cost: safeNumber(r.cost, 0),
      units_sold: safeNumber(r.units_sold, 0),
      revenue: safeNumber(r.revenue, 0),
    })).filter(d => d.dish_id);
  } catch (err) {
    console.error('[menu-opt] collectDishSales failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Classification + ranking
// ---------------------------------------------------------------------------

const median = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const classifyDish = (
  unitsSold: number,
  marginPct: number,
  medianUnits: number,
  medianMargin: number,
  minSalesForPopular: number,
  targetFoodCostPct: number
): MenuClassification => {
  const popular = unitsSold >= Math.max(minSalesForPopular, medianUnits);
  // Profitable: margin above median OR above (100% - target food cost - 10% buffer)
  const minAcceptableMargin = 100 - targetFoodCostPct - 10;
  const profitable = marginPct >= Math.max(medianMargin, minAcceptableMargin);
  if (popular && profitable) return 'star';
  if (popular && !profitable) return 'plowhorse';
  if (!popular && profitable) return 'puzzle';
  return 'dog';
};

const computePricingRecommendation = (
  price: number,
  cost: number,
  targetFoodCostPct: number
): { rec: PricingRecommendation; suggestedPrice?: number; changePct?: number } => {
  if (price <= 0) return { rec: 'no_data' };
  const foodCostPct = (cost / price) * 100;
  // Underpriced: food cost is more than 10pp above target
  if (foodCostPct > targetFoodCostPct + 10) {
    // Suggest price so food cost = target
    const suggestedPrice = cost / (targetFoodCostPct / 100);
    const changePct = ((suggestedPrice - price) / price) * 100;
    return { rec: 'underpriced', suggestedPrice: Math.round(suggestedPrice * 100) / 100, changePct };
  }
  // Overpriced: food cost is more than 10pp below target
  if (foodCostPct < targetFoodCostPct - 10 && foodCostPct > 0) {
    // Suggest price so food cost = target + 5 (slight under-target is fine)
    const suggestedPrice = cost / ((targetFoodCostPct - 5) / 100);
    const changePct = ((suggestedPrice - price) / price) * 100;
    return { rec: 'overpriced', suggestedPrice: Math.round(suggestedPrice * 100) / 100, changePct };
  }
  return { rec: 'optimal' };
};

// ---------------------------------------------------------------------------
// Main entry — generate menu insights
// ---------------------------------------------------------------------------

export const generateMenuInsights = async (
  db: ReturnType<typeof useDB>,
  config: MenuOptimizationConfig = DEFAULT_MENU_OPT_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ insights: MenuInsight[]; summary: MenuOptimizationSummary }> => {
  // 1. Collect sales data
  const salesData = await collectDishSales(db, config.lookbackDays);
  if (salesData.length === 0) {
    return {
      insights: [],
      summary: {
        totalDishes: 0, stars: 0, plowhorses: 0, puzzles: 0, dogs: 0,
        totalRevenue: 0, totalProfit: 0, avgMarginPct: 0,
        underpricedCount: 0, overpricedCount: 0, potentialRevenueGain: 0,
        generatedAt: new Date(),
      },
    };
  }

  // 2. Compute median splits for classification
  const allUnits = salesData.map(d => d.units_sold);
  const allMargins = salesData.map(d => {
    const profit = d.revenue - d.cost * d.units_sold;
    return d.revenue > 0 ? (profit / d.revenue) * 100 : 0;
  });
  const medianUnits = median(allUnits);
  const medianMargin = median(allMargins);

  // 3. Build insights per dish
  const insights: MenuInsight[] = salesData.map(d => {
    const cost_total = d.cost * d.units_sold;
    const profit = d.revenue - cost_total;
    const margin_pct = d.revenue > 0 ? (profit / d.revenue) * 100 : 0;
    const food_cost_pct = d.price > 0 ? (d.cost / d.price) * 100 : 0;

    const classification = classifyDish(
      d.units_sold, margin_pct, medianUnits, medianMargin,
      config.minSalesForPopular, config.targetFoodCostPct
    );

    const pricing = computePricingRecommendation(d.price, d.cost, config.targetFoodCostPct);

    // Rule-based action (overridden by AI later if enabled)
    let action: MenuAction = 'keep';
    if (classification === 'star') action = 'promote';
    else if (classification === 'plowhorse') action = pricing.rec === 'underpriced' ? 'reprice' : 'keep';
    else if (classification === 'puzzle') action = 'reposition';
    else if (classification === 'dog') action = 'remove';

    return {
      dish_id: d.dish_id,
      dish_name: d.dish_name,
      category: d.category,
      classification,
      units_sold: d.units_sold,
      revenue: Math.round(d.revenue * 100) / 100,
      cost_total: Math.round(cost_total * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin_pct: Math.round(margin_pct * 10) / 10,
      food_cost_pct: Math.round(food_cost_pct * 10) / 10,
      popularity_rank: 0, // assigned after sorting
      profitability_rank: 0, // assigned after sorting
      pricing_recommendation: pricing.rec,
      suggested_price: pricing.suggestedPrice,
      price_change_pct: pricing.changePct ? Math.round(pricing.changePct * 10) / 10 : undefined,
      ai_action: action,
      generated_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  });

  // 4. Assign ranks
  const byPopularity = [...insights].sort((a, b) => b.units_sold - a.units_sold);
  byPopularity.forEach((ins, idx) => { ins.popularity_rank = idx + 1; });
  const byProfit = [...insights].sort((a, b) => b.profit - a.profit);
  byProfit.forEach((ins, idx) => { ins.profitability_rank = idx + 1; });

  // 5. AI enhancement (optional)
  if (config.aiEnabled && insights.length > 0) {
    if (onProgress) onProgress(0, insights.length);
    try {
      await enhanceWithAI(insights, db, config);
    } catch (err) {
      console.warn('[menu-opt] AI enhancement failed — keeping rule-based actions', err);
    }
    if (onProgress) onProgress(insights.length, insights.length);
  }

  // 6. Expire old insights + persist new ones
  try {
    await db.query(`UPDATE menu_insight SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const ins of insights) {
      try {
        await db.query(
          `CREATE menu_insight CONTENT $data`,
          {
            data: {
              ...ins,
              dish: ins.dish_id,
              generated_at: ins.generated_at.toISOString(),
              expires_at: ins.expires_at?.toISOString(),
            },
          }
        );
      } catch (err) {
        console.warn('[menu-opt] persist insight failed for', ins.dish_name, err);
      }
    }
  } catch (err) {
    console.warn('[menu-opt] persist batch failed', err);
  }

  // 7. Summary
  const summary: MenuOptimizationSummary = {
    totalDishes: insights.length,
    stars: insights.filter(i => i.classification === 'star').length,
    plowhorses: insights.filter(i => i.classification === 'plowhorse').length,
    puzzles: insights.filter(i => i.classification === 'puzzle').length,
    dogs: insights.filter(i => i.classification === 'dog').length,
    totalRevenue: Math.round(insights.reduce((s, i) => s + i.revenue, 0) * 100) / 100,
    totalProfit: Math.round(insights.reduce((s, i) => s + i.profit, 0) * 100) / 100,
    avgMarginPct: Math.round((insights.reduce((s, i) => s + i.margin_pct, 0) / insights.length) * 10) / 10,
    underpricedCount: insights.filter(i => i.pricing_recommendation === 'underpriced').length,
    overpricedCount: insights.filter(i => i.pricing_recommendation === 'overpriced').length,
    potentialRevenueGain: Math.round(insights.reduce((sum, i) => {
      if (i.suggested_price && i.price_change_pct && i.price_change_pct > 0) {
        return sum + (i.suggested_price - (i.revenue / i.units_sold)) * i.units_sold;
      }
      return sum;
    }, 0) * 100) / 100,
    generatedAt: new Date(),
  };

  return { insights, summary };
};

// ---------------------------------------------------------------------------
// AI enhancement — OpenAI generates per-dish insights + actions
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  insights: MenuInsight[],
  _db: ReturnType<typeof useDB>,
  _config: MenuOptimizationConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[menu-opt] OpenAI service not available — skipping AI enhancement');
    return;
  }

  // Build a compact summary for the AI — top 30 most actionable dishes
  const topForAI = insights
    .filter(i => i.classification !== 'star' || i.pricing_recommendation !== 'optimal')
    .sort((a, b) => {
      // Prioritize: dogs first, then puzzles, then plowhorses, then stars with pricing issues
      const order = { dog: 0, puzzle: 1, plowhorse: 2, star: 3 };
      return order[a.classification] - order[b.classification];
    })
    .slice(0, 30);

  if (topForAI.length === 0) return;

  const prompt = `You are a restaurant menu optimization expert.
Analyze these dishes and provide:
1. A short insight per dish (max 100 chars) — what's happening + why
2. A concrete action: 'promote' | 'reprice' | 'reposition' | 'remove' | 'keep'

Dishes (JSON):
${JSON.stringify(topForAI.map(i => ({
  name: i.dish_name,
  classification: i.classification,
  units_sold: i.units_sold,
  revenue: i.revenue,
  profit: i.profit,
  margin_pct: i.margin_pct,
  food_cost_pct: i.food_cost_pct,
  pricing: i.pricing_recommendation,
  suggested_price: i.suggested_price,
  price_change_pct: i.price_change_pct,
})), null, 2)}

Respond with a JSON array:
[{"name": "...", "insight": "...", "action": "promote"}]

Only include dishes where you have a meaningful insight. Keep insights actionable and specific.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant menu optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 2000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const adjustments = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      insight?: string;
      action?: MenuAction;
    }>;

    for (const adj of adjustments) {
      const insight = insights.find(i => i.dish_name === adj.name);
      if (!insight) continue;
      if (adj.insight) insight.ai_insight = adj.insight.slice(0, 200);
      if (adj.action && ['promote', 'reprice', 'reposition', 'remove', 'keep'].includes(adj.action)) {
        insight.ai_action = adj.action;
      }
    }
  } catch (err) {
    console.warn('[menu-opt] AI call failed', err);
  }
};

// ---------------------------------------------------------------------------
// Insight retrieval
// ---------------------------------------------------------------------------

export const getMenuInsights = async (
  db: ReturnType<typeof useDB>
): Promise<MenuInsight[]> => {
  try {
    const result = await db.query<MenuInsight[]>(
      `SELECT * FROM menu_insight
       WHERE expires_at > time::now()
       ORDER BY
         CASE classification
           WHEN 'dog' THEN 0
           WHEN 'puzzle' THEN 1
           WHEN 'plowhorse' THEN 2
           WHEN 'star' THEN 3
         END,
         profit DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[menu-opt] getMenuInsights failed', err);
    return [];
  }
};
