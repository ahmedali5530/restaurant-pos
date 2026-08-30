/**
 * AI Customer Satisfaction Prediction service — predict satisfaction per order.
 *
 * 25th POSR-exclusive differentiator — restaurants discover unhappy customers
 * only AFTER they leave bad reviews. No POS system PREDICTS satisfaction from
 * order patterns BEFORE the review is written. Toast, Square, Lightspeed
 * analyze reviews reactively. POSR predicts satisfaction per order based on
 * ticket time, order modifications, wait time, party size, server load + AI.
 *
 * Distinct from:
 *   - sentiment.service (analyzes reviews AFTER they're written)
 *   - churn.service (predicts IF customer will leave, not why)
 *   - journey.service (maps lifecycle stages, doesn't predict satisfaction)
 *   - guest-preference.service (profiles preferences, not satisfaction)
 *
 * This service predicts SATISFACTION per order in real-time — enables
 * service recovery (comps, manager check-in) BEFORE customer leaves unhappy.
 *
 * Algorithm:
 *   For each recent paid order:
 *   1. ticket_time_score: time from order to payment (faster = higher)
 *   2. modification_score: # of item modifications (more mods = risk)
 *   3. void_refund_score: any voids/refunds (strong negative signal)
 *   4. party_size_score: large parties lower satisfaction
 *   5. server_load_score: server handling many tables = slower service
 *   6. peak_hour_score: peak hours have lower satisfaction (rushed)
 *   7. repeat_customer_score: returning customers have different expectations
 *   8. discount_score: discounted orders may have different patterns
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SatisfactionLevel = 'critical' | 'at_risk' | 'neutral' | 'satisfied' | 'delighted';
export type SatisfactionRecommendation =
  | 'manager_checkin' | 'comp_offered' | 'apologize' | 'expedite_order'
  | 'thank_customer' | 'no_action';

export interface RiskFactor {
  weight: number;
  detail: string;
}

export interface SatisfactionPrediction {
  id?: string;
  order_id?: string;
  customer?: string;
  customer_name?: string;
  server_name?: string;
  order_total: number;
  party_size: number;
  ticket_time_min: number;
  satisfaction_score: number;
  satisfaction_level: SatisfactionLevel;
  risk_factors?: Record<string, RiskFactor>;
  ai_insight?: string;
  ai_recommendation?: SatisfactionRecommendation;
  action_taken: string;
  predicted_at: Date;
  branch_id?: string;
}

export interface SatisfactionConfig {
  aiEnabled: boolean;
  lookbackHours: number;
  criticalThreshold: number;
  atRiskThreshold: number;
  delightedThreshold: number;
  maxOrders: number;
}

export const DEFAULT_SATISFACTION_CONFIG: SatisfactionConfig = {
  aiEnabled: true,
  lookbackHours: 4,
  criticalThreshold: 40,
  atRiskThreshold: 55,
  delightedThreshold: 85,
  maxOrders: 50,
};

export const readSatisfactionConfig = (settings: any): SatisfactionConfig => ({
  aiEnabled: settings?.satisfaction_ai_enabled ?? true,
  lookbackHours: safeNumber(settings?.satisfaction_lookback_hours, 4),
  criticalThreshold: safeNumber(settings?.satisfaction_critical_threshold, 40),
  atRiskThreshold: safeNumber(settings?.satisfaction_at_risk_threshold, 55),
  delightedThreshold: safeNumber(settings?.satisfaction_delighted_threshold, 85),
  maxOrders: safeNumber(settings?.satisfaction_max_orders, 50),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toLevel = (score: number, cfg: SatisfactionConfig): SatisfactionLevel => {
  if (score < cfg.criticalThreshold) return 'critical';
  if (score < cfg.atRiskThreshold) return 'at_risk';
  if (score >= cfg.delightedThreshold) return 'delighted';
  if (score >= 70) return 'satisfied';
  return 'neutral';
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface OrderData {
  id: string;
  auto_id?: string;
  total: number;
  created_at: string;
  completed_at?: string;
  customer_id?: string;
  customer_name?: string;
  cashier_id?: string;
  cashier_name?: string;
  party_size: number;
  discount_amount: number;
  has_void: boolean;
  has_refund: boolean;
  modification_count: number;
  server_active_tables: number;
  is_peak_hour: boolean;
  is_repeat_customer: boolean;
}

const fetchRecentOrders = async (db: any, cfg: SatisfactionConfig): Promise<OrderData[]> => {
  try {
    const result = await db.query(
      `SELECT
         id, auto_id, total, created_at, completed_at,
         customer.id AS customer_id, customer.name AS customer_name,
         cashier.id AS cashier_id, cashier.name AS cashier_name,
         covers AS party_size,
         discount_amount,
         math::count(order_item.is_refunded = true) AS refund_count,
         math::count(order_item.is_suspended = true) AS void_count
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND created_at > time::now() - ${cfg.lookbackHours}h
       ORDER BY created_at DESC
       LIMIT ${cfg.maxOrders}
       FETCH customer, cashier`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    // Get modification counts per order
    const orderIds = rows.map((r: any) => r.id?.toString?.()).filter(Boolean);
    let modCounts = new Map<string, number>();
    if (orderIds.length > 0) {
      try {
        const modResult = await db.query(
          `SELECT order.id AS order_id, count() AS mod_count
           FROM order_item
           WHERE modifiers IS NOT NONE AND modifiers != []
           GROUP BY order`
        );
        const modRows = Array.isArray(modResult) ? modResult.flat() : [];
        for (const m of modRows) {
          modCounts.set(m.order_id?.toString?.() ?? '', safeNumber(m.mod_count, 0));
        }
      } catch { /* non-fatal */ }
    }

    // Get server active table counts (how many tables each cashier is handling)
    const cashierLoad = new Map<string, number>();
    try {
      const loadResult = await db.query(
        `SELECT cashier.id AS cashier_id, count() AS active_orders
         FROM order
         WHERE status = 'Open' AND deleted_at IS NONE AND cashier IS NOT NONE
         GROUP BY cashier`
      );
      const loadRows = Array.isArray(loadResult) ? loadResult.flat() : [];
      for (const l of loadRows) {
        cashierLoad.set(l.cashier_id?.toString?.() ?? '', safeNumber(l.active_orders, 0));
      }
    } catch { /* non-fatal */ }

    return rows.map((r: any) => {
      const orderId = r.id?.toString?.() ?? '';
      const cashierId = r.cashier_id?.toString?.() ?? '';
      const hour = new Date(r.created_at).getHours();
      const isPeak = hour >= 12 && hour < 14 || hour >= 18 && hour < 21;
      return {
        id: orderId,
        auto_id: r.auto_id?.toString?.(),
        total: safeNumber(r.total, 0),
        created_at: r.created_at,
        completed_at: r.completed_at,
        customer_id: r.customer_id?.toString?.(),
        customer_name: r.customer_name,
        cashier_id: cashierId,
        cashier_name: r.cashier_name,
        party_size: safeNumber(r.covers, 1) || safeNumber(r.party_size, 1),
        discount_amount: safeNumber(r.discount_amount, 0),
        has_void: safeNumber(r.void_count, 0) > 0,
        has_refund: safeNumber(r.refund_count, 0) > 0,
        modification_count: modCounts.get(orderId) ?? 0,
        server_active_tables: cashierLoad.get(cashierId) ?? 0,
        is_peak_hour: isPeak,
        is_repeat_customer: false, // would need order history check
      };
    });
  } catch (err) {
    console.warn('[satisfaction] fetchRecentOrders failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const scoreOrder = (order: OrderData, _cfg: SatisfactionConfig): {
  score: number;
  factors: Record<string, RiskFactor>;
  ticketTimeMin: number;
} => {
  const factors: Record<string, RiskFactor> = {};
  let score = 85; // start at baseline "satisfied"

  // 1. ticket_time_score: time from order to payment
  const ticketTimeMin = order.created_at && order.completed_at
    ? (new Date(order.completed_at).getTime() - new Date(order.created_at).getTime()) / 60000
    : 0;

  if (ticketTimeMin > 0) {
    if (ticketTimeMin > 45) {
      factors.long_ticket_time = {
        weight: -25,
        detail: `Ticket time ${Math.round(ticketTimeMin)} min — exceeds 45 min threshold (very slow)`,
      };
      score -= 25;
    } else if (ticketTimeMin > 30) {
      factors.long_ticket_time = {
        weight: -15,
        detail: `Ticket time ${Math.round(ticketTimeMin)} min — slower than ideal (30 min)`,
      };
      score -= 15;
    } else if (ticketTimeMin < 10) {
      factors.fast_service = {
        weight: 10,
        detail: `Ticket time ${Math.round(ticketTimeMin)} min — fast service (positive)`,
      };
      score += 10;
    }
  }

  // 2. modification_score: many mods = complexity risk
  if (order.modification_count >= 5) {
    factors.high_modifications = {
      weight: -12,
      detail: `${order.modification_count} item modifications — complex order, higher error risk`,
    };
    score -= 12;
  } else if (order.modification_count >= 3) {
    factors.moderate_modifications = {
      weight: -5,
      detail: `${order.modification_count} modifications — some complexity`,
    };
    score -= 5;
  }

  // 3. void_refund_score: strong negative signal
  if (order.has_void || order.has_refund) {
    factors.void_or_refund = {
      weight: -30,
      detail: 'Order had voided or refunded items — strong dissatisfaction signal',
    };
    score -= 30;
  }

  // 4. party_size_score: large parties have lower satisfaction
  if (order.party_size >= 6) {
    factors.large_party = {
      weight: -10,
      detail: `Party of ${order.party_size} — large parties have coordination challenges`,
    };
    score -= 10;
  }

  // 5. server_load_score: overloaded server = slower service
  if (order.server_active_tables >= 8) {
    factors.server_overloaded = {
      weight: -15,
      detail: `Server handling ${order.server_active_tables} tables — service likely slow`,
    };
    score -= 15;
  } else if (order.server_active_tables >= 5) {
    factors.server_busy = {
      weight: -8,
      detail: `Server handling ${order.server_active_tables} tables — moderate load`,
    };
    score -= 8;
  }

  // 6. peak_hour_score: peak hours = rushed service
  if (order.is_peak_hour) {
    factors.peak_hour = {
      weight: -5,
      detail: 'Order during peak hour — rushed service increases dissatisfaction risk',
    };
    score -= 5;
  }

  // 7. discount_score: discounted orders may have different expectations
  if (order.discount_amount > 0 && order.total > 0) {
    const discountPct = order.discount_amount / order.total;
    if (discountPct > 0.2) {
      factors.large_discount = {
        weight: 5,
        detail: `${(discountPct * 100).toFixed(0)}% discount applied — customer may be pleased by value`,
      };
      score += 5;
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, factors, ticketTimeMin };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (predictions: SatisfactionPrediction[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || predictions.length === 0) return;

  const atRisk = predictions.filter(p =>
    p.satisfaction_level === 'critical' || p.satisfaction_level === 'at_risk'
  ).slice(0, 15);

  if (atRisk.length === 0) return;

  const prompt = `You are a restaurant service recovery expert.
For each at-risk order below, provide:
  - insight: max 200 chars — root cause of dissatisfaction risk
  - recommendation: one of manager_checkin | comp_offered | apologize | expedite_order | thank_customer | no_action

Recommendation guidance:
  - manager_checkin: critical score — manager should visit table personally
  - comp_offered: void/refund present — offer comp (free dessert, discount)
  - apologize: long ticket time — proactive apology from server
  - expedite_order: order still in progress — prioritize in kitchen
  - thank_customer: delighted score — thank them, encourage review
  - no_action: neutral/satisfied — no intervention needed

Orders (JSON):
${JSON.stringify(atRisk.map(p => ({
  order: p.order_id,
  customer: p.customer_name,
  server: p.server_name,
  total: p.order_total,
  party_size: p.party_size,
  ticket_time: p.ticket_time_min.toFixed(0),
  satisfaction: p.satisfaction_score,
  level: p.satisfaction_level,
  risk_factors: Object.fromEntries(
    Object.entries(p.risk_factors ?? {}).map(([k, v]) => [k, (v as any).detail])
  ),
})), null, 2)}

Respond with JSON array:
[{
  "order": "<match order_id>",
  "insight": "<max 200 chars>",
  "recommendation": "manager_checkin" | "comp_offered" | "apologize" | "expedite_order" | "thank_customer" | "no_action"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a satisfaction prediction AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      order: string; insight?: string; recommendation?: SatisfactionRecommendation;
    }>;
    for (const item of parsed) {
      const pred = predictions.find(p => p.order_id === item.order);
      if (pred) {
        if (item.insight) pred.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) pred.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[satisfaction] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runSatisfactionPrediction = async (
  db: ReturnType<typeof useDB>,
  config: SatisfactionConfig = DEFAULT_SATISFACTION_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ predictions: SatisfactionPrediction[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  const orders = await fetchRecentOrders(db, config);
  if (onProgress) onProgress(1, 2);

  if (orders.length === 0) {
    if (onProgress) onProgress(2, 2);
    return { predictions: [], scanned: 0 };
  }

  const predictions: SatisfactionPrediction[] = [];
  for (const order of orders) {
    try {
      const { score, factors, ticketTimeMin } = scoreOrder(order, config);
      // Only persist at-risk or delighted (actionable)
      if (score >= config.atRiskThreshold && score < config.delightedThreshold) continue;

      predictions.push({
        order_id: order.id,
        customer: order.customer_id,
        customer_name: order.customer_name,
        server_name: order.cashier_name,
        order_total: order.total,
        party_size: order.party_size,
        ticket_time_min: Math.round(ticketTimeMin * 10) / 10,
        satisfaction_score: Math.round(score),
        satisfaction_level: toLevel(score, config),
        risk_factors: factors,
        action_taken: 'none',
        predicted_at: new Date(),
      });
    } catch (err) {
      console.warn('[satisfaction] score failed for order', order.id, err);
    }
  }

  // Sort: critical first, then at_risk, then delighted
  const levelOrder = { critical: 0, at_risk: 1, delighted: 2, satisfied: 3, neutral: 4 };
  predictions.sort((a, b) =>
    (levelOrder[a.satisfaction_level] ?? 5) - (levelOrder[b.satisfaction_level] ?? 5)
  );

  if (config.aiEnabled && predictions.length > 0) {
    await enhanceWithAI(predictions);
  }

  // Persist
  try {
    await db.query(`DELETE FROM satisfaction_prediction WHERE predicted_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const pred of predictions) {
    try {
      await db.query(`CREATE satisfaction_prediction CONTENT $data`, {
        data: { ...pred, predicted_at: pred.predicted_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { predictions, scanned: orders.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getAtRiskOrders = async (db: ReturnType<typeof useDB>): Promise<SatisfactionPrediction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM satisfaction_prediction
       WHERE action_taken = 'none'
         AND predicted_at > time::now() - 4h
       ORDER BY
         CASE satisfaction_level WHEN 'critical' THEN 0 WHEN 'at_risk' THEN 1 WHEN 'delighted' THEN 2 ELSE 3 END,
         satisfaction_score ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface SatisfactionSummary {
  total: number;
  critical: number;
  atRisk: number;
  delighted: number;
  avgScore: number;
}

export const getSatisfactionSummary = async (db: ReturnType<typeof useDB>): Promise<SatisfactionSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(satisfaction_level = 'critical') AS critical,
         math::count(satisfaction_level = 'at_risk') AS at_risk,
         math::count(satisfaction_level = 'delighted') AS delighted,
         math::mean(satisfaction_score) AS avg_score
       FROM satisfaction_prediction
       WHERE action_taken = 'none'
         AND predicted_at > time::now() - 4h
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      atRisk: safeNumber(row.at_risk, 0),
      delighted: safeNumber(row.delighted, 0),
      avgScore: safeNumber(row.avg_score, 0),
    };
  } catch {
    return { total: 0, critical: 0, atRisk: 0, delighted: 0, avgScore: 0 };
  }
};

export const updateSatisfactionAction = async (
  db: ReturnType<typeof useDB>, predictionId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: predictionId, action });
};
