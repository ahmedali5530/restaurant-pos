/**
 * AI Delivery Performance Analytics service — per-platform metrics + AI recs.
 *
 * Research finding: Toast Delivery Analytics $30+/mo (higher tier), Square
 * Delivery Reporting in Plus. POSR offers it free — analyzes DoorDash/
 * UberEats/Grubhub performance + AI recommendations.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type DeliveryGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type DeliveryRecommendation = 'promote' | 'maintain' | 'renegotiate' | 'pause' | 'expand';

export interface DeliveryPerformance {
  id?: string;
  platform: string;
  period_start: Date;
  period_end: Date;
  total_orders: number;
  total_revenue: number;
  avg_order_value: number;
  accepted_orders: number;
  acceptance_rate: number;
  cancelled_orders: number;
  cancellation_rate: number;
  avg_fulfillment_minutes: number;
  avg_prep_minutes: number;
  avg_delivery_minutes: number;
  revenue_share_pct: number;
  commission_paid: number;
  net_revenue: number;
  customer_rating?: number;
  grade: DeliveryGrade;
  ai_insight?: string;
  ai_recommendation?: DeliveryRecommendation;
  generated_at: Date;
}

export interface DeliveryConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  commissions: Record<string, number>;
}

export const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  commissions: { doordash: 20, ubereats: 25, grubhub: 20, internal: 0, other: 15 },
};

export const readDeliveryConfig = (settings: any): DeliveryConfig => ({
  aiEnabled: settings?.delivery_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.delivery_lookback_days, 30),
  commissions: {
    doordash: safeNumber(settings?.delivery_commission_doordash, 20),
    ubereats: safeNumber(settings?.delivery_commission_ubereats, 25),
    grubhub: safeNumber(settings?.delivery_commission_grubhub, 20),
    internal: 0,
    other: 15,
  },
});

const PLATFORM_LABELS: Record<string, string> = {
  doordash: 'DoorDash', ubereats: 'UberEats', grubhub: 'Grubhub', internal: 'Internal', other: 'Other',
};

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

const collectDeliveryData = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<Map<string, {
  orders: any[];
  totalRevenue: number;
  accepted: number;
  cancelled: number;
  prepTimes: number[];
  deliveryTimes: number[];
  fulfillmentTimes: number[];
}>> => {
  const byPlatform = new Map<string, {
    orders: any[];
    totalRevenue: number;
    accepted: number;
    cancelled: number;
    prepTimes: number[];
    deliveryTimes: number[];
    fulfillmentTimes: number[];
  }>();
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const result = await db.query(
      `SELECT
         id, total, status, created_at, completed_at,
         delivery, order_type.name AS order_type_name,
         tags
       FROM order
       WHERE created_at > $cutoff AND deleted_at IS NONE
         AND (delivery != NONE OR tags CONTAINS 'delivery' OR tags CONTAINS 'doordash'
              OR tags CONTAINS 'ubereats' OR tags CONTAINS 'grubhub')`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const order of rows) {
      // Determine platform from delivery field or tags
      let platform = 'other';
      if (order.delivery?.platform) {
        platform = String(order.delivery.platform).toLowerCase();
      } else if (Array.isArray(order.tags)) {
        for (const tag of order.tags) {
          const lower = String(tag).toLowerCase();
          if (['doordash', 'ubereats', 'grubhub'].includes(lower)) {
            platform = lower;
            break;
          }
        }
      }
      // Also check order_type_name
      if (platform === 'other' && order.order_type_name) {
        const lower = String(order.order_type_name).toLowerCase();
        if (lower.includes('doordash')) platform = 'doordash';
        else if (lower.includes('uber')) platform = 'ubereats';
        else if (lower.includes('grubhub')) platform = 'grubhub';
        else if (lower.includes('deliver')) platform = 'internal';
      }

      if (!byPlatform.has(platform)) {
        byPlatform.set(platform, {
          orders: [], totalRevenue: 0, accepted: 0, cancelled: 0,
          prepTimes: [], deliveryTimes: [], fulfillmentTimes: [],
        });
      }
      const data = byPlatform.get(platform)!;
      data.orders.push(order);
      const total = safeNumber(order.total, 0);

      if (order.status === 'Cancelled' || order.status === 'Refunded') {
        data.cancelled++;
      } else {
        data.accepted++;
        data.totalRevenue += total;

        // Fulfillment time (created → completed)
        if (order.created_at && order.completed_at) {
          const created = new Date(order.created_at);
          const completed = new Date(order.completed_at);
          const mins = (completed.getTime() - created.getTime()) / 60000;
          if (mins > 0 && mins < 180) {
            data.fulfillmentTimes.push(mins);
            // Rough split: 60% prep, 40% delivery
            data.prepTimes.push(mins * 0.6);
            data.deliveryTimes.push(mins * 0.4);
          }
        }
      }
    }
  } catch (err) {
    console.error('[delivery] collectDeliveryData failed', err);
  }

  return byPlatform;
};

const avg = (arr: number[]): number => arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;

const computeGrade = (acceptanceRate: number, cancellationRate: number): DeliveryGrade => {
  const score = acceptanceRate * 0.6 + (1 - cancellationRate) * 0.4;
  if (score >= 0.95) return 'A';
  if (score >= 0.85) return 'B';
  if (score >= 0.70) return 'C';
  if (score >= 0.50) return 'D';
  return 'F';
};

const determineRecommendation = (
  grade: DeliveryGrade,
  _acceptanceRate: number,
  cancellationRate: number,
  revenueShare: number,
  netMargin: number
): DeliveryRecommendation => {
  if (grade === 'A' && revenueShare < 30) return 'expand';
  if (grade === 'A') return 'promote';
  if (grade === 'B') return 'maintain';
  if (cancellationRate > 0.15) return 'pause';
  if (netMargin < 0) return 'renegotiate';
  return 'maintain';
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  performances: DeliveryPerformance[]
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[delivery] OpenAI not available — using rule-based');
    return;
  }

  const prompt = `You are a restaurant delivery channel optimization expert.
Analyze these delivery platform metrics and provide insights.

Platforms (JSON):
${JSON.stringify(performances.map(p => ({
  platform: p.platform,
  orders: p.total_orders,
  revenue: p.total_revenue,
  net_revenue: p.net_revenue,
  acceptance: (p.acceptance_rate * 100).toFixed(0) + '%',
  cancellation: (p.cancellation_rate * 100).toFixed(0) + '%',
  avg_fulfillment: p.avg_fulfillment_minutes.toFixed(0) + 'min',
  commission: p.commission_paid,
  revenue_share: p.revenue_share_pct + '%',
  grade: p.grade,
})), null, 2)}

Respond with JSON array:
[{
  "platform": "<match platform>",
  "insight": "<max 200 chars — what's notable + why>",
  "recommendation": "promote" | "maintain" | "renegotiate" | "pause" | "expand"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant delivery optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      platform: string;
      insight?: string;
      recommendation?: DeliveryRecommendation;
    }>;

    for (const item of parsed) {
      const perf = performances.find(p => p.platform === item.platform);
      if (!perf) continue;
      if (item.insight) perf.ai_insight = item.insight.slice(0, 200);
      if (item.recommendation && ['promote', 'maintain', 'renegotiate', 'pause', 'expand'].includes(item.recommendation)) {
        perf.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) {
    console.warn('[delivery] AI enhancement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const analyzeDeliveryPerformance = async (
  db: ReturnType<typeof useDB>,
  config: DeliveryConfig = DEFAULT_DELIVERY_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ performances: DeliveryPerformance[]; totalRevenue: number }> => {
  if (onProgress) onProgress(0, 3);

  const byPlatform = await collectDeliveryData(db, config.lookbackDays);
  if (onProgress) onProgress(1, 3);

  const totalRevenue = Array.from(byPlatform.values()).reduce((s, d) => s + d.totalRevenue, 0);
  const performances: DeliveryPerformance[] = [];

  for (const [platform, data] of byPlatform) {
    const totalOrders = data.orders.length;
    if (totalOrders === 0) continue;

    const accepted = data.accepted;
    const cancelled = data.cancelled;
    const acceptanceRate = totalOrders > 0 ? accepted / totalOrders : 0;
    const cancellationRate = totalOrders > 0 ? cancelled / totalOrders : 0;
    const avgOrderValue = accepted > 0 ? data.totalRevenue / accepted : 0;
    const revenueShare = totalRevenue > 0 ? (data.totalRevenue / totalRevenue) * 100 : 0;
    const commissionRate = config.commissions[platform] ?? 15;
    const commissionPaid = Math.round(data.totalRevenue * (commissionRate / 100) * 100) / 100;
    const netRevenue = Math.round((data.totalRevenue - commissionPaid) * 100) / 100;
    const grade = computeGrade(acceptanceRate, cancellationRate);
    const recommendation = determineRecommendation(grade, acceptanceRate, cancellationRate, revenueShare, netRevenue - data.totalRevenue * 0.3);

    performances.push({
      platform,
      period_start: new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000),
      period_end: new Date(),
      total_orders: totalOrders,
      total_revenue: Math.round(data.totalRevenue * 100) / 100,
      avg_order_value: Math.round(avgOrderValue * 100) / 100,
      accepted_orders: accepted,
      acceptance_rate: Math.round(acceptanceRate * 100) / 100,
      cancelled_orders: cancelled,
      cancellation_rate: Math.round(cancellationRate * 100) / 100,
      avg_fulfillment_minutes: Math.round(avg(data.fulfillmentTimes) * 10) / 10,
      avg_prep_minutes: Math.round(avg(data.prepTimes) * 10) / 10,
      avg_delivery_minutes: Math.round(avg(data.deliveryTimes) * 10) / 10,
      revenue_share_pct: Math.round(revenueShare * 10) / 10,
      commission_paid: commissionPaid,
      net_revenue: netRevenue,
      grade,
      ai_recommendation: recommendation,
      generated_at: new Date(),
    });
  }

  // Sort by revenue descending
  performances.sort((a, b) => b.total_revenue - a.total_revenue);
  if (onProgress) onProgress(2, 3);

  // AI enhancement
  if (config.aiEnabled && performances.length > 0) {
    await enhanceWithAI(performances);
  }
  if (onProgress) onProgress(3, 3);

  // Persist
  try {
    await db.query(`UPDATE delivery_performance SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const perf of performances) {
      try {
        await db.query(`CREATE delivery_performance CONTENT $data`, {
          data: {
            ...perf,
            period_start: perf.period_start.toISOString(),
            period_end: perf.period_end.toISOString(),
            generated_at: perf.generated_at.toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });
      } catch {
        // Non-fatal
      }
    }
  } catch (err) {
    console.warn('[delivery] persist failed', err);
  }

  return { performances, totalRevenue: Math.round(totalRevenue * 100) / 100 };
};

export const getDeliveryPerformance = async (
  db: ReturnType<typeof useDB>
): Promise<DeliveryPerformance[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM delivery_performance
       WHERE expires_at > time::now()
       ORDER BY total_revenue DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[delivery] getDeliveryPerformance failed', err);
    return [];
  }
};

export { PLATFORM_LABELS };
