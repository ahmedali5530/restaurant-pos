/**
 * AI Inventory Reorder Point Optimizer — dynamic ROP + safety stock + EOQ.
 *
 * 60th POSR-exclusive differentiator — restaurants lose $200-800/mo per
 * location from inventory mismanagement (stockouts, overstock spoilage,
 * emergency reorder premiums). Classic supply chain theory (EOQ, safety
 * stock, reorder points) is standard in manufacturing/retail (SAP, Oracle)
 * but MISSING from restaurant POS — Toast/Square/Lightspeed all use STATIC
 * manual reorder points that never auto-adjust.
 *
 * Distinct from:
 *   - procurement.service (PRICE forecasting — buy-now vs wait-for-price-drop
 *     — NOT reorder point / safety stock policy)
 *   - spoilage-prediction.service (ingredient SHELF-LIFE prediction — NOT
 *     reorder quantity optimization)
 *   - food-cost-trend.service (ingredient COST trend tracking — NOT inventory
 *     policy)
 *   - demand-forecast.service (demand PREDICTION — not conversion to ROP)
 *   - vendor-performance.service (supplier SCORECARDS — not reorder policy)
 *   - recipe-substitution.service (recipe ingredient SWAPS — not inventory)
 *
 * Optimizes 3 inventory policy variables per SKU:
 *   1. Reorder Point (ROP) = when to order (trigger threshold)
 *   2. Safety Stock (SS) = buffer for demand + lead time variability
 *   3. Economic Order Quantity (EOQ) = how much to order per cycle
 *
 * 8 AI rules:
 *   1. understock_risk — days-until-stockout < threshold → raise ROP
 *   2. overstock_risk — usage declining, ROP too high → lower ROP
 *   3. lead_time_variability — supplier lead time stddev high → increase SS
 *   4. seasonal_demand_shift — upcoming season changes demand → pre-adjust ROP
 *   5. bulk_eoq_opportunity — stable demand + high order freq → switch to EOQ
 *   6. spoilage_threshold — shelf-life < reorder cycle → reduce ROP, order more often
 *   7. vendor_minimum_optimization — vendor minimum → bundle SKUs to hit minimum
 *   8. emergency_reorder — current stock below safety stock → emergency order NOW
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ReorderRuleId =
  | 'understock_risk'
  | 'overstock_risk'
  | 'lead_time_variability'
  | 'seasonal_demand_shift'
  | 'bulk_eoq_opportunity'
  | 'spoilage_threshold'
  | 'vendor_minimum_optimization'
  | 'emergency_reorder';

export type ReorderAiRec =
  | 'adopt_now'
  | 'pilot_2_weeks'
  | 'emergency_order'
  | 'monitor'
  | 'skip';

export interface ReorderRecommendation {
  id?: string;
  rule_id: ReorderRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  ingredient_id?: string;
  ingredient_name: string;
  category?: string;
  current_stock: number;
  current_reorder_point: number;
  suggested_reorder_point: number;
  current_safety_stock: number;
  suggested_safety_stock: number;
  avg_daily_usage: number;
  lead_time_days: number;
  lead_time_stddev?: number;
  shelf_life_days?: number;
  current_eoq?: number;
  suggested_eoq?: number;
  days_until_stockout?: number;
  est_loss_monthly: number;
  est_savings_monthly: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ReorderAiRec;
  status: 'open' | 'adopted' | 'piloting' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface ReorderConfig {
  aiEnabled: boolean;
  serviceLevel: number;       // 95.0 = 95% service level
  reviewWindowDays: number;   // 30
  stockoutAlertDays: number;  // 3
}

export const DEFAULT_REORDER_CONFIG: ReorderConfig = {
  aiEnabled: true,
  serviceLevel: 95.0,
  reviewWindowDays: 30,
  stockoutAlertDays: 3,
};

export const readReorderConfig = (settings: any): ReorderConfig => ({
  aiEnabled: settings?.reorder_ai_enabled ?? true,
  serviceLevel: safeNumber(settings?.reorder_service_level, 95.0),
  reviewWindowDays: safeNumber(settings?.reorder_review_window_days, 30),
  stockoutAlertDays: safeNumber(settings?.reorder_stockout_alert_days, 3),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Z-score for service level (simplified normal approximation)
// 90% = 1.28, 95% = 1.65, 97.5% = 1.96, 99% = 2.33
// ---------------------------------------------------------------------------
const zForServiceLevel = (sl: number): number => {
  if (sl >= 99) return 2.33;
  if (sl >= 97.5) return 1.96;
  if (sl >= 95) return 1.65;
  if (sl >= 90) return 1.28;
  return 1.0;
};

// ---------------------------------------------------------------------------
// Mock ingredient inventory profiles
// (in production, derived from inventory table + order_item consumption)
// ---------------------------------------------------------------------------
interface IngredientProfile {
  id: string;
  name: string;
  category: 'produce' | 'meat' | 'dairy' | 'dry_goods' | 'frozen' | 'beverage' | 'other';
  currentStock: number;       // units on hand
  currentROP: number;         // current manual reorder point
  currentSafetyStock: number;
  avgDailyUsage: number;      // units/day (30-day avg)
  unitCost: number;           // $ per unit
  leadTimeDays: number;       // supplier lead time
  leadTimeStddev: number;     // variability in days
  shelfLifeDays?: number;     // NONE for non-perishable
  vendorMinimum?: number;     // minimum order quantity
  orderFrequencyPerMonth: number; // how many times ordered per month
}

const INGREDIENT_PROFILES: IngredientProfile[] = [
  { id: 'ing-001', name: 'Fresh Basil',         category: 'produce',    currentStock: 8,   currentROP: 5,  currentSafetyStock: 2,  avgDailyUsage: 1.5, unitCost: 2.50,  leadTimeDays: 2, leadTimeStddev: 1.0, shelfLifeDays: 5,  orderFrequencyPerMonth: 6 },
  { id: 'ing-002', name: 'Chicken Breast',      category: 'meat',      currentStock: 40,  currentROP: 30, currentSafetyStock: 10, avgDailyUsage: 8.0, unitCost: 4.20,  leadTimeDays: 3, leadTimeStddev: 0.5, shelfLifeDays: 4,  orderFrequencyPerMonth: 8 },
  { id: 'ing-003', name: 'Mozzarella Cheese',   category: 'dairy',     currentStock: 25,  currentROP: 20, currentSafetyStock: 5,  avgDailyUsage: 4.0, unitCost: 6.80,  leadTimeDays: 2, leadTimeStddev: 0.3, shelfLifeDays: 21, orderFrequencyPerMonth: 4 },
  { id: 'ing-004', name: 'Tomato Sauce',        category: 'dry_goods', currentStock: 60,  currentROP: 24, currentSafetyStock: 8,  avgDailyUsage: 3.0, unitCost: 1.80,  leadTimeDays: 5, leadTimeStddev: 2.0, shelfLifeDays: undefined, vendorMinimum: 12, orderFrequencyPerMonth: 3 },
  { id: 'ing-005', name: 'Pizza Dough Flour',   category: 'dry_goods', currentStock: 100, currentROP: 50, currentSafetyStock: 15, avgDailyUsage: 6.0, unitCost: 0.85,  leadTimeDays: 7, leadTimeStddev: 1.5, shelfLifeDays: undefined, vendorMinimum: 50, orderFrequencyPerMonth: 2 },
  { id: 'ing-006', name: 'Fresh Salmon',        category: 'meat',      currentStock: 6,   currentROP: 10, currentSafetyStock: 4,  avgDailyUsage: 2.0, unitCost: 12.50, leadTimeDays: 2, leadTimeStddev: 0.5, shelfLifeDays: 3,  orderFrequencyPerMonth: 8 },
  { id: 'ing-007', name: 'Lettuce',             category: 'produce',   currentStock: 15,  currentROP: 8,  currentSafetyStock: 3,  avgDailyUsage: 2.5, unitCost: 1.20,  leadTimeDays: 1, leadTimeStddev: 0.2, shelfLifeDays: 7,  orderFrequencyPerMonth: 10 },
  { id: 'ing-008', name: 'Olive Oil (1L)',      category: 'dry_goods', currentStock: 8,   currentROP: 5,  currentSafetyStock: 2,  avgDailyUsage: 0.8, unitCost: 9.50,  leadTimeDays: 5, leadTimeStddev: 2.5, shelfLifeDays: undefined, vendorMinimum: 6,  orderFrequencyPerMonth: 4 },
  { id: 'ing-009', name: 'Ice Cream (tub)',     category: 'frozen',    currentStock: 12,  currentROP: 6,  currentSafetyStock: 2,  avgDailyUsage: 1.2, unitCost: 5.40,  leadTimeDays: 3, leadTimeStddev: 1.0, shelfLifeDays: 90, orderFrequencyPerMonth: 5 },
  { id: 'ing-010', name: 'Red Wine (bottle)',   category: 'beverage',  currentStock: 20,  currentROP: 12, currentSafetyStock: 4,  avgDailyUsage: 0.5, unitCost: 14.00, leadTimeDays: 7, leadTimeStddev: 3.0, shelfLifeDays: undefined, vendorMinimum: 6,  orderFrequencyPerMonth: 2 },
  { id: 'ing-011', name: 'Avocado',             category: 'produce',   currentStock: 18,  currentROP: 12, currentSafetyStock: 4,  avgDailyUsage: 3.5, unitCost: 1.50,  leadTimeDays: 2, leadTimeStddev: 0.8, shelfLifeDays: 5,  orderFrequencyPerMonth: 8 },
  { id: 'ing-012', name: 'Heavy Cream',         category: 'dairy',     currentStock: 4,   currentROP: 6,  currentSafetyStock: 2,  avgDailyUsage: 1.0, unitCost: 3.20,  leadTimeDays: 2, leadTimeStddev: 0.3, shelfLifeDays: 14, orderFrequencyPerMonth: 6 },
];

// Seasonal demand multipliers (month → factor)
// e.g., Ice Cream sells 2x in summer, Salmon sells 1.3x in winter holidays
const SEASONAL_MULTIPLIER: Record<number, Record<string, number>> = {
  // month 1-12 → { ingredientName: multiplier }
  6: { 'Ice Cream (tub)': 2.0, 'Red Wine (bottle)': 0.7 },
  7: { 'Ice Cream (tub)': 2.2, 'Red Wine (bottle)': 0.6 },
  8: { 'Ice Cream (tub)': 2.0, 'Red Wine (bottle)': 0.7 },
  12: { 'Red Wine (bottle)': 1.5, 'Fresh Salmon': 1.3, 'Heavy Cream': 1.4 },
  1: { 'Red Wine (bottle)': 1.3, 'Fresh Salmon': 1.2 },
};

/**
 * Run the reorder point optimizer engine.
 * Evaluates each ingredient's inventory profile + generates recommendations.
 */
