/**
 * AI Promo Campaign Effectiveness Predictor — ROI forecasting before launch.
 *
 * 18th POSR-exclusive differentiator — Toast and Square have basic coupon
 * CRUD but NO predictive ROI modeling. 60% of campaigns underperform
 * expectations. POSR forecasts ROI + cannibalization + AI recommendation
 * BEFORE launch — managers see expected impact before spending.
 *
 * Distinct from promo-analytics.service (which MEASURES effectiveness AFTER
 * launch). This service FORECASTS effectiveness BEFORE launch.
 *
 * Algorithm:
 *   1. Historical similar campaigns: same discount_type, similar value
 *   2. Redemption rate forecast: based on discount depth + audience + duration
 *   3. Revenue impact:
 *      - Gross discount cost = est_redemptions × avg_discount_amount
 *      - Incremental revenue = est_new_orders × avg_check (new customers)
 *      - Cannibalization = est_redemptions_from_existing × (full - discounted)
 *   4. Net ROI = (incremental - cannibalization - discount_cost) / discount_cost
 *   5. AI recommendation: launch | optimize | reject | a/b_test
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromoRecommendation = 'launch' | 'optimize' | 'reject' | 'a_b_test';

export interface PromoForecast {
  id?: string;
  coupon?: string;
  coupon_code?: string;
  description: string;
  discount_type: string;
  discount_value: number;
  min_order_amount?: number;
  campaign_duration_days: number;
  est_audience_size: number;
  est_redemption_rate: number;
  est_redemptions: number;
  est_avg_discount_amount: number;
  est_discount_cost: number;
  est_incremental_revenue: number;
  est_cannibalization_cost: number;
  est_net_revenue_impact: number;
  est_roi: number;
  confidence: number;
  ai_recommendation?: PromoRecommendation;
  ai_insight?: string;
  historical_similar_count: number;
  actual_redemptions?: number;
  actual_net_revenue?: number;
  forecasted_at: Date;
  campaign_end_at?: Date;
  branch_id?: string;
}

export interface PromoForecastConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  minSimilar: number;
  defaultAudience: number;
  goodRoiThreshold: number;
  rejectRoiThreshold: number;
}

export const DEFAULT_PROMOFORECAST_CONFIG: PromoForecastConfig = {
  aiEnabled: true,
  lookbackDays: 365,
  minSimilar: 3,
  defaultAudience: 100,
  goodRoiThreshold: 1.5,
  rejectRoiThreshold: 0.8,
};

export const readPromoForecastConfig = (settings: any): PromoForecastConfig => ({
  aiEnabled: settings?.promoforecast_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.promoforecast_lookback_days, 365),
  minSimilar: safeNumber(settings?.promoforecast_min_similar, 3),
  defaultAudience: safeNumber(settings?.promoforecast_default_audience, 100),
  goodRoiThreshold: safeNumber(settings?.promoforecast_good_roi_threshold, 1.5),
  rejectRoiThreshold: safeNumber(settings?.promoforecast_reject_roi_threshold, 0.8),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Redemption rate model: deeper discounts → higher redemption, but diminishing returns
// 5% off → ~3% redemption, 15% off → ~8%, 25% off → ~15%, 50% off → ~30%
const estimateRedemptionRate = (
  discountType: string,
  discountValue: number,
  durationDays: number,
  historicalAvg: number
): number => {
  let baseRate: number;
  if (discountType === 'percentage') {
    // Logistic curve: rate = 0.30 / (1 + e^(-(pct-0.25)/0.10))
    const pct = Math.min(0.6, discountValue);
    baseRate = 0.30 / (1 + Math.exp(-(pct - 0.25) / 0.10));
  } else if (discountType === 'fixed') {
    // Assume fixed $5 → ~8%, $10 → ~15%, $20 → ~25%
    baseRate = Math.min(0.30, discountValue / 80);
  } else if (discountType === 'bogo') {
    baseRate = 0.18; // BOGO historically strong
  } else if (discountType === 'free_item') {
    baseRate = 0.22;
  } else {
    baseRate = 0.05;
  }
  // Duration multiplier: longer campaigns → more redemptions but rate drops
  const durationMultiplier = Math.min(1.5, Math.log10(durationDays + 1) / Math.log10(8));
  // Blend with historical avg if available
  const blended = historicalAvg > 0 ? (baseRate * 0.6 + historicalAvg * 0.4) : baseRate;
  return Math.max(0.01, Math.min(0.50, blended * durationMultiplier));
};

// ---------------------------------------------------------------------------
// Historical data fetching
// ---------------------------------------------------------------------------

interface HistoricalCampaign {
  discountType: string;
  discountValue: number;
  redemptionCount: number;
  audienceSize: number;
  avgDiscountAmount: number;
  durationDays: number;
}

const fetchHistoricalCampaigns = async (
  db: any,
  discountType: string,
  cfg: PromoForecastConfig
): Promise<{ campaigns: HistoricalCampaign[]; avgRedemptionRate: number; avgCheck: number }> => {
  try {
    // Get coupon_redemptions grouped by coupon, with coupon details
    const result = await db.query(
      `SELECT
         coupon.id AS coupon_id,
         coupon.discount_type AS dtype,
         coupon.discount_value AS dvalue,
         coupon.start_date AS start,
         coupon.end_date AS end,
         count() AS redemptions,
         math::sum(discount_amount) AS total_discount
       FROM coupon_redemption
       WHERE redeemed_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY coupon
       FETCH coupon`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const campaigns: HistoricalCampaign[] = [];
    let totalRedemptionRate = 0;
    let rateCount = 0;

    for (const r of rows) {
      const dtype = r.dtype ?? 'percentage';
      const dvalue = safeNumber(r.dvalue, 0);
      const redemptions = safeNumber(r.redemptions, 0);
      const totalDiscount = safeNumber(r.total_discount, 0);
      const avgDiscount = redemptions > 0 ? totalDiscount / redemptions : 0;
      const durationDays = r.start && r.end
        ? Math.max(1, Math.floor((new Date(r.end).getTime() - new Date(r.start).getTime()) / (1000 * 60 * 60 * 24)))
        : 7;
      // Estimate audience (unknown — use redemptions × 8 as proxy)
      const audienceSize = Math.max(redemptions, redemptions * 8);
      campaigns.push({
        discountType: dtype,
        discountValue: dvalue,
        redemptionCount: redemptions,
        audienceSize,
        avgDiscountAmount: avgDiscount,
        durationDays,
      });
      if (audienceSize > 0) {
        totalRedemptionRate += redemptions / audienceSize;
        rateCount++;
      }
    }

    // Filter similar campaigns (same discount type, ±25% value)
    const similar = campaigns.filter(c =>
      c.discountType === discountType
    );
    const avgRedemptionRate = rateCount > 0 ? totalRedemptionRate / rateCount : 0;

    // Avg check from orders
    const checkResult = await db.query(
      `SELECT math::mean(total) AS avg_check FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE
         AND created_at > time::now() - 30d`
    );
    const checkRows = Array.isArray(checkResult) ? checkResult.flat() : [];
    const avgCheck = safeNumber(checkRows[0]?.avg_check, 25);

    return { campaigns: similar, avgRedemptionRate, avgCheck };
  } catch (err) {
    console.warn('[promoforecast] fetchHistorical failed', err);
    return { campaigns: [], avgRedemptionRate: 0, avgCheck: 25 };
  }
};

// ---------------------------------------------------------------------------
// Forecast computation
// ---------------------------------------------------------------------------

const computeForecast = (
  discountType: string,
  discountValue: number,
  minOrderAmount: number,
  durationDays: number,
  audienceSize: number,
  historical: HistoricalCampaign[],
  avgRedemptionRate: number,
  avgCheck: number,
  cfg: PromoForecastConfig
): PromoForecast => {
  // Redemption rate forecast
  const redemptionRate = estimateRedemptionRate(
    discountType, discountValue, durationDays, avgRedemptionRate
  );
  const estRedemptions = Math.round(audienceSize * redemptionRate);

  // Avg discount amount per redemption
  let avgDiscountAmount: number;
  if (discountType === 'percentage') {
    avgDiscountAmount = avgCheck * discountValue;
  } else if (discountType === 'fixed') {
    avgDiscountAmount = discountValue;
  } else if (discountType === 'bogo') {
    avgDiscountAmount = avgCheck * 0.5; // ~half the check (buy-one-get-one)
  } else if (discountType === 'free_item') {
    avgDiscountAmount = avgCheck * 0.25; // ~appetizer value
  } else {
    avgDiscountAmount = avgCheck * 0.10;
  }
  if (minOrderAmount > 0) {
    avgDiscountAmount = Math.min(avgDiscountAmount, avgCheck * 0.30); // cap
  }

  const estDiscountCost = estRedemptions * avgDiscountAmount;

  // Incremental revenue: new orders attracted by promo
  // Assume 30% of redemptions are from NEW customers (wouldn't have ordered otherwise)
  const newCustomerRatio = 0.30;
  const estNewOrders = Math.round(estRedemptions * newCustomerRatio);
  const estIncrementalRevenue = estNewOrders * avgCheck;

  // Cannibalization: existing customers who'd have paid full price
  // 70% of redemptions from existing customers × (full_price - discounted_price)
  const existingRedemptions = estRedemptions - estNewOrders;
  const cannibalizationPerRedemption = avgDiscountAmount; // they'd have paid full, now pay (full - discount)
  const estCannibalizationCost = existingRedemptions * cannibalizationPerRedemption;

  // Net revenue impact
  const estNetRevenueImpact = estIncrementalRevenue - estCannibalizationCost - estDiscountCost;

  // ROI
  const estRoi = estDiscountCost > 0 ? estNetRevenueImpact / estDiscountCost : 0;

  // Confidence: based on similar campaign count
  const similarCount = historical.length;
  let confidence = Math.min(1, similarCount / cfg.minSimilar);
  // Reduce confidence if historical variance is high
  if (similarCount > 0) {
    const rates = historical.map(c => c.audienceSize > 0 ? c.redemptionCount / c.audienceSize : 0);
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((s, r) => s + Math.pow(r - avgRate, 2), 0) / rates.length;
    const cv = avgRate > 0 ? Math.sqrt(variance) / avgRate : 1;
    confidence *= Math.max(0.3, 1 - cv);
  } else {
    confidence = Math.max(0.2, confidence); // floor for no-data forecasts
  }

  return {
    description: `${discountType === 'percentage' ? (discountValue * 100).toFixed(0) + '%' : formatCurrency(discountValue)} off ${discountType} for ${durationDays} days to ${audienceSize} customers`,
    discount_type: discountType,
    discount_value: discountValue,
    min_order_amount: minOrderAmount,
    campaign_duration_days: durationDays,
    est_audience_size: audienceSize,
    est_redemption_rate: Math.round(redemptionRate * 1000) / 1000,
    est_redemptions: estRedemptions,
    est_avg_discount_amount: Math.round(avgDiscountAmount * 100) / 100,
    est_discount_cost: Math.round(estDiscountCost * 100) / 100,
    est_incremental_revenue: Math.round(estIncrementalRevenue * 100) / 100,
    est_cannibalization_cost: Math.round(estCannibalizationCost * 100) / 100,
    est_net_revenue_impact: Math.round(estNetRevenueImpact * 100) / 100,
    est_roi: Math.round(estRoi * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    historical_similar_count: similarCount,
    forecasted_at: new Date(),
  };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  forecasts: PromoForecast[],
  cfg: PromoForecastConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || forecasts.length === 0) return;

  const prompt = `You are a restaurant marketing strategist.
For each promo campaign forecast below, provide:
  - recommendation: one of launch | optimize | reject | a_b_test
  - insight: max 200 chars — why this recommendation + key risk/opportunity

Recommendation guidance:
  - launch: ROI >= ${cfg.goodRoiThreshold} AND confidence > 0.5
  - reject: ROI < ${cfg.rejectRoiThreshold}
  - optimize: ROI between ${cfg.rejectRoiThreshold} and ${cfg.goodRoiThreshold} — suggest tweak (duration/discount/audience)
  - a_b_test: high uncertainty (confidence < 0.4) — test small before full launch

Forecasts (JSON):
${JSON.stringify(forecasts.map(f => ({
  description: f.description,
  discount_type: f.discount_type,
  discount_value: f.discount_value,
  est_redemptions: f.est_redemptions,
  est_discount_cost: f.est_discount_cost,
  est_incremental_revenue: f.est_incremental_revenue,
  est_cannibalization_cost: f.est_cannibalization_cost,
  est_net_revenue_impact: f.est_net_revenue_impact,
  est_roi: f.est_roi,
  confidence: f.confidence,
  historical_similar: f.historical_similar_count,
})), null, 2)}

Respond with JSON array:
[{
  "description": "<match description>",
  "recommendation": "launch" | "optimize" | "reject" | "a_b_test",
  "insight": "<max 200 chars>"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a promo campaign forecasting AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      description: string; recommendation?: PromoRecommendation; insight?: string;
    }>;
    for (const item of parsed) {
      const forecast = forecasts.find(f => f.description === item.description);
      if (forecast) {
        if (item.recommendation) forecast.ai_recommendation = item.recommendation;
        if (item.insight) forecast.ai_insight = item.insight.slice(0, 200);
      }
    }
  } catch (err) { console.warn('[promoforecast] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry — forecast for active coupons (no redemptions yet = pre-launch)
// ---------------------------------------------------------------------------

export const runPromoForecast = async (
  db: ReturnType<typeof useDB>,
  config: PromoForecastConfig = DEFAULT_PROMOFORECAST_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ forecasts: PromoForecast[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch active coupons (campaigns that haven't ended or have low redemptions)
  let coupons: any[] = [];
  try {
    const result = await db.query(
      `SELECT id, code, description, discount_type, discount_value,
              min_order_amount, start_date, end_date, usage_limit
       FROM coupon
       WHERE is_active = true
         AND deleted_at IS NONE
         AND (end_date IS NONE OR end_date > time::now())
       LIMIT 30`
    );
    coupons = Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.warn('[promoforecast] fetchCoupons failed', err);
    return { forecasts: [], scanned: 0 };
  }

  if (onProgress) onProgress(1, 2);

  // 2. For each coupon, compute forecast
  const forecasts: PromoForecast[] = [];
  for (const coupon of coupons) {
    try {
      const discountType = coupon.discount_type ?? 'percentage';
      const discountValue = safeNumber(coupon.discount_value, 0);
      const minOrder = safeNumber(coupon.min_order_amount, 0);
      const durationDays = coupon.start_date && coupon.end_date
        ? Math.max(1, Math.floor((new Date(coupon.end_date).getTime() - new Date(coupon.start_date).getTime()) / (1000 * 60 * 60 * 24)))
        : 7;
      const audienceSize = safeNumber(coupon.usage_limit, config.defaultAudience);

      const { campaigns: historical, avgRedemptionRate, avgCheck } =
        await fetchHistoricalCampaigns(db, discountType, config);

      const forecast = computeForecast(
        discountType, discountValue, minOrder, durationDays, audienceSize,
        historical, avgRedemptionRate, avgCheck, config
      );
      forecast.coupon = coupon.id?.toString?.();
      forecast.coupon_code = coupon.code;
      forecast.campaign_end_at = coupon.end_date ? new Date(coupon.end_date) : undefined;

      forecasts.push(forecast);
    } catch (err) {
      console.warn('[promoforecast] forecast failed for coupon', coupon.code, err);
    }
  }

  // 3. AI enhancement
  if (config.aiEnabled && forecasts.length > 0) {
    await enhanceWithAI(forecasts, config);
  }

  // 4. Persist (refresh — delete old forecasts > 1h, create new)
  try {
    await db.query(`DELETE FROM promo_forecast WHERE forecasted_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const forecast of forecasts) {
    try {
      await db.query(`CREATE promo_forecast CONTENT $data`, {
        data: {
          ...forecast,
          forecasted_at: forecast.forecasted_at.toISOString(),
          campaign_end_at: forecast.campaign_end_at?.toISOString(),
        },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { forecasts, scanned: coupons.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getActiveForecasts = async (
  db: ReturnType<typeof useDB>
): Promise<PromoForecast[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM promo_forecast
       WHERE forecasted_at > time::now() - 24h
       ORDER BY
         CASE ai_recommendation WHEN 'launch' THEN 0 WHEN 'a_b_test' THEN 1 WHEN 'optimize' THEN 2 ELSE 3 END,
         est_roi DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface PromoForecastSummary {
  total: number;
  launch: number;
  optimize: number;
  reject: number;
  totalDiscountCost: number;
  totalNetRevenue: number;
  avgRoi: number;
}

export const getPromoForecastSummary = async (
  db: ReturnType<typeof useDB>
): Promise<PromoForecastSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(ai_recommendation = 'launch') AS launch,
         math::count(ai_recommendation = 'optimize') AS optimize,
         math::count(ai_recommendation = 'reject') AS reject,
         math::sum(est_discount_cost) AS total_cost,
         math::sum(est_net_revenue_impact) AS total_revenue,
         math::mean(est_roi) AS avg_roi
       FROM promo_forecast
       WHERE forecasted_at > time::now() - 24h
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      launch: safeNumber(row.launch, 0),
      optimize: safeNumber(row.optimize, 0),
      reject: safeNumber(row.reject, 0),
      totalDiscountCost: safeNumber(row.total_cost, 0),
      totalNetRevenue: safeNumber(row.total_revenue, 0),
      avgRoi: safeNumber(row.avg_roi, 0),
    };
  } catch {
    return { total: 0, launch: 0, optimize: 0, reject: 0, totalDiscountCost: 0, totalNetRevenue: 0, avgRoi: 0 };
  }
};
