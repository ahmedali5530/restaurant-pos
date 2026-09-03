/**
 * AI Abandoned Cart Recovery service — detect and recover stale open orders.
 *
 * 26th POSR-exclusive differentiator — $50B/year lost to abandoned orders in
 * food service. Toast and Square have NO abandoned cart detection. POSR
 * detects stale open orders, predicts which are recoverable, and recommends
 * recovery actions.
 *
 * Distinct from:
 *   - churn.service (predicts customer departure, not abandoned orders)
 *   - winback.service (targets customers who left, not in-progress carts)
 *   - satisfaction-prediction (predicts satisfaction per completed order)
 *   - kitchen-bottleneck (detects kitchen delays, not cart abandonment)
 *
 * Detection:
 *   1. STALE_OPEN_ORDER — order in 'Open' status > 30 min with no activity
 *   2. PARTIAL_ORDER — order has items but no payment attempt
 *   3. SUSPENDED_ITEMS — order has suspended (voided) items but still open
 *   4. DRAFT_ABANDONED — draft order > 2h old, never submitted
 *
 * Recovery factors:
 *   1. ORDER_VALUE — higher value = worth recovering (+20)
 *   2. CUSTOMER_HISTORY — repeat customers more likely to return (+15)
 *   3. TIME_STALE — less stale = higher recovery probability (+15)
 *   4. ITEM_COUNT — more items = more invested (+10)
 *   5. PEAK_HOUR — abandoned during peak = customer found alternative (-10)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecoveryLevel = 'low' | 'medium' | 'high';
export type RecoveryRecommendation =
  | 'call_customer' | 'send_reminder' | 'hold_order'
  | 'cancel_and_apologize' | 'offer_discount' | 'no_action';
export type AbandonedTrigger = 'stale_open' | 'partial_order' | 'suspended_items' | 'draft_abandoned';

export interface RiskFactor {
  weight: number;
  detail: string;
}

export interface AbandonedCartAlert {
  id?: string;
  order_id?: string;
  order_number?: string;
  customer?: string;
  customer_name?: string;
  customer_phone?: string;
  server_name?: string;
  order_total: number;
  item_count: number;
  created_at: Date;
  minutes_stale: number;
  trigger_reason: AbandonedTrigger;
  recovery_score: number;
  recovery_level: RecoveryLevel;
  recovery_factors?: Record<string, RiskFactor>;
  est_recovered_revenue: number;
  ai_insight?: string;
  ai_recommendation?: RecoveryRecommendation;
  action_taken: string;
  detected_at: Date;
  branch_id?: string;
}

export interface AbandonedCartConfig {
  aiEnabled: boolean;
  staleThresholdMin: number;
  draftThresholdMin: number;
  highRecoveryThreshold: number;
  maxAlerts: number;
}

export const DEFAULT_ABANDONED_CONFIG: AbandonedCartConfig = {
  aiEnabled: true,
  staleThresholdMin: 30,
  draftThresholdMin: 120,
  highRecoveryThreshold: 65,
  maxAlerts: 30,
};

export const readAbandonedConfig = (settings: any): AbandonedCartConfig => ({
  aiEnabled: settings?.abandoned_ai_enabled ?? true,
  staleThresholdMin: safeNumber(settings?.abandoned_stale_threshold_min, 30),
  draftThresholdMin: safeNumber(settings?.abandoned_draft_threshold_min, 120),
  highRecoveryThreshold: safeNumber(settings?.abandoned_high_recovery_threshold, 65),
  maxAlerts: safeNumber(settings?.abandoned_max_alerts, 30),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const toRecoveryLevel = (score: number, cfg: AbandonedCartConfig): RecoveryLevel => {
  if (score >= cfg.highRecoveryThreshold) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface StaleOrderData {
  id: string;
  auto_id?: string;
  total: number;
  created_at: string;
  updated_at?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  cashier_id?: string;
  cashier_name?: string;
  item_count: number;
  has_suspended: boolean;
  status: string;
}

const fetchStaleOrders = async (db: any, cfg: AbandonedCartConfig): Promise<StaleOrderData[]> => {
  try {
    // Get Open orders older than threshold + Draft orders older than draft threshold
    const result = await db.query(
      `SELECT
         id, auto_id, total, created_at, updated_at, status,
         customer.id AS customer_id, customer.name AS customer_name,
         customer.phone AS customer_phone,
         cashier.id AS cashier_id, cashier.name AS cashier_name,
         math::count(order_item) AS item_count,
         math::count(order_item.is_suspended = true) AS suspended_count
       FROM order
       WHERE deleted_at IS NONE
         AND (
           (status = 'Open' AND created_at < time::now() - ${cfg.staleThresholdMin}m)
           OR
           (status = 'Draft' AND created_at < time::now() - ${cfg.draftThresholdMin}m)
         )
       ORDER BY created_at ASC
       LIMIT ${cfg.maxAlerts}
       FETCH customer, cashier`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map((r: any) => ({
      id: r.id?.toString?.() ?? '',
      auto_id: r.auto_id?.toString?.(),
      total: safeNumber(r.total, 0),
      created_at: r.created_at,
      updated_at: r.updated_at,
      customer_id: r.customer_id?.toString?.(),
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      cashier_id: r.cashier_id?.toString?.(),
      cashier_name: r.cashier_name,
      item_count: safeNumber(r.item_count, 0),
      has_suspended: safeNumber(r.suspended_count, 0) > 0,
      status: r.status ?? 'Open',
    }));
  } catch (err) {
    console.warn('[abandoned] fetchStaleOrders failed', err);
    return [];
  }
};

const getCustomerOrderCount = async (db: any, customerId: string): Promise<number> => {
  if (!customerId) return 0;
  try {
    const result = await db.query(
      `SELECT count() AS cnt FROM order WHERE customer = $cid AND status = 'Paid'`,
      { cid: customerId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.cnt, 0);
  } catch { return 0; }
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const scoreRecovery = async (
  db: any,
  order: StaleOrderData,
  cfg: AbandonedCartConfig
): Promise<{ score: number; factors: Record<string, RiskFactor>; trigger: AbandonedTrigger; minutesStale: number }> => {
  const factors: Record<string, RiskFactor> = {};
  let score = 50; // baseline

  const createdDate = new Date(order.created_at);
  const updatedDate = order.updated_at ? new Date(order.updated_at) : createdDate;
  const minutesStale = Math.floor((Date.now() - updatedDate.getTime()) / 60000);

  // Determine trigger reason
  let trigger: AbandonedTrigger;
  if (order.status === 'Draft') {
    trigger = 'draft_abandoned';
  } else if (order.has_suspended) {
    trigger = 'suspended_items';
  } else if (order.item_count === 0) {
    trigger = 'partial_order';
  } else {
    trigger = 'stale_open';
  }

  // 1. ORDER_VALUE — higher value = worth recovering (+20)
  if (order.total > 50) {
    factors.high_value = {
      weight: 20,
      detail: `Order value ${formatCurrency(order.total)} — high value worth recovering`,
    };
    score += 20;
  } else if (order.total > 20) {
    factors.medium_value = {
      weight: 10,
      detail: `Order value ${formatCurrency(order.total)} — moderate value`,
    };
    score += 10;
  }

  // 2. CUSTOMER_HISTORY — repeat customers more likely to return (+15)
  if (order.customer_id) {
    const orderCount = await getCustomerOrderCount(db, order.customer_id);
    if (orderCount >= 5) {
      factors.repeat_customer = {
        weight: 15,
        detail: `Repeat customer with ${orderCount} past orders — high recovery likelihood`,
      };
      score += 15;
    } else if (orderCount >= 1) {
      factors.returning_customer = {
        weight: 8,
        detail: `Returning customer with ${orderCount} past order(s)`,
      };
      score += 8;
    }
  }

  // 3. TIME_STALE — less stale = higher recovery (+15)
  if (minutesStale < cfg.staleThresholdMin * 2) {
    factors.recently_active = {
      weight: 15,
      detail: `Only ${minutesStale} min stale — customer may still be nearby`,
    };
    score += 15;
  } else if (minutesStale < cfg.staleThresholdMin * 4) {
    factors.moderately_stale = {
      weight: 5,
      detail: `${minutesStale} min stale — moderate recovery window`,
    };
    score += 5;
  } else {
    factors.very_stale = {
      weight: -10,
      detail: `${minutesStale} min stale — customer likely gone`,
    };
    score -= 10;
  }

  // 4. ITEM_COUNT — more items = more invested (+10)
  if (order.item_count >= 5) {
    factors.many_items = {
      weight: 10,
      detail: `${order.item_count} items in cart — customer invested time in order`,
    };
    score += 10;
  } else if (order.item_count >= 2) {
    factors.some_items = {
      weight: 5,
      detail: `${order.item_count} items in cart`,
    };
    score += 5;
  }

  // 5. PEAK_HOUR — abandoned during peak = found alternative (-10)
  const hour = createdDate.getHours();
  const isPeak = (hour >= 12 && hour < 14) || (hour >= 18 && hour < 21);
  if (isPeak) {
    factors.peak_hour = {
      weight: -10,
      detail: `Abandoned during peak hour — customer may have found alternative`,
    };
    score -= 10;
  }

  // 6. SUSPENDED_ITEMS — voided items but still open (-5)
  if (order.has_suspended) {
    factors.suspended_items = {
      weight: -5,
      detail: 'Order has suspended/voided items — may indicate dissatisfaction with items',
    };
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));
  return { score, factors, trigger, minutesStale };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: AbandonedCartAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const high = alerts.filter(a => a.recovery_score >= 35).slice(0, 15);

  const prompt = `You are a restaurant order recovery specialist.
For each abandoned cart below, provide:
  - insight: max 200 chars — why this cart was abandoned + recovery potential
  - recommendation: one of call_customer | send_reminder | hold_order | cancel_and_apologize | offer_discount | no_action

Recommendation guidance:
  - call_customer: high value + phone available + recent → call to complete
  - send_reminder: medium score, no phone → SMS/email reminder
  - hold_order: high score, customer may return → hold for 30 more min
  - cancel_and_apologize: very stale + low score → cancel gracefully
  - offer_discount: medium score, incentive to return → offer 10% to complete
  - no_action: low score, not worth pursuing

Carts (JSON):
${JSON.stringify(high.map(a => ({
  order: a.order_number ?? a.order_id,
  customer: a.customer_name,
  total: a.order_total,
  items: a.item_count,
  minutes_stale: a.minutes_stale,
  trigger: a.trigger_reason,
  recovery_score: a.recovery_score,
  recovery_level: a.recovery_level,
  factors: Object.fromEntries(
    Object.entries(a.recovery_factors ?? {}).map(([k, v]) => [k, (v as any).detail])
  ),
})), null, 2)}

Respond with JSON array:
[{
  "order": "<match order_number or order_id>",
  "insight": "<max 200 chars>",
  "recommendation": "call_customer" | "send_reminder" | "hold_order" | "cancel_and_apologize" | "offer_discount" | "no_action"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are an abandoned cart recovery AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      order: string; insight?: string; recommendation?: RecoveryRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.order_number === item.order || a.order_id === item.order);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[abandoned] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runAbandonedCartScan = async (
  db: ReturnType<typeof useDB>,
  config: AbandonedCartConfig = DEFAULT_ABANDONED_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: AbandonedCartAlert[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  const orders = await fetchStaleOrders(db, config);
  if (onProgress) onProgress(1, 2);

  if (orders.length === 0) {
    if (onProgress) onProgress(2, 2);
    return { alerts: [], scanned: 0 };
  }

  const alerts: AbandonedCartAlert[] = [];
  for (const order of orders) {
    try {
      const { score, factors, trigger, minutesStale } = await scoreRecovery(db, order, config);
      alerts.push({
        order_id: order.id,
        order_number: order.auto_id ?? order.id,
        customer: order.customer_id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        server_name: order.cashier_name,
        order_total: order.total,
        item_count: order.item_count,
        created_at: new Date(order.created_at),
        minutes_stale: minutesStale,
        trigger_reason: trigger,
        recovery_score: Math.round(score),
        recovery_level: toRecoveryLevel(score, config),
        recovery_factors: factors,
        est_recovered_revenue: order.total,
        action_taken: 'none',
        detected_at: new Date(),
      });
    } catch (err) {
      console.warn('[abandoned] score failed for order', order.id, err);
    }
  }

  // Sort: high recovery first
  alerts.sort((a, b) => b.recovery_score - a.recovery_score);

  if (config.aiEnabled && alerts.length > 0) {
    await enhanceWithAI(alerts);
  }

  // Persist (refresh — delete old > 1h, create new)
  try {
    await db.query(`DELETE FROM abandoned_cart_alert WHERE detected_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const alert of alerts) {
    try {
      await db.query(`CREATE abandoned_cart_alert CONTENT $data`, {
        data: { ...alert, created_at: alert.created_at.toISOString(), detected_at: alert.detected_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { alerts, scanned: orders.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<AbandonedCartAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM abandoned_cart_alert
       WHERE action_taken = 'none'
         AND detected_at > time::now() - 4h
       ORDER BY recovery_score DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface AbandonedSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  totalRecoverableRevenue: number;
}

export const getAbandonedSummary = async (db: ReturnType<typeof useDB>): Promise<AbandonedSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(recovery_level = 'high') AS high,
         math::count(recovery_level = 'medium') AS medium,
         math::count(recovery_level = 'low') AS low,
         math::sum(est_recovered_revenue) AS total_revenue
       FROM abandoned_cart_alert
       WHERE action_taken = 'none'
         AND detected_at > time::now() - 4h
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      high: safeNumber(row.high, 0),
      medium: safeNumber(row.medium, 0),
      low: safeNumber(row.low, 0),
      totalRecoverableRevenue: safeNumber(row.total_revenue, 0),
    };
  } catch {
    return { total: 0, high: 0, medium: 0, low: 0, totalRecoverableRevenue: 0 };
  }
};

export const updateAbandonedAction = async (
  db: ReturnType<typeof useDB>, alertId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: alertId, action });
};