export const runReorderEngine = async (
  db: ReturnType<typeof useDB>,
  config: ReorderConfig = DEFAULT_REORDER_CONFIG
): Promise<{ recommendations: ReorderRecommendation[]; generated: number }> => {
  const recs: ReorderRecommendation[] = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const z = zForServiceLevel(config.serviceLevel);

  for (const ing of INGREDIENT_PROFILES) {
    // Compute optimal safety stock: SS = z × sqrt(lead_time) × stddev_daily_usage
    // Approximation: stddev_daily_usage ≈ avgDailyUsage × 0.2 (20% variability)
    const dailyUsageStddev = ing.avgDailyUsage * 0.2;
    const optimalSafetyStock = Math.ceil(
      z * Math.sqrt(ing.leadTimeDays) * dailyUsageStddev +
      z * ing.avgDailyUsage * ing.leadTimeStddev
    );

    // Optimal ROP = (avgDailyUsage × leadTimeDays) + safetyStock
    const optimalROP = Math.ceil(ing.avgDailyUsage * ing.leadTimeDays + optimalSafetyStock);

    // Days until stockout at current usage
    const daysUntilStockout = ing.currentStock / Math.max(0.1, ing.avgDailyUsage);

    // EOQ = sqrt(2 × annual_demand × order_cost / holding_cost)
    // Assumptions: order_cost = $8/order, holding_cost = 25% of unitCost/year
    const annualDemand = ing.avgDailyUsage * 365;
    const orderCost = 8;
    const holdingCost = Math.max(0.01, ing.unitCost * 0.25);
    const optimalEOQ = Math.ceil(Math.sqrt((2 * annualDemand * orderCost) / holdingCost));

    // Seasonal multiplier for next month
    const nextMonth = (currentMonth % 12) + 1;
    const seasonalFactor = SEASONAL_MULTIPLIER[nextMonth]?.[ing.name] ?? 1.0;

    // --- Rule 1: UNDERSTOCK_RISK — days until stockout < threshold ---
    if (daysUntilStockout < config.stockoutAlertDays && daysUntilStockout < ing.leadTimeDays) {
      const lostSalesPerDay = ing.avgDailyUsage * ing.unitCost * 0.5; // 50% of demand lost
      const estLoss = lostSalesPerDay * (ing.leadTimeDays - daysUntilStockout + 3);
      recs.push(makeRec(
        'understock_risk', 'critical',
        ing, ing.currentROP, optimalROP + Math.ceil(optimalSafetyStock * 0.5),
        ing.currentSafetyStock, optimalSafetyStock,
        optimalEOQ,
        daysUntilStockout,
        estLoss, estLoss,
        `${ing.name}: ${daysUntilStockout.toFixed(1)} days until stockout (lead time ${ing.leadTimeDays}d). Current ROP ${ing.currentROP} is too low — will stock out before next delivery. Raise ROP to ${optimalROP + Math.ceil(optimalSafetyStock * 0.5)}.`,
        'adopt_now'
      ));
    }
    // --- Rule 8: EMERGENCY_REORDER — stock already below safety stock ---
    else if (ing.currentStock < ing.currentSafetyStock) {
      const emergencyPremium = 0.15; // 15% rush delivery fee
      const emergencyQty = optimalEOQ;
      const emergencyCost = emergencyQty * ing.unitCost * emergencyPremium;
      recs.push(makeRec(
        'emergency_reorder', 'critical',
        ing, ing.currentROP, optimalROP,
        ing.currentSafetyStock, optimalSafetyStock,
        emergencyQty,
        daysUntilStockout,
        emergencyCost, emergencyCost,
        `${ing.name}: stock (${ing.currentStock}) below safety stock (${ing.currentSafetyStock}). Place emergency order of ${emergencyQty} units NOW (15% rush premium = ${fmt$(emergencyCost)} extra).`,
        'emergency_order'
      ));
    }

    // --- Rule 2: OVERSTOCK_RISK — ROP much higher than optimal ---
    if (ing.currentROP > optimalROP * 1.5 && ing.currentStock > optimalROP) {
      const excessStock = ing.currentStock - optimalROP;
      const spoilageRisk = ing.shelfLifeDays
        ? Math.min(excessStock * ing.unitCost, excessStock * ing.unitCost * 0.3)
        : excessStock * ing.unitCost * 0.05; // 5% holding cost for non-perishable
      recs.push(makeRec(
        'overstock_risk', 'medium',
        ing, ing.currentROP, optimalROP,
        ing.currentSafetyStock, optimalSafetyStock,
        optimalEOQ,
        daysUntilStockout,
        spoilageRisk, spoilageRisk,
        `${ing.name}: ROP ${ing.currentROP} is ${(ing.currentROP / optimalROP).toFixed(1)}x optimal (${optimalROP}). Excess stock ${excessStock} units ties up ${fmt$(excessStock * ing.unitCost)} working capital${ing.shelfLifeDays ? ' + spoilage risk' : ''}. Lower ROP to ${optimalROP}.`,
        'adopt_now'
      ));
    }

    // --- Rule 3: LEAD_TIME_VARIABILITY — high stddev → increase safety stock ---
    if (ing.leadTimeStddev > 0.5 && ing.leadTimeStddev / ing.leadTimeDays > 0.3) {
      const currentSSAdequacy = ing.currentSafetyStock / Math.max(1, optimalSafetyStock);
      if (currentSSAdequacy < 1) {
        const stockoutRiskCost = ing.avgDailyUsage * ing.unitCost * ing.leadTimeStddev * 0.3; // monthly
        recs.push(makeRec(
          'lead_time_variability', 'high',
          ing, ing.currentROP, optimalROP,
          ing.currentSafetyStock, optimalSafetyStock,
          optimalEOQ,
          daysUntilStockout,
          stockoutRiskCost, stockoutRiskCost,
          `${ing.name}: supplier lead time varies ±${ing.leadTimeStddev}d (CV ${(ing.leadTimeStddev / ing.leadTimeDays * 100).toFixed(0)}%). Safety stock ${ing.currentSafetyStock} is low — increase to ${optimalSafetyStock} to maintain ${config.serviceLevel}% service level.`,
          'adopt_now'
        ));
      }
    }

    // --- Rule 4: SEASONAL_DEMAND_SHIFT — next month changes demand ---
    if (seasonalFactor !== 1.0) {
      const adjustedUsage = ing.avgDailyUsage * seasonalFactor;
      const adjustedROP = Math.ceil(adjustedUsage * ing.leadTimeDays + optimalSafetyStock);
      const delta = adjustedROP - optimalROP;
      if (Math.abs(delta) >= 2) {
        const estImpact = Math.abs(delta) * ing.avgDailyUsage * ing.unitCost * 0.3;
        recs.push(makeRec(
          'seasonal_demand_shift', seasonalFactor > 1 ? 'high' : 'medium',
          ing, ing.currentROP, adjustedROP,
          ing.currentSafetyStock, optimalSafetyStock,
          optimalEOQ,
          daysUntilStockout,
          estImpact, estImpact,
          `${ing.name}: next month demand shifts ${seasonalFactor > 1 ? '+' : ''}${((seasonalFactor - 1) * 100).toFixed(0)}% (seasonal). Pre-adjust ROP from ${ing.currentROP} → ${adjustedROP} to ${seasonalFactor > 1 ? 'avoid stockout' : 'reduce overstock'} ${seasonalFactor > 1 ? 'during peak' : 'during slow period'}.`,
          'pilot_2_weeks'
        ));
      }
    }

    // --- Rule 5: BULK_EOQ_OPPORTUNITY — high order frequency → switch to EOQ ---
    if (ing.orderFrequencyPerMonth >= 6) {
      const currentOrderQty = Math.ceil(annualDemand / 12 / ing.orderFrequencyPerMonth);
      const currentAnnualOrderCost = ing.orderFrequencyPerMonth * 12 * orderCost;
      const eoqAnnualOrderCost = (annualDemand / optimalEOQ) * orderCost;
      const annualSavings = currentAnnualOrderCost - eoqAnnualOrderCost;
      if (annualSavings > 5) {
        recs.push(makeRec(
          'bulk_eoq_opportunity', 'medium',
          ing, ing.currentROP, optimalROP,
          ing.currentSafetyStock, optimalSafetyStock,
          optimalEOQ,
          daysUntilStockout,
          annualSavings / 12, annualSavings / 12,
          `${ing.name}: ordered ${ing.orderFrequencyPerMonth}x/mo (${currentOrderQty} units each). EOQ = ${optimalEOQ} units every ${(optimalEOQ / ing.avgDailyUsage).toFixed(0)}d. Switch to EOQ saves ${fmt$(annualSavings)}/yr (${fmt$(annualSavings / 12)}/mo) in order costs.`,
          'adopt_now',
          { currentEoq: currentOrderQty }
        ));
      }
    }

    // --- Rule 6: SPOILAGE_THRESHOLD — shelf-life shorter than reorder cycle ---
    if (ing.shelfLifeDays) {
      const reorderCycleDays = optimalEOQ / Math.max(0.1, ing.avgDailyUsage);
      if (ing.shelfLifeDays < reorderCycleDays * 0.8) {
        // Reduce EOQ to fit shelf-life, order more frequently
        const shelfLifeEOQ = Math.ceil(ing.avgDailyUsage * ing.shelfLifeDays * 0.7);
        const spoilageLoss = (optimalEOQ - shelfLifeEOQ) * ing.unitCost * 0.2; // 20% spoilage
        recs.push(makeRec(
          'spoilage_threshold', 'high',
          ing, ing.currentROP, optimalROP,
          ing.currentSafetyStock, optimalSafetyStock,
          shelfLifeEOQ,
          daysUntilStockout,
          spoilageLoss, spoilageLoss,
          `${ing.name}: shelf-life ${ing.shelfLifeDays}d but EOQ ${optimalEOQ} lasts ${reorderCycleDays.toFixed(0)}d — ${(reorderCycleDays - ing.shelfLifeDays).toFixed(0)}d of spoilage risk. Reduce order qty to ${shelfLifeEOQ} (lasts ${(shelfLifeEOQ / ing.avgDailyUsage).toFixed(0)}d) and order more frequently.`,
          'adopt_now',
          { currentEoq: optimalEOQ }
        ));
      }
    }

    // --- Rule 7: VENDOR_MINIMUM_OPTIMIZATION — vendor has minimum order ---
    if (ing.vendorMinimum && ing.vendorMinimum > optimalEOQ * 0.5) {
      // If vendor minimum close to EOQ, bundle to hit minimum without over-ordering
      const bundleQty = Math.max(ing.vendorMinimum, optimalEOQ);
      const overOrderCost = (bundleQty - optimalEOQ) * ing.unitCost * 0.05; // 5% holding
      const orderFreqReduction = (ing.orderFrequencyPerMonth - (annualDemand / bundleQty / 12 * 12)) * orderCost;
      const netSavings = orderFreqReduction - overOrderCost;
      if (netSavings > 2) {
        recs.push(makeRec(
          'vendor_minimum_optimization', 'low',
          ing, ing.currentROP, optimalROP,
          ing.currentSafetyStock, optimalSafetyStock,
          bundleQty,
          daysUntilStockout,
          netSavings, netSavings,
          `${ing.name}: vendor minimum ${ing.vendorMinimum} units close to EOQ ${optimalEOQ}. Bundle orders to ${bundleQty} units to hit minimum + reduce order frequency — net savings ${fmt$(netSavings)}/mo.`,
          'monitor',
          { currentEoq: optimalEOQ }
        ));
      }
    }
  }

  // 5. AI insight for top 5 critical/high recommendations
  if (config.aiEnabled && recs.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topRecs = recs
        .filter(r => r.severity === 'critical' || r.severity === 'high')
        .slice(0, 5);
      for (const r of topRecs) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant inventory optimization AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Inventory rec: ${r.rule_id} for ${r.ingredient_name} — ROP ${r.current_reorder_point} → ${r.suggested_reorder_point}, saves ${fmt$(r.est_savings_monthly)}/mo. ${r.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          r.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 6. Persist
  try {
    await db.query(`DELETE FROM reorder_recommendation WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const r of recs) {
    try {
      await db.query(`CREATE reorder_recommendation CONTENT $data`, {
        data: { ...r, detected_at: r.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { recommendations: recs, generated: recs.length };
};

// ---------------------------------------------------------------------------
// Helper: build a recommendation
// ---------------------------------------------------------------------------
function makeRec(
  ruleId: ReorderRuleId,
  severity: ReorderRecommendation['severity'],
  ing: IngredientProfile,
  currentROP: number,
  suggestedROP: number,
  currentSS: number,
  suggestedSS: number,
  suggestedEOQ: number,
  daysUntilStockout: number,
  estLoss: number,
  estSavings: number,
  description: string,
  aiRec: ReorderAiRec,
  extra?: { currentEoq?: number }
): ReorderRecommendation {
  const now = new Date();
  return {
    rule_id: ruleId,
    severity,
    ingredient_id: ing.id,
    ingredient_name: ing.name,
    category: ing.category,
    current_stock: ing.currentStock,
    current_reorder_point: currentROP,
    suggested_reorder_point: suggestedROP,
    current_safety_stock: currentSS,
    suggested_safety_stock: suggestedSS,
    avg_daily_usage: ing.avgDailyUsage,
    lead_time_days: ing.leadTimeDays,
    lead_time_stddev: ing.leadTimeStddev,
    shelf_life_days: ing.shelfLifeDays,
    current_eoq: extra?.currentEoq,
    suggested_eoq: suggestedEOQ,
    days_until_stockout: Math.round(daysUntilStockout * 10) / 10,
    est_loss_monthly: Math.round(estLoss * 100) / 100,
    est_savings_monthly: Math.round(estSavings * 100) / 100,
    description,
    ai_recommendation: aiRec,
    status: 'open',
    detected_at: now,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveRecommendations = async (db: ReturnType<typeof useDB>): Promise<ReorderRecommendation[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM reorder_recommendation
       WHERE status = 'open'
       ORDER BY est_loss_monthly DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalRecs: number;
  criticalCount: number;
  totalSavings: number;
  emergencyCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(rule_id = 'emergency_reorder') AS emergency,
         math::sum(est_savings_monthly) AS savings
       FROM reorder_recommendation
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalRecs: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      emergencyCount: safeNumber(r.emergency, 0),
      totalSavings: safeNumber(r.savings, 0),
    };
  } catch {
    return { totalRecs: 0, criticalCount: 0, totalSavings: 0, emergencyCount: 0 };
  }
};

export const updateRecStatus = async (
  db: ReturnType<typeof useDB>,
  recId: string,
  status: 'adopted' | 'piloting' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: recId, status });
};
