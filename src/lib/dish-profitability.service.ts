/**
 * AI Dish Profitability Analysis service — true profitability (food + labor + overhead).
 *
 * 34th POSR-exclusive differentiator — restaurants only track food cost
 * margin, missing labor cost (30-40% of true cost). POSR computes total
 * profitability per dish by combining kitchen prep time × hourly rate +
 * food cost + overhead allocation.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ProfitabilityGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ProfitRecommendation = 'increase_price' | 'reduce_labor' | 'simplify_recipe' | 'remove' | 'promote' | 'keep';

export interface DishProfitability {
  id?: string;
  menu_item?: string;
  menu_item_name: string;
  category?: string;
  selling_price: number;
  food_cost: number;
  labor_cost: number;
  overhead_cost: number;
  total_cost: number;
  gross_profit: number;
  gross_margin_pct: number;
  net_profit: number;
  net_margin_pct: number;
  avg_prep_minutes: number;
  order_count: number;
  total_revenue: number;
  total_net_profit: number;
  profitability_grade: ProfitabilityGrade;
  hidden_loss: number;
  ai_insight?: string;
  ai_recommendation?: ProfitRecommendation;
  analyzed_at: Date;
}

export interface DishProfitConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  avgLaborRate: number;
  overheadPct: number;
  minOrders: number;
}

export const DEFAULT_DISH_PROFIT_CONFIG: DishProfitConfig = {
  aiEnabled: true, lookbackDays: 30, avgLaborRate: 18, overheadPct: 0.10, minOrders: 5,
};

export const readDishProfitConfig = (settings: any): DishProfitConfig => ({
  aiEnabled: settings?.dish_profit_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.dish_profit_lookback_days, 30),
  avgLaborRate: safeNumber(settings?.dish_profit_avg_labor_rate, 18),
  overheadPct: safeNumber(settings?.dish_profit_overhead_pct, 0.10),
  minOrders: safeNumber(settings?.dish_profit_min_orders, 5),
});

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const toGrade = (netMarginPct: number): ProfitabilityGrade => {
  if (netMarginPct >= 60) return 'A';
  if (netMarginPct >= 40) return 'B';
  if (netMarginPct >= 25) return 'C';
  if (netMarginPct >= 10) return 'D';
  return 'F';
};

interface DishData {
  itemId: string; name: string; category?: string;
  price: number; cost: number;
  avgPrepMin: number; orderCount: number; totalRevenue: number;
}

const fetchDishData = async (db: any, cfg: DishProfitConfig): Promise<DishData[]> => {
  try {
    // Get menu items with sales + kitchen prep time
    const result = await db.query(
      `SELECT
         menu_item.id AS item_id,
         menu_item.name AS name,
         menu_item.categories AS categories,
         menu_item.price AS price,
         menu_item.cost AS cost,
         math::mean(time::minute(oik.completed_at - oik.activated_at)) AS avg_prep,
         count() AS order_count,
         math::sum(menu_item.price) AS total_rev
       FROM order_item
       WHERE item IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY item
       FETCH item`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows
      .map((r: any) => ({
        itemId: r.item_id?.toString?.() ?? '',
        name: r.name ?? 'Unknown',
        category: Array.isArray(r.categories) ? r.categories[0] : r.categories,
        price: safeNumber(r.price, 0),
        cost: safeNumber(r.cost, 0),
        avgPrepMin: safeNumber(r.avg_prep, 10),
        orderCount: safeNumber(r.order_count, 0),
        totalRevenue: safeNumber(r.total_rev, 0),
      }))
      .filter((d: DishData) => d.orderCount >= cfg.minOrders);
  } catch (err) { console.warn('[dish-profit] fetchDishData failed', err); return []; }
};

const enhanceWithAI = async (dishes: DishProfitability[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || dishes.length === 0) return;
  const actionable = dishes.filter(d => d.profitability_grade === 'D' || d.profitability_grade === 'F' || d.hidden_loss > 100).slice(0, 12);
  if (actionable.length === 0) return;

  const prompt = `You are a restaurant menu profitability expert. For each dish below, provide insight + recommendation.

Dishes (JSON):
${JSON.stringify(actionable.map(d => ({
  name: d.menu_item_name, price: d.selling_price, food: d.food_cost, labor: d.labor_cost,
  overhead: d.overhead_cost, total: d.total_cost, net_profit: d.net_profit,
  net_margin: d.net_margin_pct, grade: d.profitability_grade, prep_min: d.avg_prep_minutes,
  orders: d.order_count, hidden_loss: d.hidden_loss,
})), null, 2)}

Respond with JSON array:
[{"name":"<match>","insight":"<max 200 chars>","recommendation":"increase_price"|"reduce_labor"|"simplify_recipe"|"remove"|"promote"|"keep"}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a dish profitability AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1000 });
    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ name: string; insight?: string; recommendation?: ProfitRecommendation }>;
    for (const item of parsed) {
      const dish = dishes.find(d => d.menu_item_name === item.name);
      if (dish) {
        if (item.insight) dish.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) dish.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[dish-profit] AI failed', err); }
};

export const runDishProfitAnalysis = async (
  db: ReturnType<typeof useDB>,
  config: DishProfitConfig = DEFAULT_DISH_PROFIT_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ dishes: DishProfitability[]; analyzed: number }> => {
  if (onProgress) onProgress(0, 2);

  const dishData = await fetchDishData(db, config);
  if (onProgress) onProgress(1, 2);

  if (dishData.length === 0) { if (onProgress) onProgress(2, 2); return { dishes: [], analyzed: 0 }; }

  const dishes: DishProfitability[] = dishData.map(d => {
    const foodCost = d.cost;
    const laborCost = (d.avgPrepMin / 60) * config.avgLaborRate;
    const overheadCost = d.price * config.overheadPct;
    const totalCost = foodCost + laborCost + overheadCost;
    const grossProfit = d.price - foodCost;
    const grossMarginPct = d.price > 0 ? (grossProfit / d.price) * 100 : 0;
    const netProfit = d.price - totalCost;
    const netMarginPct = d.price > 0 ? (netProfit / d.price) * 100 : 0;
    const grade = toGrade(netMarginPct);
    const hiddenLoss = Math.max(0, (grossProfit - netProfit)) * d.orderCount;

    return {
      menu_item: d.itemId,
      menu_item_name: d.name,
      category: d.category,
      selling_price: Math.round(d.price * 100) / 100,
      food_cost: Math.round(foodCost * 100) / 100,
      labor_cost: Math.round(laborCost * 100) / 100,
      overhead_cost: Math.round(overheadCost * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
      gross_profit: Math.round(grossProfit * 100) / 100,
      gross_margin_pct: Math.round(grossMarginPct * 10) / 10,
      net_profit: Math.round(netProfit * 100) / 100,
      net_margin_pct: Math.round(netMarginPct * 10) / 10,
      avg_prep_minutes: Math.round(d.avgPrepMin * 10) / 10,
      order_count: d.orderCount,
      total_revenue: Math.round(d.totalRevenue * 100) / 100,
      total_net_profit: Math.round(netProfit * d.orderCount * 100) / 100,
      profitability_grade: grade,
      hidden_loss: Math.round(hiddenLoss * 100) / 100,
      analyzed_at: new Date(),
    };
  });

  // Sort: worst profitability first (F grade, then D, etc.)
  const gradeOrder = { F: 0, D: 1, C: 2, B: 3, A: 4 };
  dishes.sort((a, b) => (gradeOrder[a.profitability_grade] ?? 5) - (gradeOrder[b.profitability_grade] ?? 5));

  if (config.aiEnabled && dishes.length > 0) await enhanceWithAI(dishes);

  // Persist
  try { await db.query(`DELETE FROM dish_profitability WHERE analyzed_at < time::now() - 1h`); } catch { }
  for (const d of dishes) {
    try { await db.query(`CREATE dish_profitability CONTENT $data`, { data: { ...d, analyzed_at: d.analyzed_at.toISOString() } }); } catch { }
  }

  if (onProgress) onProgress(2, 2);
  return { dishes, analyzed: dishData.length };
};

export const getDishes = async (db: ReturnType<typeof useDB>): Promise<DishProfitability[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM dish_profitability WHERE analyzed_at > time::now() - 24h
       ORDER BY CASE profitability_grade WHEN 'F' THEN 0 WHEN 'D' THEN 1 WHEN 'C' THEN 2 WHEN 'B' THEN 3 ELSE 4 END, net_margin_pct ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalDishes: number; gradeF: number; gradeD: number; totalHiddenLoss: number; avgNetMargin: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(profitability_grade = 'F') AS f,
         math::count(profitability_grade = 'D') AS d, math::sum(hidden_loss) AS hidden,
         math::mean(net_margin_pct) AS avg_margin
       FROM dish_profitability WHERE analyzed_at > time::now() - 24h GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      totalDishes: safeNumber(row.total, 0), gradeF: safeNumber(row.f, 0),
      gradeD: safeNumber(row.d, 0), totalHiddenLoss: safeNumber(row.hidden, 0),
      avgNetMargin: safeNumber(row.avg_margin, 0),
    };
  } catch { return { totalDishes: 0, gradeF: 0, gradeD: 0, totalHiddenLoss: 0, avgNetMargin: 0 }; }
};
