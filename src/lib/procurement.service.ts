/**
 * AI Procurement Optimization Engine — predict ingredient price movements.
 *
 * 43rd POSR-exclusive differentiator — restaurants lose 8-12% of food cost to
 * poor procurement timing (NRA supply research). Toast/Square/Lightspeed track
 * stock levels but DON'T predict price movements or recommend WHEN to buy.
 * MarketMan ($99/mo) tracks vendor prices but doesn't forecast.
 *
 * Distinct from:
 *   - vendor-performance.service (vendor quality/delivery, NOT price prediction)
 *   - reorder.service (min/max thresholds, NOT predictive timing)
 *   - food-cost-trend.service (PAST trends, doesn't predict future)
 *   - yield-variance.service (production yield, NOT procurement timing)
 *   - recipe-optimization.service (recipe ingredients, NOT when to buy)
 *
 * This service forecasts ingredient PRICE MOVEMENTS and recommends WHEN to
 * buy, SWITCH vendors, or take BULK discounts — pre-emptive procurement.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ProcurementRuleId =
  | 'buy_now'
  | 'wait_for_drop'
  | 'switch_vendor'
  | 'bulk_discount'
  | 'normal';

export type ProcurementRecommendation =
  | 'place_order'
  | 'wait_7d'
  | 'wait_14d'
  | 'renegotiate'
  | 'monitor'
  | 'switch_now';

export interface ProcurementRecommendationRow {
  id?: string;
  rule_id: ProcurementRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  item_id?: string;
  item_name?: string;
  current_vendor?: string;
  current_price: number;
  avg_price_30d: number;
  predicted_price_14d: number;
  price_trend_pct: number;       // +rising, -falling
  confidence_score: number;       // 0-100
  alt_vendor?: string;
  alt_vendor_price?: number;
  suggested_qty?: number;
  est_savings: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ProcurementRecommendation;
  status: 'open' | 'ordered' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface ProcurementConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  risingThreshold: number;
  fallingThreshold: number;
  vendorSwitchThreshold: number;
}

export const DEFAULT_PROCUREMENT_CONFIG: ProcurementConfig = {
  aiEnabled: true,
  lookbackDays: 90,
  risingThreshold: 0.05,
  fallingThreshold: -0.05,
  vendorSwitchThreshold: 0.10,
};

export const readProcurementConfig = (settings: any): ProcurementConfig => ({
  aiEnabled: settings?.procurement_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.procurement_lookback_days, 90),
  risingThreshold: safeNumber(settings?.procurement_rising_threshold, 0.05),
  fallingThreshold: safeNumber(settings?.procurement_falling_threshold, -0.05),
  vendorSwitchThreshold: safeNumber(settings?.procurement_vendor_switch_threshold, 0.10),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface PricePoint {
  date: string;
  price: number;
  quantity: number;
  supplier: string;
  item_id: string;
  item_name: string;
}

interface ItemTrend {
  item_id: string;
  item_name: string;
  prices: PricePoint[];
  current_price: number;
  current_vendor: string;
  avg_30d: number;
  recent_slope: number;     // per-day slope
  vendors: Map<string, { price: number; last_date: string }>;
  total_quantity: number;
  avg_qty_per_order: number;
}

/**
 * Run the procurement optimization engine.
 * Analyzes purchase history, computes price trends, generates recommendations.
 */
