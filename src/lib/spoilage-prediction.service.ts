/**
 * AI Inventory Spoilage Prediction service — predict waste BEFORE it happens.
 *
 * 20th POSR-exclusive differentiator — restaurants waste 4-10% of food
 * inventory to spoilage (NRRA). Existing services detect waste AFTER it
 * happens (waste-tracking) or find items ALREADY expired (food-safety
 * expired_stock rule). NO service PREDICTS which items will spoil BEFORE it
 * happens. POSR predicts spoilage based on consumption rate × expiry date ×
 * current stock, then recommends preventive actions.
 *
 * Distinct from:
 *   - food-safety.service (temperature monitoring + HACCP, has expired_stock
 *     check but only finds items ALREADY expired — reactive)
 *   - shrinkage-detection (detects theft/loss patterns)
 *   - waste-tracking (analyzes waste AFTER it happens)
 *   - reorder.service (suggests when to reorder, doesn't predict spoilage)
 * This service PREDICTS waste BEFORE it happens — preventive, not reactive.
 *
 * Algorithm:
 *   1. For each inventory_item with expiry_date (from inventory_purchase_item):
 *      - current_stock (from inventory_ledger sum of quantity_change)
 *      - avg_daily_consumption (from order_item sales × recipe quantities)
 *      - days_until_expiry = (expiry_date - today) / 1d
 *      - days_of_stock = current_stock / avg_daily_consumption
 *   2. Spoilage risk: if days_until_expiry < days_of_stock → will spoil
 *      - risk_score = max(0, 1 - (days_until_expiry / days_of_stock)) × 100
 *   3. Classification: critical / high / medium / low
 *   4. est_spoilage_cost = (stock_at_expiry × unit_cost)
 *   5. AI recommendation: use_in_special | mark_down | redistribute |
 *      reduce_reorder | donate | discard_now | monitor
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpoilageRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type SpoilageRecommendation =
  | 'use_in_special' | 'mark_down' | 'redistribute' | 'reduce_reorder'
  | 'donate' | 'discard_now' | 'monitor';

export interface SpoilagePrediction {
  id?: string;
  inventory_item?: string;
  item_name: string;
  category?: string;
  current_stock: number;
  unit_cost: number;
  avg_daily_consumption: number;
  days_of_stock: number;
  expiry_date?: Date;
  days_until_expiry: number;
  will_spoil: boolean;
  risk_score: number;          // 0-100
  risk_level: SpoilageRiskLevel;
  est_spoilage_cost: number;
  est_spoilage_qty: number;
  ai_insight?: string;
  ai_recommendation?: SpoilageRecommendation;
  action_taken: string;
  predicted_at: Date;
  branch_id?: string;
}

export interface SpoilageConfig {
  aiEnabled: boolean;
  consumptionLookbackDays: number;
  criticalDays: number;
  highDays: number;
  mediumDays: number;
  minStockValue: number;
}

export const DEFAULT_SPOILAGE_CONFIG: SpoilageConfig = {
  aiEnabled: true,
  consumptionLookbackDays: 30,
  criticalDays: 3,
  highDays: 7,
  mediumDays: 14,
  minStockValue: 5,
};

export const readSpoilageConfig = (settings: any): SpoilageConfig => ({
  aiEnabled: settings?.spoilage_ai_enabled ?? true,
  consumptionLookbackDays: safeNumber(settings?.spoilage_consumption_lookback_days, 30),
  criticalDays: safeNumber(settings?.spoilage_critical_days, 3),
  highDays: safeNumber(settings?.spoilage_high_days, 7),
  mediumDays: safeNumber(settings?.spoilage_medium_days, 14),
  minStockValue: safeNumber(settings?.spoilage_min_stock_value, 5),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const classifyRisk = (
  willSpoil: boolean,
  daysUntilExpiry: number,
  cfg: SpoilageConfig
): SpoilageRiskLevel => {
  if (!willSpoil) return 'low';
  if (daysUntilExpiry < cfg.criticalDays) return 'critical';
  if (daysUntilExpiry < cfg.highDays) return 'high';
  if (daysUntilExpiry < cfg.mediumDays) return 'medium';
  return 'low';
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface ItemStockData {
  itemId: string;
  itemName: string;
  category?: string;
  currentStock: number;
  unitCost: number;
  expiryDate?: Date;
  avgDailyConsumption: number;
}

const fetchItemsWithExpiry = async (db: any, cfg: SpoilageConfig): Promise<ItemStockData[]> => {
  try {
    // Get inventory_purchase_items with expiry_date that haven't expired yet
    const purchaseResult = await db.query(
      `SELECT
         item.id AS item_id,
         item.name AS item_name,
         item.category AS category,
         item.price AS unit_cost,
         expiry_date,
         batch_number
       FROM inventory_purchase_item
       WHERE expiry_date IS NOT NONE
         AND expiry_date > time::now()
       FETCH item`
    );
    const purchaseRows = Array.isArray(purchaseResult) ? purchaseResult.flat() : [];
    if (purchaseRows.length === 0) return [];

    // Group by inventory_item to get latest expiry per item
    const itemMap = new Map<string, ItemStockData>();
    for (const r of purchaseRows) {
      const itemId = r.item_id?.toString?.() ?? '';
      if (!itemId) continue;
      const expiry = r.expiry_date ? new Date(r.expiry_date) : null;
      // Keep the soonest expiry date per item
      if (!itemMap.has(itemId) || (expiry && (!itemMap.get(itemId)!.expiryDate || expiry < itemMap.get(itemId)!.expiryDate!))) {
        itemMap.set(itemId, {
          itemId,
          itemName: r.item_name ?? 'Unknown',
          category: r.category,
          currentStock: 0, // will be filled from ledger
          unitCost: safeNumber(r.unit_cost, 0),
          expiryDate: expiry ?? undefined,
          avgDailyConsumption: 0, // will be filled from consumption
        });
      }
    }

    // Get current stock from inventory_ledger
    const stockResult = await db.query(
      `SELECT
         inventory_item.id AS item_id,
         math::sum(quantity_change) AS current_stock
       FROM inventory_ledger
       WHERE created_at > time::now() - 90d
       GROUP BY inventory_item
       FETCH inventory_item`
    );
    const stockRows = Array.isArray(stockResult) ? stockResult.flat() : [];
    for (const sr of stockRows) {
      const itemId = sr.item_id?.toString?.() ?? '';
      const item = itemMap.get(itemId);
      if (item) {
        item.currentStock = safeNumber(sr.current_stock, 0);
      }
    }

    // Get avg daily consumption from order_item (how many units sold per day)
    const consumptionResult = await db.query(
      `SELECT
         item.id AS item_id,
         math::sum(quantity) AS total_qty
       FROM order_item
       WHERE created_at > time::now() - ${cfg.consumptionLookbackDays}d
         AND item IS NOT NONE
       GROUP BY item
       FETCH item`
    );
    const consumptionRows = Array.isArray(consumptionResult) ? consumptionResult.flat() : [];
    for (const cr of consumptionRows) {
      const itemId = cr.item_id?.toString?.() ?? '';
      const item = itemMap.get(itemId);
      if (item) {
        const totalQty = safeNumber(cr.total_qty, 0);
        item.avgDailyConsumption = totalQty / cfg.consumptionLookbackDays;
      }
    }

    // Filter: only items with stock > 0 and stock value > min threshold
    const result: ItemStockData[] = [];
    for (const item of itemMap.values()) {
      if (item.currentStock <= 0) continue;
      const stockValue = item.currentStock * item.unitCost;
      if (stockValue < cfg.minStockValue) continue;
      result.push(item);
    }
    return result;
  } catch (err) {
    console.warn('[spoilage] fetchItemsWithExpiry failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  predictions: SpoilagePrediction[],
  _cfg: SpoilageConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || predictions.length === 0) return;

  // Only enhance at-risk items
  const atRisk = predictions.filter(p => p.will_spoil && p.risk_level !== 'low').slice(0, 15);
  if (atRisk.length === 0) return;

  const prompt = `You are a restaurant inventory waste prevention expert.
For each item below that will spoil before being consumed, provide:
  - insight: max 200 chars — what's happening + why
  - recommendation: one of use_in_special | mark_down | redistribute | reduce_reorder | donate | discard_now | monitor

Recommendation guidance:
  - use_in_special: critical/high risk, versatile ingredient → feature in today's special
  - mark_down: high risk, perishable → discount to sell before expiry
  - redistribute: medium risk, multi-location → transfer to busier location
  - reduce_reorder: systemic over-ordering → reduce future purchase quantity
  - donate: still safe but can't sell in time → donate to food bank
  - discard_now: already unsafe or near-expiry with no use → discard
  - monitor: low risk, just keep watching

Items (JSON):
${JSON.stringify(atRisk.map(p => ({
  name: p.item_name,
  category: p.category,
  current_stock: p.current_stock,
  unit_cost: p.unit_cost,
  avg_daily_consumption: p.avg_daily_consumption.toFixed(2),
  days_of_stock: p.days_of_stock.toFixed(1),
  days_until_expiry: p.days_until_expiry.toFixed(1),
  est_spoilage_cost: p.est_spoilage_cost,
  risk_level: p.risk_level,
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match item_name>",
  "insight": "<max 200 chars>",
  "recommendation": "use_in_special" | "mark_down" | "redistribute" | "reduce_reorder" | "donate" | "discard_now" | "monitor"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are an inventory spoilage prevention AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string; insight?: string; recommendation?: SpoilageRecommendation;
    }>;
    for (const item of parsed) {
      const pred = predictions.find(p => p.item_name === item.name);
      if (pred) {
        if (item.insight) pred.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) pred.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[spoilage] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runSpoilagePrediction = async (
  db: ReturnType<typeof useDB>,
  config: SpoilageConfig = DEFAULT_SPOILAGE_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ predictions: SpoilagePrediction[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch items with expiry dates
  const items = await fetchItemsWithExpiry(db, config);
  if (onProgress) onProgress(1, 2);

  if (items.length === 0) {
    if (onProgress) onProgress(2, 2);
    return { predictions: [], scanned: 0 };
  }

  // 2. Compute spoilage risk for each item
  const predictions: SpoilagePrediction[] = [];
  const now = Date.now();

  for (const item of items) {
    const daysUntilExpiry = item.expiryDate
      ? (item.expiryDate.getTime() - now) / (1000 * 60 * 60 * 24)
      : 999;

    // days_of_stock = how many days current stock will last at current consumption
    const daysOfStock = item.avgDailyConsumption > 0
      ? item.currentStock / item.avgDailyConsumption
      : 999; // no consumption = infinite stock days (won't deplete)

    // Will spoil if expiry comes before stock runs out
    const willSpoil = daysUntilExpiry < daysOfStock && daysUntilExpiry < 999;

    // Risk score: how much of stock will be left when item expires
    // stock_at_expiry = current_stock - (avg_daily_consumption × days_until_expiry)
    const stockAtExpiry = Math.max(0, item.currentStock - (item.avgDailyConsumption * daysUntilExpiry));
    const spoilageQty = willSpoil ? stockAtExpiry : 0;
    const spoilageCost = spoilageQty * item.unitCost;
    const riskScore = willSpoil
      ? Math.min(100, (spoilageQty / Math.max(1, item.currentStock)) * 100)
      : 0;

    const riskLevel = classifyRisk(willSpoil, daysUntilExpiry, config);

    predictions.push({
      inventory_item: item.itemId,
      item_name: item.itemName,
      category: item.category,
      current_stock: Math.round(item.currentStock * 100) / 100,
      unit_cost: Math.round(item.unitCost * 100) / 100,
      avg_daily_consumption: Math.round(item.avgDailyConsumption * 100) / 100,
      days_of_stock: Math.round(daysOfStock * 10) / 10,
      expiry_date: item.expiryDate,
      days_until_expiry: Math.round(daysUntilExpiry * 10) / 10,
      will_spoil: willSpoil,
      risk_score: Math.round(riskScore),
      risk_level: riskLevel,
      est_spoilage_cost: Math.round(spoilageCost * 100) / 100,
      est_spoilage_qty: Math.round(spoilageQty * 100) / 100,
      action_taken: 'none',
      predicted_at: new Date(),
    });
  }

  // Sort: will_spoil first, then by spoilage cost descending
  predictions.sort((a, b) => {
    if (a.will_spoil !== b.will_spoil) return a.will_spoil ? -1 : 1;
    return b.est_spoilage_cost - a.est_spoilage_cost;
  });

  // 3. AI enhancement
  if (config.aiEnabled && predictions.length > 0) {
    await enhanceWithAI(predictions, config);
  }

  // 4. Persist (refresh — delete old predictions > 1h, create new)
  try {
    await db.query(`DELETE FROM spoilage_prediction WHERE predicted_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const pred of predictions) {
    try {
      await db.query(`CREATE spoilage_prediction CONTENT $data`, {
        data: {
          ...pred,
          expiry_date: pred.expiry_date?.toISOString(),
          predicted_at: pred.predicted_at.toISOString(),
        },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { predictions, scanned: items.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getAtRiskItems = async (
  db: ReturnType<typeof useDB>
): Promise<SpoilagePrediction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM spoilage_prediction
       WHERE will_spoil = true
         AND action_taken = 'none'
         AND predicted_at > time::now() - 24h
       ORDER BY
         CASE risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         est_spoilage_cost DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface SpoilageSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  totalSpoilageCost: number;
  totalItemsScanned: number;
}

export const getSpoilageSummary = async (
  db: ReturnType<typeof useDB>
): Promise<SpoilageSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level = 'critical') AS critical,
         math::count(risk_level = 'high') AS high,
         math::count(risk_level = 'medium') AS medium,
         math::sum(est_spoilage_cost) AS total_cost
       FROM spoilage_prediction
       WHERE will_spoil = true
         AND action_taken = 'none'
         AND predicted_at > time::now() - 24h
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      high: safeNumber(row.high, 0),
      medium: safeNumber(row.medium, 0),
      totalSpoilageCost: safeNumber(row.total_cost, 0),
      totalItemsScanned: 0,
    };
  } catch {
    return { total: 0, critical: 0, high: 0, medium: 0, totalSpoilageCost: 0, totalItemsScanned: 0 };
  }
};

export const updateSpoilageAction = async (
  db: ReturnType<typeof useDB>, predictionId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: predictionId, action });
};
