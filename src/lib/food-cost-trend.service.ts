/**
 * AI Food Cost Trend Analysis service — track ingredient price changes.
 *
 * Research finding: Toast Food Cost Variance $35+/mo (higher tier), Square
 * COGS tracking in Plus. POSR offers it free — analyzes purchase history to
 * identify items with rising/falling costs, computes impact on dish margins,
 * + AI recommendations (renegotiate / substitute / reprice / absorb / monitor).
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type CostTrendDirection = 'rising' | 'falling' | 'stable';
export type CostSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CostRecommendation = 'renegotiate' | 'substitute' | 'reprice_menu' | 'absorb' | 'monitor';

export interface FoodCostTrend {
  id?: string;
  item_id: string;
  item_name: string;
  uom?: string;
  current_price: number;
  previous_price: number;
  price_30d_ago: number;
  price_90d_ago: number;
  price_change_pct_30d: number;
  price_change_pct_90d: number;
  trend_direction: CostTrendDirection;
  avg_monthly_consumption: number;
  monthly_cost_impact: number;
  annual_cost_impact: number;
  affected_dishes?: string[];
  margin_impact_pct: number;
  severity: CostSeverity;
  ai_recommendation?: CostRecommendation;
  ai_insight?: string;
  generated_at: Date;
}

export interface FoodCostConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  risingThreshold: number;
}

export const DEFAULT_FOODCOST_CONFIG: FoodCostConfig = {
  aiEnabled: true,
  lookbackDays: 90,
  risingThreshold: 5,
};

export const readFoodCostConfig = (settings: any): FoodCostConfig => ({
  aiEnabled: settings?.food_cost_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.food_cost_lookback_days, 90),
  risingThreshold: safeNumber(settings?.food_cost_rising_threshold, 5),
});

// ---------------------------------------------------------------------------
// Data collection — fetch purchase price history per item
// ---------------------------------------------------------------------------

interface ItemPriceHistory {
  item_id: string;
  item_name: string;
  uom?: string;
  prices: Array<{ price: number; date: Date; quantity: number }>;
  total_quantity: number;
}

const collectPriceHistory = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<Map<string, ItemPriceHistory>> => {
  const byItem = new Map<string, ItemPriceHistory>();
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const result = await db.query(
      `SELECT
         item.id AS item_id,
         item.name AS item_name,
         item.uom AS uom,
         price,
         quantity,
         created_at
       FROM inventory_purchase_item
       WHERE created_at > $cutoff AND deleted_at IS NONE AND price > 0
       FETCH item`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const row of rows) {
      const itemId = row.item_id?.toString?.() ?? '';
      if (!itemId) continue;
      if (!byItem.has(itemId)) {
        byItem.set(itemId, {
          item_id: itemId,
          item_name: row.item_name ?? 'Unknown',
          uom: row.uom,
          prices: [],
          total_quantity: 0,
        });
      }
      const data = byItem.get(itemId)!;
      const price = safeNumber(row.price, 0);
      const qty = safeNumber(row.quantity, 0);
      data.prices.push({ price, date: new Date(row.created_at), quantity: qty });
      data.total_quantity += qty;
    }
  } catch (err) {
    console.error('[food-cost] collectPriceHistory failed', err);
  }

  return byItem;
};

// Fetch dishes that use this ingredient (from MenuItemRecipe)
const fetchAffectedDishes = async (
  db: ReturnType<typeof useDB>,
  itemId: string
): Promise<string[]> => {
  try {
    const result = await db.query(
      `SELECT dish.name AS dish_name FROM menu_item_recipe
       WHERE item.id = $itemId
       FETCH dish`,
      { itemId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map((r: any) => r.dish_name).filter(Boolean).slice(0, 10);
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Trend computation
// ---------------------------------------------------------------------------

const avgPriceInPeriod = (prices: Array<{ price: number; date: Date; quantity: number }>, days: number): number => {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const inPeriod = prices.filter(p => p.date >= cutoff);
  if (inPeriod.length === 0) return 0;
  // Weighted average by quantity
  const totalQty = inPeriod.reduce((s, p) => s + p.quantity, 0);
  if (totalQty === 0) return inPeriod.reduce((s, p) => s + p.price, 0) / inPeriod.length;
  return inPeriod.reduce((s, p) => s + p.price * p.quantity, 0) / totalQty;
};

const computeTrend = (
  currentPrice: number,
  price30dAgo: number,
  price90dAgo: number,
  risingThreshold: number
): { changePct30d: number; changePct90d: number; direction: CostTrendDirection } => {
  const changePct30d = price30dAgo > 0 ? ((currentPrice - price30dAgo) / price30dAgo) * 100 : 0;
  const changePct90d = price90dAgo > 0 ? ((currentPrice - price90dAgo) / price90dAgo) * 100 : 0;

  let direction: CostTrendDirection = 'stable';
  if (changePct30d > risingThreshold) direction = 'rising';
  else if (changePct30d < -risingThreshold) direction = 'falling';

  return {
    changePct30d: Math.round(changePct30d * 10) / 10,
    changePct90d: Math.round(changePct90d * 10) / 10,
    direction,
  };
};

const computeSeverity = (changePct30d: number): CostSeverity => {
  const abs = Math.abs(changePct30d);
  if (abs > 30) return 'critical';
  if (abs > 15) return 'high';
  if (abs > 5) return 'medium';
  return 'low';
};

const determineRecommendation = (
  severity: CostSeverity,
  direction: CostTrendDirection,
  monthlyImpact: number,
  hasAffectedDishes: boolean
): CostRecommendation => {
  if (severity === 'low' || direction === 'stable') return 'monitor';
  if (direction === 'falling') return 'absorb'; // good news — price dropping
  // Rising costs:
  if (severity === 'critical' && monthlyImpact > 500) return 'reprice_menu';
  if (severity === 'critical') return 'renegotiate';
  if (severity === 'high' && hasAffectedDishes) return 'reprice_menu';
  if (severity === 'high') return 'renegotiate';
  if (severity === 'medium') return 'substitute';
  return 'monitor';
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export interface AnalyzeFoodCostResult {
  trends: FoodCostTrend[];
  totalAnnualImpact: number;
  risingCount: number;
  fallingCount: number;
  criticalCount: number;
}

export const analyzeFoodCostTrends = async (
  db: ReturnType<typeof useDB>,
  config: FoodCostConfig = DEFAULT_FOODCOST_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<AnalyzeFoodCostResult> => {
  if (onProgress) onProgress(0, 3);

  const priceHistory = await collectPriceHistory(db, config.lookbackDays);
  if (onProgress) onProgress(1, 3);

  const trends: FoodCostTrend[] = [];
  const items = Array.from(priceHistory.values()).filter(d => d.prices.length >= 2);

  for (const data of items) {
    const currentPrice = avgPriceInPeriod(data.prices, 7); // last week avg
    const previousPrice = avgPriceInPeriod(data.prices, 14); // 2 weeks ago
    const price30dAgo = avgPriceInPeriod(data.prices.filter(p => p.date < new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)), 10);
    const price90dAgo = avgPriceInPeriod(data.prices.filter(p => p.date < new Date(Date.now() - 80 * 24 * 60 * 60 * 1000)), 10);

    if (currentPrice <= 0) continue;

    const { changePct30d, changePct90d, direction } = computeTrend(currentPrice, price30dAgo, price90dAgo, config.risingThreshold);
    const severity = computeSeverity(changePct30d);

    // Monthly consumption (total quantity / months in lookback)
    const months = Math.max(1, config.lookbackDays / 30);
    const avgMonthlyConsumption = data.total_quantity / months;

    // Monthly cost impact = consumption × price change
    const monthlyImpact = avgMonthlyConsumption * (currentPrice - price30dAgo);
    const annualImpact = monthlyImpact * 12;

    // Affected dishes
    const affectedDishes = await fetchAffectedDishes(db, data.item_id);

    // Margin impact (rough: if ingredient is 10% of dish cost, 20% price rise = 2% margin impact)
    const marginImpact = affectedDishes.length > 0 ? changePct30d * 0.1 : 0;

    const recommendation = determineRecommendation(severity, direction, monthlyImpact, affectedDishes.length > 0);

    trends.push({
      item_id: data.item_id,
      item_name: data.item_name,
      uom: data.uom,
      current_price: Math.round(currentPrice * 100) / 100,
      previous_price: Math.round(previousPrice * 100) / 100,
      price_30d_ago: Math.round(price30dAgo * 100) / 100,
      price_90d_ago: Math.round(price90dAgo * 100) / 100,
      price_change_pct_30d: changePct30d,
      price_change_pct_90d: changePct90d,
      trend_direction: direction,
      avg_monthly_consumption: Math.round(avgMonthlyConsumption * 10) / 10,
      monthly_cost_impact: Math.round(monthlyImpact * 100) / 100,
      annual_cost_impact: Math.round(annualImpact * 100) / 100,
      affected_dishes: affectedDishes.length > 0 ? affectedDishes : undefined,
      margin_impact_pct: Math.round(marginImpact * 10) / 10,
      severity,
      ai_recommendation: recommendation,
      generated_at: new Date(),
    });
  }

  // Sort by annual impact (biggest cost impact first)
  trends.sort((a, b) => Math.abs(b.annual_cost_impact) - Math.abs(a.annual_cost_impact));
  if (onProgress) onProgress(2, 3);

  // AI enhancement
  if (config.aiEnabled && trends.length > 0) {
    await enhanceWithAI(trends);
  }
  if (onProgress) onProgress(3, 3);

  // Persist
  try {
    await db.query(`UPDATE food_cost_trend SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const trend of trends) {
      try {
        await db.query(`CREATE food_cost_trend CONTENT $data`, {
          data: {
            ...trend,
            generated_at: trend.generated_at.toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });
      } catch {
        // Non-fatal
      }
    }
  } catch (err) {
    console.warn('[food-cost] persist failed', err);
  }

  return {
    trends,
    totalAnnualImpact: Math.round(trends.reduce((s, t) => s + t.annual_cost_impact, 0) * 100) / 100,
    risingCount: trends.filter(t => t.trend_direction === 'rising').length,
    fallingCount: trends.filter(t => t.trend_direction === 'falling').length,
    criticalCount: trends.filter(t => t.severity === 'critical').length,
  };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (trends: FoodCostTrend[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) return;

  const top = trends.filter(t => t.severity !== 'low').slice(0, 20);
  if (top.length === 0) return;

  const prompt = `You are a restaurant food cost analyst.
Analyze these ingredient price trends and provide insights.

Top changing items (JSON):
${JSON.stringify(top.map(t => ({
  item: t.item_name,
  current: t.current_price,
  change_30d: t.price_change_pct_30d + '%',
  change_90d: t.price_change_pct_90d + '%',
  trend: t.trend_direction,
  severity: t.severity,
  monthly_impact: t.monthly_cost_impact,
  annual_impact: t.annual_cost_impact,
  affected_dishes: t.affected_dishes ?? [],
  current_rec: t.ai_recommendation,
})), null, 2)}

Respond with JSON array:
[{
  "item": "<match item name>",
  "insight": "<max 200 chars — what's happening + why it matters>",
  "action": "renegotiate" | "substitute" | "reprice_menu" | "absorb" | "monitor"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant food cost analyst AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      item: string;
      insight?: string;
      action?: CostRecommendation;
    }>;

    for (const item of parsed) {
      const trend = trends.find(t => t.item_name === item.item);
      if (!trend) continue;
      if (item.insight) trend.ai_insight = item.insight.slice(0, 200);
      if (item.action && ['renegotiate', 'substitute', 'reprice_menu', 'absorb', 'monitor'].includes(item.action)) {
        trend.ai_recommendation = item.action;
      }
    }
  } catch (err) {
    console.warn('[food-cost] AI enhancement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getFoodCostTrends = async (
  db: ReturnType<typeof useDB>
): Promise<FoodCostTrend[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM food_cost_trend
       WHERE expires_at > time::now()
       ORDER BY annual_cost_impact DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[food-cost] getFoodCostTrends failed', err);
    return [];
  }
};