export const runProcurementEngine = async (
  db: ReturnType<typeof useDB>,
  config: ProcurementConfig = DEFAULT_PROCUREMENT_CONFIG
): Promise<{ recommendations: ProcurementRecommendationRow[]; generated: number }> => {
  const lookback = config.lookbackDays;

  // 1. Fetch purchase item history (price + supplier + date + item name)
  let priceHistory: PricePoint[] = [];
  try {
    const result = await db.query(
      `SELECT
         purchase_price AS price,
         final_unit_cost AS final_cost,
         price AS list_price,
         quantity,
         supplier.name AS supplier,
         item.id AS item_id,
         item.name AS item_name,
         purchase.created_at AS date
       FROM inventory_purchase_item
       WHERE purchase.created_at > time::now() - ${lookback}d
         AND purchase_price IS NOT NONE
         AND quantity > 0
       ORDER BY purchase.created_at`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    priceHistory = rows.map((r: any) => ({
      date: String(r.date ?? ''),
      price: safeNumber(r.final_cost ?? r.price ?? r.list_price, 0),
      quantity: safeNumber(r.quantity, 0),
      supplier: String(r.supplier ?? 'Unknown'),
      item_id: String(r.item_id ?? ''),
      item_name: String(r.item_name ?? 'Unknown'),
    })).filter(p => p.price > 0);
  } catch (err) {
    console.warn('[procurement] fetchPriceHistory failed', err);
  }

  if (priceHistory.length === 0) return { recommendations: [], generated: 0 };

  // 2. Group by item_id and compute trends
  const itemMap = new Map<string, ItemTrend>();
  for (const point of priceHistory) {
    if (!itemMap.has(point.item_id)) {
      itemMap.set(point.item_id, {
        item_id: point.item_id,
        item_name: point.item_name,
        prices: [],
        current_price: 0,
        current_vendor: '',
        avg_30d: 0,
        recent_slope: 0,
        vendors: new Map(),
        total_quantity: 0,
        avg_qty_per_order: 0,
      });
    }
    const item = itemMap.get(point.item_id)!;
    item.prices.push(point);
    item.total_quantity += point.quantity;

    // Track vendors — keep latest price per vendor
    const existing = item.vendors.get(point.supplier);
    if (!existing || point.date > existing.last_date) {
      item.vendors.set(point.supplier, { price: point.price, last_date: point.date });
    }
  }

  // 3. Compute per-item metrics
  const recommendations: ProcurementRecommendationRow[] = [];
  const now = new Date();

  for (const item of itemMap.values()) {
    if (item.prices.length < 3) continue; // need at least 3 data points

    // Sort by date ascending
    item.prices.sort((a, b) => a.date.localeCompare(b.date));

    // Current price = most recent
    const latest = item.prices[item.prices.length - 1];
    item.current_price = latest.price;
    item.current_vendor = latest.supplier;

    // 30-day average
    const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const last30 = item.prices.filter(p => p.date >= cutoff30);
    item.avg_30d = last30.length > 0
      ? last30.reduce((s, p) => s + p.price, 0) / last30.length
      : item.current_price;

    // Compute slope via simple linear regression on last 14 data points
    const recent = item.prices.slice(-14);
    const n = recent.length;
    if (n >= 2) {
      const xs = recent.map((_, i) => i);
      const ys = recent.map(p => p.price);
      const xMean = xs.reduce((s, x) => s + x, 0) / n;
      const yMean = ys.reduce((s, y) => s + y, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - xMean) * (ys[i] - yMean);
        den += (xs[i] - xMean) ** 2;
      }
      item.recent_slope = den > 0 ? num / den : 0;
    }

    item.avg_qty_per_order = item.total_quantity / item.prices.length;

    // Predicted price in 14 days = current + slope * 14
    const predictedPrice14d = Math.max(0, item.current_price + item.recent_slope * 14);
    // Trend % = (predicted - current) / current
    const trendPct = item.current_price > 0
      ? (predictedPrice14d - item.current_price) / item.current_price
      : 0;

    // Confidence: more data points → higher confidence
    const confidence = Math.min(40 + item.prices.length * 5, 95);

    // Skip items with no meaningful trend
    if (Math.abs(trendPct) < 0.02 && confidence < 60) continue;

    // --- Rule 1: BUY_NOW — price rising significantly ---
    if (trendPct > config.risingThreshold) {
      // Suggest buying 30-day supply now to lock in current price
      const avgMonthlyQty = item.avg_qty_per_order * 4; // ~4 orders per month
      const estSavings = avgMonthlyQty * (predictedPrice14d - item.current_price);
      recommendations.push({
        rule_id: 'buy_now',
        severity: trendPct > 0.15 ? 'critical' : trendPct > 0.08 ? 'high' : 'medium',
        item_id: item.item_id,
        item_name: item.item_name,
        current_vendor: item.current_vendor,
        current_price: Math.round(item.current_price * 10000) / 10000,
        avg_price_30d: Math.round(item.avg_30d * 10000) / 10000,
        predicted_price_14d: Math.round(predictedPrice14d * 10000) / 10000,
        price_trend_pct: Math.round(trendPct * 10000) / 100,
        confidence_score: confidence,
        suggested_qty: Math.round(avgMonthlyQty),
        est_savings: Math.round(estSavings * 100) / 100,
        description: `Price rising +${(trendPct * 100).toFixed(1)}% (slope ${item.recent_slope.toFixed(4)}/day). Buy ${Math.round(avgMonthlyQty)} units now to save ${fmt$(estSavings)}.`,
        status: 'open',
        detected_at: new Date(),
      });
      continue;
    }

    // --- Rule 2: WAIT_FOR_DROP — price falling ---
    if (trendPct < config.fallingThreshold) {
      const avgMonthlyQty = item.avg_qty_per_order * 4;
      const estSavings = avgMonthlyQty * (item.current_price - predictedPrice14d);
      recommendations.push({
        rule_id: 'wait_for_drop',
        severity: trendPct < -0.15 ? 'high' : 'medium',
        item_id: item.item_id,
        item_name: item.item_name,
        current_vendor: item.current_vendor,
        current_price: Math.round(item.current_price * 10000) / 10000,
        avg_price_30d: Math.round(item.avg_30d * 10000) / 10000,
        predicted_price_14d: Math.round(predictedPrice14d * 10000) / 10000,
        price_trend_pct: Math.round(trendPct * 10000) / 100,
        confidence_score: confidence,
        suggested_qty: Math.round(avgMonthlyQty),
        est_savings: Math.round(estSavings * 100) / 100,
        description: `Price falling ${(trendPct * 100).toFixed(1)}% — wait 7-14d, save ${fmt$(estSavings)} on next order.`,
        status: 'open',
        detected_at: new Date(),
      });
      continue;
    }

    // --- Rule 3: SWITCH_VENDOR — alternative vendor ≥10% cheaper ---
    if (item.vendors.size > 1) {
      const currentVendorPrice = item.current_price;
      let bestAlt: { vendor: string; price: number } | null = null;
      for (const [vendor, info] of item.vendors.entries()) {
        if (vendor === item.current_vendor) continue;
        if (info.price < currentVendorPrice * (1 - config.vendorSwitchThreshold)) {
          if (!bestAlt || info.price < bestAlt.price) {
            bestAlt = { vendor, price: info.price };
          }
        }
      }
      if (bestAlt) {
        const savingsPct = (currentVendorPrice - bestAlt.price) / currentVendorPrice;
        const avgMonthlyQty = item.avg_qty_per_order * 4;
        const estSavings = avgMonthlyQty * (currentVendorPrice - bestAlt.price);
        recommendations.push({
          rule_id: 'switch_vendor',
          severity: savingsPct > 0.20 ? 'high' : 'medium',
          item_id: item.item_id,
          item_name: item.item_name,
          current_vendor: item.current_vendor,
          current_price: Math.round(currentVendorPrice * 10000) / 10000,
          avg_price_30d: Math.round(item.avg_30d * 10000) / 10000,
          predicted_price_14d: Math.round(predictedPrice14d * 10000) / 10000,
          price_trend_pct: Math.round(trendPct * 10000) / 100,
          confidence_score: confidence,
          alt_vendor: bestAlt.vendor,
          alt_vendor_price: Math.round(bestAlt.price * 10000) / 10000,
          suggested_qty: Math.round(avgMonthlyQty),
          est_savings: Math.round(estSavings * 100) / 100,
          description: `${bestAlt.vendor} offers ${fmt$(bestAlt.price)} (-${(savingsPct * 100).toFixed(1)}% vs ${item.current_vendor} ${fmt$(currentVendorPrice)}). Switch saves ${fmt$(estSavings)}/mo.`,
          status: 'open',
          detected_at: new Date(),
        });
        continue;
      }
    }

    // --- Rule 4: BULK_DISCOUNT — high-frequency purchases, suggest larger order ---
    if (item.prices.length >= 8 && Math.abs(trendPct) < 0.03) {
      // 8+ orders in 90d = ~2/week, stable price → bulk buy candidate
      const avgMonthlyQty = item.avg_qty_per_order * 4;
      // Estimate 5% bulk discount at 3x normal qty
      const bulkQty = avgMonthlyQty * 3;
      const discountPct = 0.05;
      const estSavings = bulkQty * item.current_price * discountPct;
      recommendations.push({
        rule_id: 'bulk_discount',
        severity: 'low',
        item_id: item.item_id,
        item_name: item.item_name,
        current_vendor: item.current_vendor,
        current_price: Math.round(item.current_price * 10000) / 10000,
        avg_price_30d: Math.round(item.avg_30d * 10000) / 10000,
        predicted_price_14d: Math.round(predictedPrice14d * 10000) / 10000,
        price_trend_pct: Math.round(trendPct * 10000) / 100,
        confidence_score: confidence,
        suggested_qty: Math.round(bulkQty),
        est_savings: Math.round(estSavings * 100) / 100,
        description: `Stable price + ${item.prices.length} orders in 90d — buy ${Math.round(bulkQty)} units (3mo supply) at ~5% bulk discount, save ${fmt$(estSavings)}.`,
        status: 'open',
        detected_at: new Date(),
      });
    }
  }

  // 5. AI insight for top 5 critical/high recommendations
  if (config.aiEnabled && recommendations.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topRecs = recommendations
        .filter(r => r.severity === 'critical' || r.severity === 'high')
        .slice(0, 5);
      for (const r of topRecs) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a procurement optimization AI for restaurants. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Item "${r.item_name}" from ${r.current_vendor}: current ${fmt$(r.current_price)}, 30d avg ${fmt$(r.avg_price_30d)}, 14d forecast ${fmt$(r.predicted_price_14d)} (${r.price_trend_pct > 0 ? '+' : ''}${r.price_trend_pct}% trend, ${r.confidence_score}% confidence). Rule: ${r.rule_id}. Est savings ${fmt$(r.est_savings)}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          r.ai_insight = text.slice(0, 200);
          r.ai_recommendation = r.rule_id === 'buy_now' ? 'place_order'
            : r.rule_id === 'wait_for_drop' ? 'wait_14d'
            : r.rule_id === 'switch_vendor' ? 'switch_now'
            : r.rule_id === 'bulk_discount' ? 'place_order'
            : 'monitor';
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 6. Persist
  try {
    await db.query(`DELETE FROM procurement_recommendation WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const r of recommendations) {
    try {
      await db.query(`CREATE procurement_recommendation CONTENT $data`, {
        data: { ...r, detected_at: r.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { recommendations, generated: recommendations.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveRecommendations = async (db: ReturnType<typeof useDB>): Promise<ProcurementRecommendationRow[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM procurement_recommendation
       WHERE status = 'open'
       ORDER BY est_savings DESC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  buyNowCount: number;
  waitCount: number;
  switchCount: number;
  bulkCount: number;
  totalSavings: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'buy_now') AS buy_now,
         math::count(rule_id = 'wait_for_drop') AS wait_drop,
         math::count(rule_id = 'switch_vendor') AS switch_v,
         math::count(rule_id = 'bulk_discount') AS bulk,
         math::sum(est_savings) AS savings
       FROM procurement_recommendation
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      buyNowCount: safeNumber(r.buy_now, 0),
      waitCount: safeNumber(r.wait_drop, 0),
      switchCount: safeNumber(r.switch_v, 0),
      bulkCount: safeNumber(r.bulk, 0),
      totalSavings: safeNumber(r.savings, 0),
    };
  } catch {
    return { buyNowCount: 0, waitCount: 0, switchCount: 0, bulkCount: 0, totalSavings: 0 };
  }
};

export const updateRecommendationStatus = async (
  db: ReturnType<typeof useDB>,
  recId: string,
  status: 'ordered' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: recId, status });
};
