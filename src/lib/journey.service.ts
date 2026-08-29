/**
 * AI Customer Journey Analytics service — end-to-end lifecycle tracking.
 *
 * Research finding: Toast Customer Journey $35+/mo (higher tier), Square
 * doesn't have an equivalent. POSR offers it free — combines data from
 * reservations + orders + loyalty + sentiment to map each customer's journey.
 *
 * Journey stages:
 *   1. AWARENESS      — first reservation/walk-in (never ordered)
 *   2. FIRST_PURCHASE  — first Paid order
 *   3. REPEAT         — 2-5 orders within 90 days
 *   4. LOYAL          — 6+ orders OR loyalty member with active points
 *   5. ADVOCATE       — positive review (4-5 stars) + 10+ orders
 *   6. AT_RISK        — was loyal but declining frequency (30%+ drop)
 *   7. CHURNED        — no orders in 90+ days
 *
 * Funnel metrics:
 *   - Awareness → First Purchase conversion
 *   - First → Repeat conversion
 *   - Repeat → Loyal conversion
 *   - Loyal → Advocate conversion
 *   - Overall journey completion rate
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type JourneyStage = 'awareness' | 'first_purchase' | 'repeat' | 'loyal' | 'advocate' | 'at_risk' | 'churned';
export type NextBestAction = 'welcome_offer' | 'loyalty_invite' | 'review_request' | 'winback' | 'vip_treatment' | 'monitor';

export interface CustomerJourney {
  id?: string;
  customer_id: string;
  customer_name: string;
  email?: string;
  current_stage: JourneyStage;
  stage_entered_at: Date;
  first_visit_date?: Date;
  first_order_date?: Date;
  total_orders: number;
  total_revenue: number;
  avg_days_between_visits?: number;
  is_loyalty_member: boolean;
  loyalty_tier?: string;
  has_reviewed: boolean;
  avg_rating?: number;
  days_since_last_order: number;
  journey_duration_days: number;
  touchpoints?: Array<{ type: string; date: string; description: string }>;
  ai_insight?: string;
  ai_next_best_action?: NextBestAction;
  generated_at: Date;
}

export interface JourneyConfig {
  aiEnabled: boolean;
  loyalThreshold: number;
  advocateOrderThreshold: number;
  churnDays: number;
  atRiskDeclinePct: number;
}

export const DEFAULT_JOURNEY_CONFIG: JourneyConfig = {
  aiEnabled: true,
  loyalThreshold: 6,
  advocateOrderThreshold: 10,
  churnDays: 90,
  atRiskDeclinePct: 30,
};

export const readJourneyConfig = (settings: any): JourneyConfig => ({
  aiEnabled: settings?.journey_ai_enabled ?? true,
  loyalThreshold: safeNumber(settings?.journey_loyal_threshold, 6),
  advocateOrderThreshold: safeNumber(settings?.journey_advocate_order_threshold, 10),
  churnDays: safeNumber(settings?.journey_churn_days, 90),
  atRiskDeclinePct: safeNumber(settings?.journey_at_risk_decline_pct, 30),
});

// ---------------------------------------------------------------------------
// Data collection — fetch customer orders + loyalty + reviews
// ---------------------------------------------------------------------------

interface CustomerData {
  customer_id: string;
  customer_name: string;
  email?: string;
  orders: Array<{ id: string; total: number; created_at: Date }>;
  total_revenue: number;
  total_orders: number;
  first_order: Date | null;
  last_order: Date | null;
  loyalty_points?: number;
  loyalty_tier?: string;
  has_reviewed: boolean;
  avg_rating?: number;
}

const collectCustomerData = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<Map<string, CustomerData>> => {
  const byCustomer = new Map<string, CustomerData>();
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch orders
  try {
    const result = await db.query(
      `SELECT id, total, created_at,
         customer.id AS customer_id,
         customer.name AS customer_name,
         customer.email AS email,
         customer.points AS loyalty_points
       FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE AND customer != NONE
       ORDER BY created_at ASC
       FETCH customer`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const order of rows) {
      const cid = order.customer_id?.toString?.() ?? '';
      if (!cid) continue;
      if (!byCustomer.has(cid)) {
        byCustomer.set(cid, {
          customer_id: cid,
          customer_name: order.customer_name ?? 'Unknown',
          email: order.email,
          orders: [],
          total_revenue: 0,
          total_orders: 0,
          first_order: null,
          last_order: null,
          loyalty_points: order.loyalty_points,
          has_reviewed: false,
        });
      }
      const data = byCustomer.get(cid)!;
      const total = safeNumber(order.total, 0);
      const date = new Date(order.created_at);
      data.orders.push({ id: order.id?.toString?.() ?? '', total, created_at: date });
      data.total_revenue += total;
      data.total_orders++;
      if (!data.first_order || date < data.first_order) data.first_order = date;
      if (!data.last_order || date > data.last_order) data.last_order = date;
      if (order.loyalty_points !== undefined) data.loyalty_points = order.loyalty_points;
    }
  } catch (err) {
    console.error('[journey] collect orders failed', err);
  }

  // Fetch reviews
  try {
    const reviewResult = await db.query(
      `SELECT customer.id AS customer_id, rating FROM customer_review WHERE rating >= 4 FETCH customer`
    );
    const reviews = Array.isArray(reviewResult) ? reviewResult.flat() : [];
    for (const r of reviews) {
      const cid = r.customer_id?.toString?.() ?? '';
      if (byCustomer.has(cid)) {
        const data = byCustomer.get(cid)!;
        data.has_reviewed = true;
        data.avg_rating = safeNumber(r.rating, 0);
      }
    }
  } catch {
    // Non-fatal
  }

  // Assign loyalty tier
  for (const data of byCustomer.values()) {
    const points = safeNumber(data.loyalty_points, 0);
    if (points >= 5000) data.loyalty_tier = 'platinum';
    else if (points >= 2000) data.loyalty_tier = 'gold';
    else if (points >= 500) data.loyalty_tier = 'silver';
    else if (points > 0) data.loyalty_tier = 'bronze';
  }

  return byCustomer;
};

// ---------------------------------------------------------------------------
// Stage determination
// ---------------------------------------------------------------------------

const determineStage = (
  data: CustomerData,
  config: JourneyConfig
): { stage: JourneyStage; stageEnteredAt: Date } => {
  const now = new Date();
  const daysSinceLast = data.last_order ? Math.floor((now.getTime() - data.last_order.getTime()) / (24 * 60 * 60 * 1000)) : 999;

  // Churned: no orders in 90+ days (and had at least 1 order before)
  if (daysSinceLast >= config.churnDays && data.total_orders > 0) {
    return { stage: 'churned', stageEnteredAt: new Date(data.last_order!.getTime() + config.churnDays * 24 * 60 * 60 * 1000) };
  }

  // Advocate: 10+ orders + positive review
  if (data.total_orders >= config.advocateOrderThreshold && data.has_reviewed) {
    return { stage: 'advocate', stageEnteredAt: data.last_order ?? now };
  }

  // At Risk: was loyal (6+ orders) but frequency declining
  if (data.total_orders >= config.loyalThreshold && data.orders.length >= 3) {
    const recentOrders = data.orders.slice(-3);
    const recentGaps: number[] = [];
    for (let i = 1; i < recentOrders.length; i++) {
      const gap = (recentOrders[i].created_at.getTime() - recentOrders[i - 1].created_at.getTime()) / (24 * 60 * 60 * 1000);
      recentGaps.push(gap);
    }
    if (recentGaps.length >= 2) {
      const avgRecentGap = recentGaps.reduce((s, g) => s + g, 0) / recentGaps.length;
      const earlierOrders = data.orders.slice(0, -3);
      if (earlierOrders.length >= 2) {
        const earlierGaps: number[] = [];
        for (let i = 1; i < earlierOrders.length; i++) {
          const gap = (earlierOrders[i].created_at.getTime() - earlierOrders[i - 1].created_at.getTime()) / (24 * 60 * 60 * 1000);
          earlierGaps.push(gap);
        }
        if (earlierGaps.length > 0) {
          const avgEarlierGap = earlierGaps.reduce((s, g) => s + g, 0) / earlierGaps.length;
          if (avgEarlierGap > 0 && avgRecentGap > avgEarlierGap * (1 + config.atRiskDeclinePct / 100)) {
            return { stage: 'at_risk', stageEnteredAt: data.last_order ?? now };
          }
        }
      }
    }
  }

  // Loyal: 6+ orders OR loyalty member with points
  if (data.total_orders >= config.loyalThreshold || (data.loyalty_points !== undefined && data.loyalty_points > 0)) {
    return { stage: 'loyal', stageEnteredAt: data.last_order ?? now };
  }

  // Repeat: 2-5 orders
  if (data.total_orders >= 2) {
    return { stage: 'repeat', stageEnteredAt: data.last_order ?? now };
  }

  // First Purchase: exactly 1 order
  if (data.total_orders === 1) {
    return { stage: 'first_purchase', stageEnteredAt: data.first_order ?? now };
  }

  // Awareness: 0 orders (reservation but never purchased)
  return { stage: 'awareness', stageEnteredAt: now };
};

const determineNextAction = (stage: JourneyStage): NextBestAction => {
  switch (stage) {
    case 'awareness': return 'welcome_offer';
    case 'first_purchase': return 'loyalty_invite';
    case 'repeat': return 'review_request';
    case 'loyal': return 'vip_treatment';
    case 'advocate': return 'monitor';
    case 'at_risk': return 'winback';
    case 'churned': return 'winback';
    default: return 'monitor';
  }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export interface AnalyzeJourneyResult {
  journeys: CustomerJourney[];
  funnel: Record<JourneyStage, number>;
  conversionRates: {
    awareness_to_first: number;
    first_to_repeat: number;
    repeat_to_loyal: number;
    loyal_to_advocate: number;
    overall_completion: number;
  };
}

export const analyzeCustomerJourneys = async (
  db: ReturnType<typeof useDB>,
  config: JourneyConfig = DEFAULT_JOURNEY_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<AnalyzeJourneyResult> => {
  if (onProgress) onProgress(0, 3);

  const byCustomer = await collectCustomerData(db, 365); // always look back 1 year for journey
  if (onProgress) onProgress(1, 3);

  const journeys: CustomerJourney[] = [];
  const funnel: Record<JourneyStage, number> = {
    awareness: 0, first_purchase: 0, repeat: 0, loyal: 0, advocate: 0, at_risk: 0, churned: 0,
  };

  for (const data of byCustomer.values()) {
    const { stage, stageEnteredAt } = determineStage(data, config);
    funnel[stage]++;

    const now = new Date();
    const daysSinceLast = data.last_order ? Math.floor((now.getTime() - data.last_order.getTime()) / (24 * 60 * 60 * 1000)) : 0;

    // Avg days between visits
    let avgDaysBetween: number | undefined;
    if (data.orders.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < data.orders.length; i++) {
        gaps.push((data.orders[i].created_at.getTime() - data.orders[i - 1].created_at.getTime()) / (24 * 60 * 60 * 1000));
      }
      avgDaysBetween = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length * 10) / 10;
    }

    const journeyDuration = data.first_order ? Math.floor((now.getTime() - data.first_order.getTime()) / (24 * 60 * 60 * 1000)) : 0;

    // Touchpoints
    const touchpoints: Array<{ type: string; date: string; description: string }> = [];
    if (data.first_order) touchpoints.push({ type: 'first_order', date: data.first_order.toISOString(), description: 'First purchase' });
    if (data.total_orders >= config.loyalThreshold) touchpoints.push({ type: 'loyalty', date: '', description: `Reached ${config.loyalThreshold}+ orders — loyal status` });
    if (data.has_reviewed) touchpoints.push({ type: 'review', date: '', description: `Left a ${data.avg_rating ?? 5}-star review` });
    if (data.loyalty_points && data.loyalty_points > 0) touchpoints.push({ type: 'loyalty_join', date: '', description: `Joined loyalty program (${data.loyalty_tier ?? 'member'})` });

    journeys.push({
      customer_id: data.customer_id,
      customer_name: data.customer_name,
      email: data.email,
      current_stage: stage,
      stage_entered_at: stageEnteredAt,
      first_visit_date: data.first_order,
      first_order_date: data.first_order,
      total_orders: data.total_orders,
      total_revenue: Math.round(data.total_revenue * 100) / 100,
      avg_days_between_visits: avgDaysBetween,
      is_loyalty_member: (data.loyalty_points ?? 0) > 0,
      loyalty_tier: data.loyalty_tier,
      has_reviewed: data.has_reviewed,
      avg_rating: data.avg_rating,
      days_since_last_order: daysSinceLast,
      journey_duration_days: journeyDuration,
      touchpoints: touchpoints.length > 0 ? touchpoints : undefined,
      ai_next_best_action: determineNextAction(stage),
      generated_at: now,
    });
  }

  // Sort by total revenue (most valuable first)
  journeys.sort((a, b) => b.total_revenue - a.total_revenue);
  if (onProgress) onProgress(2, 3);

  // AI enhancement (top 20)
  if (config.aiEnabled && journeys.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const top = journeys.slice(0, 20);
      const prompt = `You are a restaurant customer journey analyst.
Analyze these customer journeys and provide per-customer insights.

Customers (JSON):
${JSON.stringify(top.map(j => ({
  name: j.customer_name,
  stage: j.current_stage,
  orders: j.total_orders,
  revenue: j.total_revenue,
  avg_days_between: j.avg_days_between_visits,
  loyalty: j.loyalty_tier ?? 'none',
  reviewed: j.has_reviewed,
  rating: j.avg_rating,
  days_since_last: j.days_since_last_order,
  next_action: j.ai_next_best_action,
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match name>",
  "insight": "<max 200 chars — what's notable about their journey + next step>"
}]`;

      try {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a restaurant customer journey AI. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ], { temperature: 0.3, maxTokens: 1200 });

        const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Array<{ name: string; insight?: string }>;
          for (const item of parsed) {
            const j = journeys.find(x => x.customer_name === item.name);
            if (j && item.insight) j.ai_insight = item.insight.slice(0, 200);
          }
        }
      } catch (err) {
        console.warn('[journey] AI failed', err);
      }
    }
  }
  if (onProgress) onProgress(3, 3);

  // Compute conversion rates
  const total = journeys.length;
  const conversionRates = {
    awareness_to_first: total > 0 ? ((funnel.first_purchase + funnel.repeat + funnel.loyal + funnel.advocate + funnel.at_risk + funnel.churned) / total) * 100 : 0,
    first_to_repeat: total > 0 ? ((funnel.repeat + funnel.loyal + funnel.advocate + funnel.at_risk + funnel.churned) / total) * 100 : 0,
    repeat_to_loyal: total > 0 ? ((funnel.loyal + funnel.advocate + funnel.at_risk + funnel.churned) / total) * 100 : 0,
    loyal_to_advocate: total > 0 ? ((funnel.advocate) / total) * 100 : 0,
    overall_completion: total > 0 ? (funnel.advocate / total) * 100 : 0,
  };

  // Persist
  try {
    await db.query(`UPDATE customer_journey SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const j of journeys.slice(0, 200)) { // persist top 200
      try {
        await db.query(`CREATE customer_journey CONTENT $data`, {
          data: {
            ...j,
            stage_entered_at: j.stage_entered_at.toISOString(),
            first_visit_date: j.first_visit_date?.toISOString(),
            first_order_date: j.first_order_date?.toISOString(),
            generated_at: j.generated_at.toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });
      } catch { /* non-fatal */ }
    }
  } catch (err) {
    console.warn('[journey] persist failed', err);
  }

  return { journeys, funnel, conversionRates };
};

export const getCustomerJourneys = async (
  db: ReturnType<typeof useDB>
): Promise<CustomerJourney[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM customer_journey WHERE expires_at > time::now()
       ORDER BY total_revenue DESC LIMIT 200`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[journey] getCustomerJourneys failed', err);
    return [];
  }
};
