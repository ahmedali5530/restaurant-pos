/**
 * AI Customer Lifetime Value (CLV) Prediction service.
 *
 * Research finding: Toast Customer 360 + Square Customer Insights bundle
 * CLV prediction in higher tiers (~$45/mo). POSR offers it free —
 * analyzes each customer's purchase history + loyalty engagement +
 * visit frequency to compute historical CLV + predict future CLV.
 *
 * Architecture:
 *   1. collectCustomerData — fetch orders per customer in lookback period
 *   2. computeRFM — Recency/Frequency/Monetary scores (1-5 each)
 *   3. determineSegment — RFM-based segmentation (champion/loyal/at_risk/etc.)
 *   4. computeCLV — historical (sum of orders) + predictive (avg_monthly × remaining_months)
 *   5. computeChurnRisk — based on recency + frequency trend
 *   6. enhanceWithAI — OpenAI generates per-customer insight + recommendation
 *
 * RFM Scoring (quintile-based):
 *   - Recency: 5 = ordered this week, 1 = ordered > 90 days ago
 *   - Frequency: 5 = top 20% by order count, 1 = bottom 20%
 *   - Monetary: 5 = top 20% by spend, 1 = bottom 20%
 *
 * Segments:
 *   CHAMPIONS (R≥4, F≥4) — best customers, recently active + frequent
 *   LOYAL (F≥4) — frequent buyers
 *   POTENTIAL (R≥4, F=2-3) — recent but infrequent
 *   NEW (R=5, F=1) — first-time recent
 *   AT_RISK (R=2-3, F≥4) — were loyal, slipping
 *   CANT_LOSE (R=1, F=5) — top customers who haven't visited recently
 *   HIBERNATING (R=1, F≤2) — inactive + infrequent
 *
 * CLV calculation:
 *   - Historical CLV: sum of all order totals
 *   - avg_monthly_value = total_spend / customer_age_months
 *   - predictive_clv = avg_monthly_value × predicted_remaining_months
 *   - predicted_remaining_months based on churn_risk (higher risk = fewer months)
 *   - total_clv = historical + predictive
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CustomerSegment = 'champion' | 'loyal' | 'potential' | 'new' | 'at_risk' | 'cant_lose' | 'hibernating';
export type CLVRecommendation = 'vip_treatment' | 'retention' | 'reactivate' | 'upsell' | 'monitor';

export interface CustomerCLV {
  id?: string;
  customer_id: string;
  customer_name: string;
  email?: string;
  phone?: string;
  tags?: string[];
  recency_score: number;       // 1-5
  frequency_score: number;     // 1-5
  monetary_score: number;      // 1-5
  rfm_score: string;           // e.g. "555"
  days_since_last_order: number;
  total_orders: number;
  total_spend: number;
  avg_order_value: number;
  first_order_date: Date;
  last_order_date: Date;
  customer_age_months: number;
  avg_monthly_value: number;
  historical_clv: number;
  predictive_clv: number;
  total_clv: number;
  churn_risk: number;          // 0-1
  predicted_remaining_months: number;
  segment: CustomerSegment;
  loyalty_tier?: string;
  loyalty_points?: number;
  is_loyalty_member: boolean;
  ai_insight?: string;
  ai_recommendation?: CLVRecommendation;
  generated_at: Date;
  expires_at?: Date;
}

export interface CLVConfig {
  lookbackDays: number;
  aiEnabled: boolean;
  minOrders: number;
  churnThresholdDays: number;
  predictionMonths: number;
}

export const DEFAULT_CLV_CONFIG: CLVConfig = {
  lookbackDays: 365,
  aiEnabled: true,
  minOrders: 2,
  churnThresholdDays: 90,
  predictionMonths: 12,
};

export const readCLVConfig = (settings: any): CLVConfig => ({
  lookbackDays: safeNumber(settings?.clv_lookback_days, 365),
  aiEnabled: settings?.clv_ai_enabled ?? true,
  minOrders: safeNumber(settings?.clv_min_orders, 2),
  churnThresholdDays: safeNumber(settings?.clv_churn_threshold_days, 90),
  predictionMonths: safeNumber(settings?.clv_prediction_months, 12),
});

// ---------------------------------------------------------------------------
// Data collection — per-customer order history
// ---------------------------------------------------------------------------

interface CustomerData {
  customer_id: string;
  customer_name: string;
  email?: string;
  phone?: string;
  tags?: string[];
  loyalty_points?: number;
  orders: Array<{ id: string; total: number; created_at: Date }>;
  total_spend: number;
  total_orders: number;
  first_order: Date;
  last_order: Date;
}

const collectCustomerData = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<Map<string, CustomerData>> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const byCustomer = new Map<string, CustomerData>();

  try {
    const result = await db.query(
      `SELECT
         id,
         customer.id AS customer_id,
         customer.name AS customer_name,
         customer.email AS email,
         customer.phone AS phone,
         customer.tags AS tags,
         customer.points AS loyalty_points,
         total,
         created_at
       FROM order
       WHERE created_at > $cutoff
         AND status = 'Paid'
         AND deleted_at IS NONE
         AND customer != NONE
       FETCH customer`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const order of rows) {
      const customerId = order.customer_id?.toString?.() ?? '';
      if (!customerId) continue;
      if (!byCustomer.has(customerId)) {
        byCustomer.set(customerId, {
          customer_id: customerId,
          customer_name: order.customer_name ?? 'Unknown',
          email: order.email,
          phone: order.phone?.toString?.(),
          tags: order.tags,
          orders: [],
          total_spend: 0,
          total_orders: 0,
          first_order: new Date(order.created_at),
          last_order: new Date(order.created_at),
        });
      }
      const data = byCustomer.get(customerId)!;
      const orderDate = new Date(order.created_at);
      const total = safeNumber(order.total, 0);
      data.orders.push({ id: order.id?.toString?.() ?? '', total, created_at: orderDate });
      data.total_spend += total;
      data.total_orders++;
      if (orderDate < data.first_order) data.first_order = orderDate;
      if (orderDate > data.last_order) data.last_order = orderDate;
      // Track loyalty info from first order that has it
      if (order.loyalty_points !== undefined && data.loyalty_points === undefined) {
        data.loyalty_points = order.loyalty_points;
      }
    }
  } catch (err) {
    console.error('[clv] collectCustomerData failed', err);
  }

  return byCustomer;
};

// ---------------------------------------------------------------------------
// RFM scoring — quintile-based (1-5)
// ---------------------------------------------------------------------------

const computeQuintileScore = (value: number, thresholds: number[]): number => {
  // thresholds: [p20, p40, p60, p80] (ascending)
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) return i + 1;
  }
  return 5;
};

const computeRFM = (
  customers: CustomerData[],
  _churnThresholdDays: number
): Array<{ data: CustomerData; r: number; f: number; m: number }> => {
  const now = Date.now();
  const results: Array<{ data: CustomerData; r: number; f: number; m: number }> = [];

  // Compute recency (days since last order) for all
  const recencies = customers.map(c => Math.floor((now - c.last_order.getTime()) / (24 * 60 * 60 * 1000)));
  const frequencies = customers.map(c => c.total_orders);
  const monetaries = customers.map(c => c.total_spend);

  // Compute quintile thresholds (sort + pick 20/40/60/80th percentile)
  const sortedRecencies = [...recencies].sort((a, b) => a - b);
  const sortedFrequencies = [...frequencies].sort((a, b) => a - b);
  const sortedMonetaries = [...monetaries].sort((a, b) => a - b);

  const percentile = (sorted: number[], p: number): number => {
    const idx = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
  };

  // For recency: LOWER is better, so we invert (5 = most recent = lowest days)
  const recencyThresholds = [
    percentile(sortedRecencies, 20),  // p20 — top 20% most recent → score 1 (we'll invert)
    percentile(sortedRecencies, 40),
    percentile(sortedRecencies, 60),
    percentile(sortedRecencies, 80),
  ];

  const freqThresholds = [
    percentile(sortedFrequencies, 20),
    percentile(sortedFrequencies, 40),
    percentile(sortedFrequencies, 60),
    percentile(sortedFrequencies, 80),
  ];

  const monThresholds = [
    percentile(sortedMonetaries, 20),
    percentile(sortedMonetaries, 40),
    percentile(sortedMonetaries, 60),
    percentile(sortedMonetaries, 80),
  ];

  for (let i = 0; i < customers.length; i++) {
    const data = customers[i];
    const recencyDays = recencies[i];
    // Recency: invert — fewer days = higher score
    let rScore = 1;
    // Most recent 20% → 5, next 20% → 4, etc.
    if (recencyDays <= recencyThresholds[0]) rScore = 5;
    else if (recencyDays <= recencyThresholds[1]) rScore = 4;
    else if (recencyDays <= recencyThresholds[2]) rScore = 3;
    else if (recencyDays <= recencyThresholds[3]) rScore = 2;
    else rScore = 1;

    const fScore = computeQuintileScore(frequencies[i], freqThresholds);
    const mScore = computeQuintileScore(monetaries[i], monThresholds);

    results.push({ data, r: rScore, f: fScore, m: mScore });
  }

  return results;
};

// ---------------------------------------------------------------------------
// Segment determination — RFM-based
// ---------------------------------------------------------------------------

const determineSegment = (r: number, f: number, _m: number): CustomerSegment => {
  if (r >= 4 && f >= 4) return 'champion';
  if (f >= 4) return 'loyal';
  if (r >= 4 && f >= 2 && f <= 3) return 'potential';
  if (r === 5 && f === 1) return 'new';
  if (r >= 2 && r <= 3 && f >= 4) return 'at_risk';
  if (r === 1 && f === 5) return 'cant_lose';
  if (r === 1 && f <= 2) return 'hibernating';
  // Default fallback
  if (r >= 3) return 'potential';
  return 'hibernating';
};

// ---------------------------------------------------------------------------
// CLV + churn computation
// ---------------------------------------------------------------------------

const computeCLV = (
  data: CustomerData,
  r: number,
  f: number,
  config: CLVConfig
): { historical_clv: number; predictive_clv: number; total_clv: number; churn_risk: number; predicted_remaining_months: number; avg_monthly_value: number } => {
  const historicalCLV = data.total_spend;

  // Customer age in months
  const ageMs = Date.now() - data.first_order.getTime();
  const ageMonths = Math.max(1, Math.floor(ageMs / (30 * 24 * 60 * 60 * 1000)));
  const avgMonthlyValue = data.total_spend / ageMonths;

  // Churn risk: based on recency score (R=1 → high risk, R=5 → low risk)
  // Also factor in frequency trend (declining frequency = higher risk)
  let churnRisk = 0;
  if (r === 1) churnRisk = 0.8;
  else if (r === 2) churnRisk = 0.6;
  else if (r === 3) churnRisk = 0.4;
  else if (r === 4) churnRisk = 0.2;
  else churnRisk = 0.1;

  // Adjust by frequency: low frequency = higher churn risk
  if (f <= 2) churnRisk = Math.min(0.95, churnRisk + 0.15);

  // Predicted remaining months: if churn risk is high, fewer months
  // Base = predictionMonths (12), reduced by churn risk
  const predictedMonths = Math.max(1, Math.round(config.predictionMonths * (1 - churnRisk)));

  // Predictive CLV: avg_monthly × remaining_months
  const predictiveCLV = avgMonthlyValue * predictedMonths;

  // Total CLV
  const totalCLV = historicalCLV + predictiveCLV;

  return {
    historical_clv: Math.round(historicalCLV * 100) / 100,
    predictive_clv: Math.round(predictiveCLV * 100) / 100,
    total_clv: Math.round(totalCLV * 100) / 100,
    churn_risk: Math.round(churnRisk * 100) / 100,
    predicted_remaining_months: predictedMonths,
    avg_monthly_value: Math.round(avgMonthlyValue * 100) / 100,
  };
};

// ---------------------------------------------------------------------------
// AI enhancement — per-customer insight + recommendation
// ---------------------------------------------------------------------------

const determineRecommendation = (segment: CustomerSegment, churnRisk: number, totalCLV: number): CLVRecommendation => {
  if (segment === 'champion' && totalCLV > 1000) return 'vip_treatment';
  if (segment === 'cant_lose' || (segment === 'at_risk' && churnRisk > 0.5)) return 'reactivate';
  if (segment === 'at_risk') return 'retention';
  if (segment === 'potential' || segment === 'new') return 'upsell';
  return 'monitor';
};

const enhanceWithAI = async (
  clvList: CustomerCLV[],
  _config: CLVConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[clv] OpenAI not available — using rule-based recommendations');
    for (const c of clvList) {
      c.ai_recommendation = determineRecommendation(c.segment, c.churn_risk, c.total_clv);
    }
    return;
  }

  // Only enhance top 30 customers by CLV (to keep prompt manageable)
  const topCustomers = clvList.slice(0, 30);

  const prompt = `You are a restaurant customer relationship management expert.
Analyze these customer CLV profiles and provide insights + recommendations.

Top customers (JSON):
${JSON.stringify(topCustomers.map(c => ({
  name: c.customer_name,
  segment: c.segment,
  rfm: c.rfm_score,
  total_clv: c.total_clv,
  historical: c.historical_clv,
  predictive: c.predictive_clv,
  churn_risk: c.churn_risk,
  avg_order: c.avg_order_value,
  total_orders: c.total_orders,
  days_since_last: c.days_since_last_order,
  loyalty_tier: c.loyalty_tier,
})), null, 2)}

Respond with JSON array (only for customers needing attention):
[{
  "name": "<match customer name>",
  "insight": "<max 300 chars — what's notable about this customer>",
  "recommendation": "vip_treatment" | "retention" | "reactivate" | "upsell" | "monitor"
}]

Focus on actionable insights — who to treat specially, who's at risk, who to reactivate.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant CRM AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 2000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // Fallback to rule-based
      for (const c of clvList) {
        c.ai_recommendation = determineRecommendation(c.segment, c.churn_risk, c.total_clv);
      }
      return;
    }
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      insight?: string;
      recommendation?: CLVRecommendation;
    }>;

    for (const item of parsed) {
      const clv = clvList.find(c => c.customer_name === item.name);
      if (!clv) continue;
      if (item.insight) clv.ai_insight = item.insight.slice(0, 300);
      if (item.recommendation && ['vip_treatment', 'retention', 'reactivate', 'upsell', 'monitor'].includes(item.recommendation)) {
        clv.ai_recommendation = item.recommendation;
      }
    }

    // Fill in rule-based for customers not covered by AI
    for (const c of clvList) {
      if (!c.ai_recommendation) {
        c.ai_recommendation = determineRecommendation(c.segment, c.churn_risk, c.total_clv);
      }
    }
  } catch (err) {
    console.warn('[clv] AI enhancement failed', err);
    for (const c of clvList) {
      c.ai_recommendation = determineRecommendation(c.segment, c.churn_risk, c.total_clv);
    }
  }
};

// ---------------------------------------------------------------------------
// Main entry — compute CLV for all customers
// ---------------------------------------------------------------------------

export interface ComputeCLVResult {
  totalCustomers: number;
  evaluated: number;
  clvList: CustomerCLV[];
  segmentCounts: Record<CustomerSegment, number>;
  totalHistoricalCLV: number;
  totalPredictiveCLV: number;
  avgCLV: number;
}

export const computeAllCLV = async (
  db: ReturnType<typeof useDB>,
  config: CLVConfig = DEFAULT_CLV_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<ComputeCLVResult> => {
  if (onProgress) onProgress(0, 4);

  // 1. Collect customer data
  const customerData = await collectCustomerData(db, config.lookbackDays);
  if (onProgress) onProgress(1, 4);

  // Filter by min orders
  const filtered = Array.from(customerData.values()).filter(c => c.total_orders >= config.minOrders);
  if (filtered.length === 0) {
    return {
      totalCustomers: customerData.size,
      evaluated: 0,
      clvList: [],
      segmentCounts: {} as Record<CustomerSegment, number>,
      totalHistoricalCLV: 0,
      totalPredictiveCLV: 0,
      avgCLV: 0,
    };
  }

  // 2. Compute RFM scores
  const rfmResults = computeRFM(filtered, config.churnThresholdDays);
  if (onProgress) onProgress(2, 4);

  // 3. Build CLV objects
  const now = Date.now();
  const clvList: CustomerCLV[] = rfmResults.map(({ data, r, f, m }) => {
    const daysSinceLast = Math.floor((now - data.last_order.getTime()) / (24 * 60 * 60 * 1000));
    const ageMonths = Math.max(1, Math.floor((now - data.first_order.getTime()) / (30 * 24 * 60 * 60 * 1000)));
    const segment = determineSegment(r, f, m);
    const clv = computeCLV(data, r, f, config);
    const loyaltyPoints = data.loyalty_points;
    const isLoyaltyMember = loyaltyPoints !== undefined && loyaltyPoints > 0;
    const loyaltyTier = loyaltyPoints ? determineLoyaltyTier(loyaltyPoints) : undefined;

    return {
      customer_id: data.customer_id,
      customer_name: data.customer_name,
      email: data.email,
      phone: data.phone,
      tags: data.tags,
      recency_score: r,
      frequency_score: f,
      monetary_score: m,
      rfm_score: `${r}${f}${m}`,
      days_since_last_order: daysSinceLast,
      total_orders: data.total_orders,
      total_spend: Math.round(data.total_spend * 100) / 100,
      avg_order_value: Math.round((data.total_spend / data.total_orders) * 100) / 100,
      first_order_date: data.first_order,
      last_order_date: data.last_order,
      customer_age_months: ageMonths,
      avg_monthly_value: clv.avg_monthly_value,
      historical_clv: clv.historical_clv,
      predictive_clv: clv.predictive_clv,
      total_clv: clv.total_clv,
      churn_risk: clv.churn_risk,
      predicted_remaining_months: clv.predicted_remaining_months,
      segment,
      loyalty_tier: loyaltyTier,
      loyalty_points: loyaltyPoints,
      is_loyalty_member: isLoyaltyMember,
      generated_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  });

  // Sort by total CLV descending
  clvList.sort((a, b) => b.total_clv - a.total_clv);
  if (onProgress) onProgress(3, 4);

  // 4. AI enhancement
  if (config.aiEnabled && clvList.length > 0) {
    await enhanceWithAI(clvList, config);
  } else {
    for (const c of clvList) {
      c.ai_recommendation = determineRecommendation(c.segment, c.churn_risk, c.total_clv);
    }
  }

  // 5. Persist (expire old first)
  try {
    await db.query(`UPDATE customer_clv SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const clv of clvList) {
      try {
        const result = await db.query(
          `CREATE customer_clv CONTENT $data`,
          {
            data: {
              ...clv,
              customer: clv.customer_id,
              first_order_date: clv.first_order_date.toISOString(),
              last_order_date: clv.last_order_date.toISOString(),
              generated_at: clv.generated_at.toISOString(),
              expires_at: clv.expires_at?.toISOString(),
            },
          }
        );
        clv.id = (result as any)?.id?.toString?.() ?? '';
      } catch (err) {
        console.warn('[clv] persist failed', err);
      }
    }
  } catch (err) {
    console.warn('[clv] persist batch failed', err);
  }
  if (onProgress) onProgress(4, 4);

  // Summary
  const segmentCounts = clvList.reduce((acc, c) => {
    acc[c.segment] = (acc[c.segment] ?? 0) + 1;
    return acc;
  }, {} as Record<CustomerSegment, number>);
  const totalHistorical = clvList.reduce((s, c) => s + c.historical_clv, 0);
  const totalPredictive = clvList.reduce((s, c) => s + c.predictive_clv, 0);
  const avgCLV = clvList.length > 0 ? (totalHistorical + totalPredictive) / clvList.length : 0;

  return {
    totalCustomers: customerData.size,
    evaluated: clvList.length,
    clvList,
    segmentCounts,
    totalHistoricalCLV: Math.round(totalHistorical * 100) / 100,
    totalPredictiveCLV: Math.round(totalPredictive * 100) / 100,
    avgCLV: Math.round(avgCLV * 100) / 100,
  };
};

const determineLoyaltyTier = (points: number): string => {
  if (points >= 5000) return 'platinum';
  if (points >= 2000) return 'gold';
  if (points >= 500) return 'silver';
  return 'bronze';
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getCLVList = async (
  db: ReturnType<typeof useDB>,
  limit = 100
): Promise<CustomerCLV[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM customer_clv
       WHERE expires_at > time::now()
       ORDER BY total_clv DESC
       LIMIT $limit`,
      { limit }
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[clv] getCLVList failed', err);
    return [];
  }
};

export const getCLVBySegment = async (
  db: ReturnType<typeof useDB>,
  segment: CustomerSegment
): Promise<CustomerCLV[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM customer_clv
       WHERE segment = $segment AND expires_at > time::now()
       ORDER BY total_clv DESC`,
      { segment }
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[clv] getCLVBySegment failed', err);
    return [];
  }
};
