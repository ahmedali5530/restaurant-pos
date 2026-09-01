/**
 * AI Price Elasticity Analysis service — optimal pricing per menu item.
 *
 * 14th POSR-exclusive differentiator — Toast and Square have NO price
 * elasticity analysis. Enterprise analytics tools (Aptech, Revenue Management
 * Solutions) charge $500+/mo. POSR offers it free.
 *
 * Distinct from dynamic-pricing.service (which creates time-based discount
 * rules). Price Elasticity computes the elasticity COEFFICIENT per item
 * (how many % demand drops for 1% price increase), then AI recommends the
 * OPTIMAL price point for maximum revenue or profit.
 *
 * Algorithm:
 *   1. For each menu_item, find periods with different prices (from order_item)
 *   2. Compute elasticity = %Δ quantity / %Δ price (midpoint method)
 *   3. Classification:
 *      - elastic (|e| > 1): price-sensitive — lower price increases revenue
 *      - inelastic (|e| < 1): price-insensitive — raise price increases revenue
 *      - unitary (|e| = 1): balanced
 *   4. AI recommendation: optimal price for max revenue (respects margin floor)
 *   5. Estimated revenue impact of adopting recommended price
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ElasticityType = 'elastic' | 'inelastic' | 'unitary' | 'insufficient_data';
export type PriceAction = 'raise_price' | 'lower_price' | 'keep_price' | 'insufficient_data';

export interface PriceElasticityResult {
  id?: string;
  menu_item?: string;
  menu_item_name: string;
  category?: string;
  current_price: number;
  food_cost: number;
  current_margin_pct: number;
  elasticity_coef: number;       // negative; |e| > 1 = elastic
  elasticity_type: ElasticityType;
  avg_weekly_qty: number;
  avg_weekly_revenue: number;
  recommended_price: number;
  recommended_action: PriceAction;
  est_revenue_impact_pct: number;
  est_weekly_revenue_change: number;
  confidence_score: number;       // 0-1
  ai_insight?: string;
  analysis_period_start?: Date;
  analysis_period_end?: Date;
  data_points: number;
  action_taken: string;
  analyzed_at: Date;
  branch_id?: string;
}

export interface ElasticityConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  minDataPoints: number;
  minWeeklyQty: number;
  marginFloorMultiplier: number;
  maxPriceIncreasePct: number;
  maxPriceDecreasePct: number;
}

export const DEFAULT_ELASTICITY_CONFIG: ElasticityConfig = {
  aiEnabled: true,
  lookbackDays: 180,
  minDataPoints: 3,
  minWeeklyQty: 5,
  marginFloorMultiplier: 1.5,
  maxPriceIncreasePct: 0.20,
  maxPriceDecreasePct: 0.15,
};

export const readElasticityConfig = (settings: any): ElasticityConfig => ({
  aiEnabled: settings?.elasticity_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.elasticity_lookback_days, 180),
  minDataPoints: safeNumber(settings?.elasticity_min_data_points, 3),
  minWeeklyQty: safeNumber(settings?.elasticity_min_weekly_qty, 5),
  marginFloorMultiplier: safeNumber(settings?.elasticity_margin_floor_multiplier, 1.5),
  maxPriceIncreasePct: safeNumber(settings?.elasticity_max_price_increase_pct, 0.20),
  maxPriceDecreasePct: safeNumber(settings?.elasticity_max_price_decrease_pct, 0.15),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const classifyElasticity = (coef: number): ElasticityType => {
  const abs = Math.abs(coef);
  if (abs > 1.1) return 'elastic';
  if (abs < 0.9) return 'inelastic';
  return 'unitary';
};

// Compute optimal price for maximum revenue using elasticity coefficient
// Revenue = price × qty = price × (qty_base × (price/current_price)^elasticity)
// dRevenue/dPrice = 0 → optimal_price = current_price × (elasticity / (elasticity + 1))
// For inelastic items (|e| < 1), optimal = raise toward infinity (capped)
const computeOptimalPrice = (
  currentPrice: number,
  elasticity: number,
  foodCost: number,
  cfg: ElasticityConfig
): { price: number; action: PriceAction } => {
  const marginFloor = foodCost * cfg.marginFloorMultiplier;
  const maxIncrease = currentPrice * (1 + cfg.maxPriceIncreasePct);
  const maxDecrease = currentPrice * (1 - cfg.maxPriceDecreasePct);

  // For revenue maximization with constant-elasticity demand curve:
  // optimal_price = current_price × (elasticity / (elasticity + 1))
  // elasticity is negative (e.g., -1.5), so elasticity/(elasticity+1) = -1.5/-0.5 = 3
  // That means price should go UP significantly for inelastic items
  if (elasticity === 0) {
    return { price: currentPrice, action: 'keep_price' };
  }

  const ratio = elasticity / (elasticity + 1);
  let optimal = currentPrice * ratio;

  // If elasticity is inelastic (|e| < 1), ratio > 1 → price goes up
  // If elasticity is elastic (|e| > 1), ratio < 1 → price goes down (but > 0)
  // Cap to bounds
  optimal = Math.max(marginFloor, Math.min(maxIncrease, optimal));
  optimal = Math.max(maxDecrease, optimal);
  optimal = Math.max(marginFloor, optimal);

  // Round to nearest $0.50
  optimal = Math.round(optimal * 2) / 2;

  const changePct = (optimal - currentPrice) / currentPrice;
  if (Math.abs(changePct) < 0.03) { // within 3% → keep
    return { price: currentPrice, action: 'keep_price' };
  }
  return {
    price: optimal,
    action: optimal > currentPrice ? 'raise_price' : 'lower_price',
  };
};

// Estimate revenue impact: new_qty = old_qty × (new_price/old_price)^elasticity
const estimateRevenueImpact = (
  currentPrice: number,
  newPrice: number,
  elasticity: number,
  currentWeeklyQty: number
): { pct: number; weeklyChange: number } => {
  if (currentPrice === 0) return { pct: 0, weeklyChange: 0 };
  const priceRatio = newPrice / currentPrice;
  const qtyMultiplier = Math.pow(priceRatio, elasticity);
  const newQty = currentWeeklyQty * qtyMultiplier;
  const currentRevenue = currentPrice * currentWeeklyQty;
  const newRevenue = newPrice * newQty;
  const weeklyChange = newRevenue - currentRevenue;
  const pct = currentRevenue > 0 ? (weeklyChange / currentRevenue) * 100 : 0;
  return { pct, weeklyChange };
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface MenuItemData {
  id: string;
  name: string;
  category?: string;
  price: number;
  cost: number;
}

const fetchMenuItems = async (db: any): Promise<MenuItemData[]> => {
  try {
    const result = await db.query(
      `SELECT id, name, price, cost, categories FROM menu_item
       WHERE deleted_at IS NONE
       LIMIT 200`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map((r: any) => ({
      id: r.id?.toString?.() ?? '',
      name: r.name ?? 'Unknown',
      category: Array.isArray(r.categories) ? r.categories[0] : r.categories,
      price: safeNumber(r.price, 0),
      cost: safeNumber(r.cost, 0),
    }));
  } catch (err) {
    console.warn('[elasticity] fetchMenuItems failed', err);
    return [];
  }
};

interface PricePeriod {
  price: number;
  qty: number;
  startDate: Date;
  endDate: Date;
}

const fetchPricePeriods = async (
  db: any,
  menuItemId: string,
  cfg: ElasticityConfig
): Promise<{ periods: PricePeriod[]; currentWeeklyQty: number }> => {
  try {
    // Get all order_items for this menu_item, grouped by price
    const result = await db.query(
      `SELECT
         price AS sale_price,
         count() AS qty,
         min(created_at) AS period_start,
         max(created_at) AS period_end
       FROM order_item
       WHERE item = $iid
         AND created_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY price
       ORDER BY period_start ASC`,
      { iid: menuItemId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return { periods: [], currentWeeklyQty: 0 };

    const periods: PricePeriod[] = rows.map((r: any) => ({
      price: safeNumber(r.sale_price, 0),
      qty: safeNumber(r.qty, 0),
      startDate: new Date(r.period_start),
      endDate: new Date(r.period_end),
    }));

    // Current weekly qty = last period qty / weeks in that period
    const lastPeriod = periods[periods.length - 1];
    const daysInLast = Math.max(1, (Date.now() - lastPeriod.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const weeklyQty = lastPeriod.qty / (daysInLast / 7);

    return { periods, currentWeeklyQty: weeklyQty };
  } catch (err) {
    console.warn('[elasticity] fetchPricePeriods failed', err);
    return { periods: [], currentWeeklyQty: 0 };
  }
};

// ---------------------------------------------------------------------------
// Elasticity calculation — midpoint method
// ---------------------------------------------------------------------------

const computeElasticity = (periods: PricePeriod[]): {
  coef: number;
  confidence: number;
  dataPoints: number;
} => {
  if (periods.length < 2) {
    return { coef: 0, confidence: 0, dataPoints: periods.length };
  }

  // Use all consecutive period pairs, average the elasticities
  const elasticities: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const p1 = periods[i - 1];
    const p2 = periods[i];
    if (p1.price === p2.price) continue; // no price change
    // Midpoint method: %ΔQ = (Q2-Q1)/((Q1+Q2)/2), %ΔP = (P2-P1)/((P1+P2)/2)
    const avgQty = (p1.qty + p2.qty) / 2;
    const avgPrice = (p1.price + p2.price) / 2;
    if (avgQty === 0 || avgPrice === 0) continue;
    const pctQtyChange = (p2.qty - p1.qty) / avgQty;
    const pctPriceChange = (p2.price - p1.price) / avgPrice;
    if (pctPriceChange === 0) continue;
    const e = pctQtyChange / pctPriceChange;
    // Sanity: elasticity should be negative (price up → demand down)
    if (e < 0) elasticities.push(e);
    else if (e > 0 && e < 0.5) elasticities.push(-e); // weak positive, treat as negative
  }

  if (elasticities.length === 0) {
    return { coef: 0, confidence: 0, dataPoints: periods.length };
  }

  const avgElasticity = elasticities.reduce((a, b) => a + b, 0) / elasticities.length;
  // Confidence: based on data points + variance
  const variance = elasticities.reduce((s, e) => s + Math.pow(e - avgElasticity, 2), 0) / elasticities.length;
  const stddev = Math.sqrt(variance);
  const cv = Math.abs(avgElasticity) > 0 ? stddev / Math.abs(avgElasticity) : 1;
  // Confidence: more data points + lower CV = higher confidence
  const dataPointsFactor = Math.min(1, elasticities.length / 5);
  const varianceFactor = Math.max(0, 1 - cv);
  const confidence = (dataPointsFactor * 0.6 + varianceFactor * 0.4);

  return {
    coef: avgElasticity,
    confidence: Math.max(0, Math.min(1, confidence)),
    dataPoints: elasticities.length,
  };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  results: PriceElasticityResult[],
  _cfg: ElasticityConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || results.length === 0) return;

  // Only enhance items with actionable recommendations
  const actionable = results.filter(r =>
    r.recommended_action !== 'keep_price' && r.recommended_action !== 'insufficient_data'
  ).slice(0, 12);

  if (actionable.length === 0) return;

  const prompt = `You are a restaurant menu pricing strategist.
For each menu item below, provide a concise insight (max 200 chars) explaining the pricing recommendation.

Items (JSON):
${JSON.stringify(actionable.map(r => ({
  name: r.menu_item_name,
  category: r.category,
  current_price: r.current_price,
  food_cost: r.food_cost,
  margin_pct: r.current_margin_pct,
  elasticity: r.elasticity_coef,
  elasticity_type: r.elasticity_type,
  avg_weekly_qty: r.avg_weekly_qty,
  recommended_price: r.recommended_price,
  recommended_action: r.recommended_action,
  est_revenue_impact_pct: r.est_revenue_impact_pct,
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match menu_item_name>",
  "insight": "<max 200 chars — why this price + revenue impact>"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a menu pricing AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 1000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string; insight?: string;
    }>;
    for (const item of parsed) {
      const result = results.find(r => r.menu_item_name === item.name);
      if (result && item.insight) {
        result.ai_insight = item.insight.slice(0, 200);
      }
    }
  } catch (err) { console.warn('[elasticity] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runElasticityAnalysis = async (
  db: ReturnType<typeof useDB>,
  config: ElasticityConfig = DEFAULT_ELASTICITY_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ results: PriceElasticityResult[]; analyzed: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch all menu items
  const menuItems = await fetchMenuItems(db);
  if (onProgress) onProgress(1, 2);

  // 2. Analyze each item
  const results: PriceElasticityResult[] = [];
  const lookbackStart = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);

  for (let i = 0; i < menuItems.length; i++) {
    if (onProgress && i % 10 === 0) {
      onProgress(1 + Math.floor((i / Math.max(1, menuItems.length)) * 1), 2);
    }
    const item = menuItems[i];
    try {
      const { periods, currentWeeklyQty } = await fetchPricePeriods(db, item.id, config);

      // Skip items with insufficient data
      if (periods.length < config.minDataPoints || currentWeeklyQty < config.minWeeklyQty) {
        continue;
      }

      const { coef, confidence, dataPoints } = computeElasticity(periods);
      if (coef === 0 || dataPoints < config.minDataPoints) {
        continue;
      }

      const elasticityType = classifyElasticity(coef);
      const { price: recPrice, action } = computeOptimalPrice(
        item.price, coef, item.cost, config
      );
      const { pct, weeklyChange } = estimateRevenueImpact(
        item.price, recPrice, coef, currentWeeklyQty
      );

      const currentMarginPct = item.price > 0
        ? ((item.price - item.cost) / item.price) * 100
        : 0;

      results.push({
        menu_item: item.id,
        menu_item_name: item.name,
        category: item.category,
        current_price: item.price,
        food_cost: item.cost,
        current_margin_pct: Math.round(currentMarginPct * 10) / 10,
        elasticity_coef: Math.round(coef * 100) / 100,
        elasticity_type: elasticityType,
        avg_weekly_qty: Math.round(currentWeeklyQty * 10) / 10,
        avg_weekly_revenue: Math.round(item.price * currentWeeklyQty * 100) / 100,
        recommended_price: recPrice,
        recommended_action: action,
        est_revenue_impact_pct: Math.round(pct * 10) / 10,
        est_weekly_revenue_change: Math.round(weeklyChange * 100) / 100,
        confidence_score: Math.round(confidence * 100) / 100,
        analysis_period_start: lookbackStart,
        analysis_period_end: new Date(),
        data_points: dataPoints,
        action_taken: 'none',
        analyzed_at: new Date(),
      });
    } catch (err) {
      console.warn('[elasticity] analyze failed for', item.name, err);
    }
  }

  // 3. AI enhancement
  if (config.aiEnabled && results.length > 0) {
    await enhanceWithAI(results, config);
  }

  // 4. Persist (refresh — delete old, create new)
  try {
    await db.query(`DELETE FROM price_elasticity_result WHERE analyzed_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const result of results) {
    try {
      await db.query(`CREATE price_elasticity_result CONTENT $data`, {
        data: {
          ...result,
          analysis_period_start: result.analysis_period_start?.toISOString(),
          analysis_period_end: result.analysis_period_end?.toISOString(),
          analyzed_at: result.analyzed_at.toISOString(),
        },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { results, analyzed: menuItems.length };
};

// ---------------------------------------------------------------------------
// Read + update
// ---------------------------------------------------------------------------

export const getElasticityResults = async (
  db: ReturnType<typeof useDB>
): Promise<PriceElasticityResult[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM price_elasticity_result
       WHERE action_taken = 'none'
         AND recommended_action != 'keep_price'
       ORDER BY
         CASE recommended_action WHEN 'raise_price' THEN 0 WHEN 'lower_price' THEN 1 ELSE 2 END,
         ABS(est_weekly_revenue_change) DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getElasticitySummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  total: number;
  raisePrice: number;
  lowerPrice: number;
  elastic: number;
  inelastic: number;
  totalRevenueImpact: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(recommended_action = 'raise_price') AS raise_price,
         math::count(recommended_action = 'lower_price') AS lower_price,
         math::count(elasticity_type = 'elastic') AS elastic,
         math::count(elasticity_type = 'inelastic') AS inelastic,
         math::sum(est_weekly_revenue_change) AS total_impact
       FROM price_elasticity_result
       WHERE action_taken = 'none'
         AND recommended_action != 'keep_price'
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      raisePrice: safeNumber(row.raise_price, 0),
      lowerPrice: safeNumber(row.lower_price, 0),
      elastic: safeNumber(row.elastic, 0),
      inelastic: safeNumber(row.inelastic, 0),
      totalRevenueImpact: safeNumber(row.total_impact, 0),
    };
  } catch {
    return { total: 0, raisePrice: 0, lowerPrice: 0, elastic: 0, inelastic: 0, totalRevenueImpact: 0 };
  }
};

export const updateElasticityAction = async (
  db: ReturnType<typeof useDB>, resultId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: resultId, action });
};
