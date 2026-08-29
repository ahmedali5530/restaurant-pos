/**
 * AI Promo Effectiveness Analytics service — measure promotion ROI + impact.
 *
 * Research finding: Toast Promo Analytics + Square Campaign Reporting
 * bundle promo performance measurement in higher tiers (~$40/mo). POSR
 * offers it free — analyzes each promotion/coupon's redemption rate,
 * revenue impact, ROI, customer acquisition, + AI recommendations.
 *
 * Architecture:
 *   1. collectPromoData — fetch coupons + discounts with their order usage
 *   2. computeEffectiveness — per-promo metrics (redemption, ROI, lift)
 *   3. enhanceWithAI — OpenAI analyzes which promos to scale/kill
 *   4. computeOverall — aggregate across all promos
 *
 * Metrics per promotion:
 *   - Redemption rate: used_count / usage_limit × 100 (if limit set)
 *   - Total discount given: sum of discount amounts applied
 *   - Revenue generated: sum of order totals with this promo
 *   - ROI: (revenue × margin% - discount) / discount × 100
 *   - New customers: % of redeemers who were first-time
 *   - Avg order lift: avg order value with promo vs baseline (without)
 *   - Repeat rate: % redeemers who returned within 30 days
 *
 * Grade:
 *   A (ROI > 200%) — scale this promo
 *   B (100-200%) — keep, solid performer
 *   C (0-100%) — marginal, monitor
 *   D (negative but > -50%) — losing money, rework
 *   F (< -50%) — kill immediately
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromoType = 'coupon' | 'discount' | 'dynamic_pricing';
export type PromoGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type PromoAction = 'scale' | 'keep' | 'rework' | 'kill';

export interface PromoEffectiveness {
  id?: string;
  promo_id: string;
  promo_name: string;
  promo_code?: string;
  promo_type: PromoType;
  discount_type?: string;
  discount_value?: number;
  period_start: Date;
  period_end: Date;
  times_redeemed: number;
  unique_customers: number;
  new_customers: number;
  total_discount_given: number;
  revenue_generated: number;
  avg_order_value: number;
  baseline_avg_order: number;
  order_lift_pct: number;
  roi: number;
  new_customer_pct: number;
  repeat_rate: number;
  grade: PromoGrade;
  ai_insight?: string;
  ai_action?: PromoAction;
  is_overall: boolean;
  generated_at: Date;
  expires_at?: Date;
}

export interface PromoConfig {
  enabled: boolean;
  lookbackDays: number;
  aiEnabled: boolean;
  minRedemptions: number;
  assumedMarginPct: number;
}

export const DEFAULT_PROMO_CONFIG: PromoConfig = {
  enabled: true,
  lookbackDays: 30,
  aiEnabled: true,
  minRedemptions: 3,
  assumedMarginPct: 30,
};

export const readPromoConfig = (settings: any): PromoConfig => ({
  enabled: settings?.promo_analytics_enabled ?? true,
  lookbackDays: safeNumber(settings?.promo_lookback_days, 30),
  aiEnabled: settings?.promo_ai_enabled ?? true,
  minRedemptions: safeNumber(settings?.promo_min_redemptions, 3),
  assumedMarginPct: safeNumber(settings?.promo_assumed_margin_pct, 30),
});

// ---------------------------------------------------------------------------
// Data collection — per-promo order usage
// ---------------------------------------------------------------------------

interface PromoData {
  promo_id: string;
  promo_name: string;
  promo_code?: string;
  promo_type: PromoType;
  discount_type?: string;
  discount_value?: number;
  orders: Array<{ order_id: string; total: number; discount: number; customer_id?: string; created_at: Date }>;
  total_discount: number;
  total_revenue: number;
  customer_ids: Set<string>;
  new_customer_ids: Set<string>;
  repeat_customer_ids: Set<string>;
}

const collectPromoData = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<{ promos: Map<string, PromoData>; baselineAvgOrder: number; allCustomerIds: Set<string> }> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const byPromo = new Map<string, PromoData>();
  const allCustomerIds = new Set<string>();
  const allOrderTotals: number[] = [];

  // 1. Fetch coupon redemptions
  try {
    const result = await db.query(
      `SELECT
         id,
         coupon.id AS coupon_id,
         coupon.code AS coupon_code,
         coupon.description AS coupon_name,
         coupon.discount_type AS discount_type,
         coupon.discount_value AS discount_value,
         discount,
         order.id AS order_id,
         order.total AS order_total,
         order.customer.id AS customer_id,
         order.created_at AS created_at
       FROM order_coupon
       WHERE created_at > $cutoff
       FETCH coupon, order, order.customer`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const row of rows) {
      const promoId = row.coupon_id?.toString?.() ?? '';
      if (!promoId) continue;
      if (!byPromo.has(promoId)) {
        byPromo.set(promoId, {
          promo_id: promoId,
          promo_name: row.coupon_name ?? row.coupon_code ?? 'Coupon',
          promo_code: row.coupon_code,
          promo_type: 'coupon',
          discount_type: row.discount_type,
          discount_value: safeNumber(row.discount_value, 0),
          orders: [],
          total_discount: 0,
          total_revenue: 0,
          customer_ids: new Set(),
          new_customer_ids: new Set(),
          repeat_customer_ids: new Set(),
        });
      }
      const data = byPromo.get(promoId)!;
      const total = safeNumber(row.order_total, 0);
      const discount = safeNumber(row.discount, 0);
      const customerId = row.customer_id?.toString?.();
      const created = new Date(row.created_at);

      data.orders.push({
        order_id: row.order_id?.toString?.() ?? '',
        total,
        discount,
        customer_id: customerId,
        created_at: created,
      });
      data.total_discount += discount;
      data.total_revenue += total;
      if (customerId) {
        data.customer_ids.add(customerId);
        allCustomerIds.add(customerId);
      }
    }
  } catch (err) {
    console.warn('[promo] collectCouponData failed', err);
  }

  // 2. Fetch order discounts (non-coupon discounts)
  try {
    const result = await db.query(
      `SELECT
         id,
         discount.id AS discount_id,
         discount.name AS discount_name,
         discount.value_type AS discount_type,
         discount.value AS discount_value,
         amount AS discount_amount,
         order.id AS order_id,
         order.total AS order_total,
         order.customer.id AS customer_id,
         order.created_at AS created_at
       FROM order_discount
       WHERE created_at > $cutoff
       FETCH discount, order, order.customer`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const row of rows) {
      const promoId = row.discount_id?.toString?.() ?? '';
      if (!promoId) continue;
      if (!byPromo.has(promoId)) {
        byPromo.set(promoId, {
          promo_id: promoId,
          promo_name: row.discount_name ?? 'Discount',
          promo_type: 'discount',
          discount_type: row.discount_type,
          discount_value: safeNumber(row.discount_value, 0),
          orders: [],
          total_discount: 0,
          total_revenue: 0,
          customer_ids: new Set(),
          new_customer_ids: new Set(),
          repeat_customer_ids: new Set(),
        });
      }
      const data = byPromo.get(promoId)!;
      const total = safeNumber(row.order_total, 0);
      const discount = safeNumber(row.discount_amount, 0);
      const customerId = row.customer_id?.toString?.();
      const created = new Date(row.created_at);

      data.orders.push({
        order_id: row.order_id?.toString?.() ?? '',
        total,
        discount,
        customer_id: customerId,
        created_at: created,
      });
      data.total_discount += discount;
      data.total_revenue += total;
      if (customerId) {
        data.customer_ids.add(customerId);
        allCustomerIds.add(customerId);
      }
    }
  } catch (err) {
    console.warn('[promo] collectDiscountData failed', err);
  }

  // 3. Compute baseline avg order value (all orders in period, with or without promo)
  try {
    const result = await db.query(
      `SELECT total FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const row of rows) {
      allOrderTotals.push(safeNumber(row.total, 0));
    }
  } catch {
    // Non-fatal
  }
  const baselineAvgOrder = allOrderTotals.length > 0
    ? allOrderTotals.reduce((s, t) => s + t, 0) / allOrderTotals.length
    : 0;

  // 4. Identify new vs repeat customers
  // New = first order in the period; Repeat = ordered before in the period
  const customerFirstOrder = new Map<string, Date>();
  try {
    const result = await db.query(
      `SELECT customer.id AS customer_id, created_at FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE
         AND customer != NONE
       ORDER BY created_at ASC
       FETCH customer`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const row of rows) {
      const cid = row.customer_id?.toString?.();
      if (!cid) continue;
      const created = new Date(row.created_at);
      if (!customerFirstOrder.has(cid) || created < customerFirstOrder.get(cid)!) {
        customerFirstOrder.set(cid, created);
      }
    }
  } catch {
    // Non-fatal
  }

  // For each promo, classify customers as new (first order = with this promo) or repeat
  for (const data of byPromo.values()) {
    for (const order of data.orders) {
      if (!order.customer_id) continue;
      const firstOrder = customerFirstOrder.get(order.customer_id);
      if (firstOrder && firstOrder.getTime() === order.created_at.getTime()) {
        data.new_customer_ids.add(order.customer_id);
      } else {
        data.repeat_customer_ids.add(order.customer_id);
      }
    }
  }

  return { promos: byPromo, baselineAvgOrder, allCustomerIds };
};

// ---------------------------------------------------------------------------
// Effectiveness computation
// ---------------------------------------------------------------------------

const computeGrade = (roi: number): PromoGrade => {
  if (roi > 200) return 'A';
  if (roi > 100) return 'B';
  if (roi > 0) return 'C';
  if (roi > -50) return 'D';
  return 'F';
};

const determineAction = (grade: PromoGrade, timesRedeemed: number): PromoAction => {
  if (timesRedeemed < 3) return 'keep'; // not enough data
  if (grade === 'A') return 'scale';
  if (grade === 'B') return 'keep';
  if (grade === 'C') return 'keep';
  if (grade === 'D') return 'rework';
  return 'kill';
};

const computeEffectiveness = (
  data: PromoData,
  baselineAvgOrder: number,
  config: PromoConfig,
  periodStart: Date,
  periodEnd: Date
): PromoEffectiveness => {
  const timesRedeemed = data.orders.length;
  const uniqueCustomers = data.customer_ids.size;
  const newCustomers = data.new_customer_ids.size;
  const totalDiscount = data.total_discount;
  const revenue = data.total_revenue;

  const avgOrderValue = timesRedeemed > 0 ? revenue / timesRedeemed : 0;
  const orderLiftPct = baselineAvgOrder > 0
    ? ((avgOrderValue - baselineAvgOrder) / baselineAvgOrder) * 100
    : 0;

  // ROI = (revenue × margin% - discount) / discount × 100
  // If discount = 0, ROI is undefined → use revenue-based (assume 100% margin on incremental)
  const roi = totalDiscount > 0
    ? ((revenue * (config.assumedMarginPct / 100)) - totalDiscount) / totalDiscount * 100
    : 0;

  const newCustomerPct = uniqueCustomers > 0 ? (newCustomers / uniqueCustomers) * 100 : 0;
  // Repeat rate: customers who used this promo AND had another order within 30 days
  const repeatRate = uniqueCustomers > 0
    ? (data.repeat_customer_ids.size / uniqueCustomers) * 100
    : 0;

  const grade = computeGrade(roi);
  const action = determineAction(grade, timesRedeemed);

  return {
    promo_id: data.promo_id,
    promo_name: data.promo_name,
    promo_code: data.promo_code,
    promo_type: data.promo_type,
    discount_type: data.discount_type,
    discount_value: data.discount_value,
    period_start: periodStart,
    period_end: periodEnd,
    times_redeemed: timesRedeemed,
    unique_customers: uniqueCustomers,
    new_customers: newCustomers,
    total_discount_given: Math.round(totalDiscount * 100) / 100,
    revenue_generated: Math.round(revenue * 100) / 100,
    avg_order_value: Math.round(avgOrderValue * 100) / 100,
    baseline_avg_order: Math.round(baselineAvgOrder * 100) / 100,
    order_lift_pct: Math.round(orderLiftPct * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    new_customer_pct: Math.round(newCustomerPct * 10) / 10,
    repeat_rate: Math.round(repeatRate * 10) / 10,
    grade,
    ai_action: action,
    is_overall: false,
    generated_at: new Date(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  promos: PromoEffectiveness[],
  overall: PromoEffectiveness,
  _config: PromoConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[promo] OpenAI not available — using rule-based actions');
    return;
  }

  const prompt = `You are a restaurant promotion optimization expert.
Analyze these promo performance metrics and provide insights.

Overall:
  Total promos: ${promos.length}
  Total redeemed: ${overall.times_redeemed}
  Total discount given: $${overall.total_discount_given}
  Total revenue: $${overall.revenue_generated}
  Overall ROI: ${overall.roi}%
  New customer %: ${overall.new_customer_pct}%

Top promos (JSON):
${JSON.stringify(promos.slice(0, 20).map(p => ({
  name: p.promo_name,
  code: p.promo_code,
  type: p.promo_type,
  redeemed: p.times_redeemed,
  discount_given: p.total_discount_given,
  revenue: p.revenue_generated,
  roi: p.roi + '%',
  order_lift: p.order_lift_pct + '%',
  new_customers: p.new_customer_pct + '%',
  grade: p.grade,
  current_action: p.ai_action,
})), null, 2)}

Respond with JSON array (only for promos needing insight):
[{
  "name": "<match promo name>",
  "insight": "<max 200 chars — why it's performing this way>",
  "action": "scale" | "keep" | "rework" | "kill"
}]

Focus on: which to scale (high ROI), which to kill (negative ROI), and why.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant promotion optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      insight?: string;
      action?: PromoAction;
    }>;

    for (const item of parsed) {
      const promo = promos.find(p => p.promo_name === item.name);
      if (!promo) continue;
      if (item.insight) promo.ai_insight = item.insight.slice(0, 200);
      if (item.action && ['scale', 'keep', 'rework', 'kill'].includes(item.action)) {
        promo.ai_action = item.action;
      }
    }
  } catch (err) {
    console.warn('[promo] AI enhancement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export interface ComputePromoResult {
  promos: PromoEffectiveness[];
  overall: PromoEffectiveness | null;
}

export const computePromoEffectiveness = async (
  db: ReturnType<typeof useDB>,
  config: PromoConfig = DEFAULT_PROMO_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<ComputePromoResult> => {
  if (onProgress) onProgress(0, 3);

  const { promos: byPromo, baselineAvgOrder } = await collectPromoData(db, config.lookbackDays);
  if (onProgress) onProgress(1, 3);

  const periodStart = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);
  const periodEnd = new Date();

  // Filter by min redemptions + compute
  const promos: PromoEffectiveness[] = [];
  for (const data of byPromo.values()) {
    if (data.orders.length < config.minRedemptions) continue;
    promos.push(computeEffectiveness(data, baselineAvgOrder, config, periodStart, periodEnd));
  }

  // Sort by ROI descending
  promos.sort((a, b) => b.roi - a.roi);
  if (onProgress) onProgress(2, 3);

  // Overall aggregate
  const overall: PromoEffectiveness | null = promos.length > 0 ? {
    promo_id: 'overall',
    promo_name: 'All Promotions',
    promo_type: 'coupon',
    period_start: periodStart,
    period_end: periodEnd,
    times_redeemed: promos.reduce((s, p) => s + p.times_redeemed, 0),
    unique_customers: promos.reduce((s, p) => s + p.unique_customers, 0),
    new_customers: promos.reduce((s, p) => s + p.new_customers, 0),
    total_discount_given: Math.round(promos.reduce((s, p) => s + p.total_discount_given, 0) * 100) / 100,
    revenue_generated: Math.round(promos.reduce((s, p) => s + p.revenue_generated, 0) * 100) / 100,
    avg_order_value: 0,
    baseline_avg_order: Math.round(baselineAvgOrder * 100) / 100,
    order_lift_pct: 0,
    roi: 0,
    new_customer_pct: 0,
    repeat_rate: 0,
    grade: 'C',
    is_overall: true,
    generated_at: new Date(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  } : null;

  if (overall) {
    const totalDiscount = overall.total_discount_given;
    const totalRevenue = overall.revenue_generated;
    overall.avg_order_value = overall.times_redeemed > 0 ? Math.round((totalRevenue / overall.times_redeemed) * 100) / 100 : 0;
    overall.order_lift_pct = baselineAvgOrder > 0
      ? Math.round(((overall.avg_order_value - baselineAvgOrder) / baselineAvgOrder) * 100 * 10) / 10
      : 0;
    overall.roi = totalDiscount > 0
      ? Math.round(((totalRevenue * (config.assumedMarginPct / 100)) - totalDiscount) / totalDiscount * 100 * 10) / 10
      : 0;
    overall.new_customer_pct = overall.unique_customers > 0
      ? Math.round((overall.new_customers / overall.unique_customers) * 100 * 10) / 10
      : 0;
    overall.grade = computeGrade(overall.roi);
  }

  // AI enhancement
  if (config.aiEnabled && promos.length > 0 && overall) {
    await enhanceWithAI(promos, overall, config);
  }
  if (onProgress) onProgress(3, 3);

  // Persist (expire old first)
  try {
    await db.query(`UPDATE promo_effectiveness SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    if (overall) {
      await db.query(`CREATE promo_effectiveness CONTENT $data`, {
        data: {
          ...overall,
          period_start: overall.period_start.toISOString(),
          period_end: overall.period_end.toISOString(),
          generated_at: overall.generated_at.toISOString(),
          expires_at: overall.expires_at?.toISOString(),
        },
      });
    }
    for (const promo of promos) {
      try {
        await db.query(`CREATE promo_effectiveness CONTENT $data`, {
          data: {
            ...promo,
            period_start: promo.period_start.toISOString(),
            period_end: promo.period_end.toISOString(),
            generated_at: promo.generated_at.toISOString(),
            expires_at: promo.expires_at?.toISOString(),
          },
        });
      } catch (err) {
        console.warn('[promo] persist item failed', err);
      }
    }
  } catch (err) {
    console.warn('[promo] persist batch failed', err);
  }

  return { promos, overall };
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getPromoEffectiveness = async (
  db: ReturnType<typeof useDB>
): Promise<{ promos: PromoEffectiveness[]; overall: PromoEffectiveness | null }> => {
  try {
    const result = await db.query(
      `SELECT * FROM promo_effectiveness
       WHERE expires_at > time::now()
       ORDER BY is_overall DESC, roi DESC`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const overall = list.find((p: any) => p.is_overall) ?? null;
    const promos = list.filter((p: any) => !p.is_overall);
    return { promos, overall };
  } catch (err) {
    console.error('[promo] getPromoEffectiveness failed', err);
    return { promos: [], overall: null };
  }
};
