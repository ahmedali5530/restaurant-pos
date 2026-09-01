/**
 * AI Payment Chargeback Risk Detection service — predictive chargeback prevention.
 *
 * 13th POSR-exclusive differentiator — Toast and Square have REACTIVE chargeback
 * management (respond after dispute filed) but NO PREDICTIVE AI. Restaurants
 * lose $1-3k/year to chargebacks (avg $190 per chargeback, 0.5% rate per Statista).
 * POSR scores each transaction in real-time + AI prevention recommendations.
 *
 * Risk factors (7):
 *   1. LARGE_FIRST_ORDER     — first order from customer > $200 (no history, +20)
 *   2. LATE_NIGHT_HIGH_VALUE — orders > $150 between 22:00-04:00 (impaired judgment, +15)
 *   3. SPLIT_PAYMENT_HIGH    — split into 3+ payments (confusion disputes, +12)
 *   4. RUSH_DELIVERY         — delivery with expedited flag (time pressure, +10)
 *   5. NEW_DEVICE_OR_ADDRESS — first delivery to this address (no history, +12)
 *   6. PRIOR_CHARGEBACK     — customer has chargeback history (chronic disputer, +18)
 *   7. CASH_REFUND_PATTERN  — orders with cash refunds in last 30 days (dispute pattern, +13)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChargebackRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ChargebackRecommendation =
  | 'require_signature' | 'verify_id' | 'call_confirm' | 'photo_on_delivery'
  | 'decline_transaction' | 'review_manually' | 'accept';

export interface RiskFactor {
  weight: number;
  detail: string;
}

export interface ChargebackRiskAlert {
  id?: string;
  order_id?: string;
  order_number?: string;
  customer?: string;
  customer_name?: string;
  cashier?: string;
  cashier_name?: string;
  order_total: number;
  payment_method?: string;
  risk_score: number;
  risk_level: ChargebackRiskLevel;
  risk_factors?: Record<string, RiskFactor>;
  est_chargeback_cost: number;
  ai_insight?: string;
  ai_recommendation?: ChargebackRecommendation;
  action_taken: string;
  detected_at: Date;
  updated_at?: Date;
  branch_id?: string;
}

export interface ChargebackConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  largeOrderThreshold: number;
  lateNightThreshold: number;
  splitCountThreshold: number;
  highRiskThreshold: number;
  criticalThreshold: number;
  avgCost: number;
}

export const DEFAULT_CHARGEBACK_CONFIG: ChargebackConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  largeOrderThreshold: 200,
  lateNightThreshold: 150,
  splitCountThreshold: 3,
  highRiskThreshold: 65,
  criticalThreshold: 85,
  avgCost: 190,
};

export const readChargebackConfig = (settings: any): ChargebackConfig => ({
  aiEnabled: settings?.chargeback_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.chargeback_lookback_days, 30),
  largeOrderThreshold: safeNumber(settings?.chargeback_large_order_threshold, 200),
  lateNightThreshold: safeNumber(settings?.chargeback_late_night_threshold, 150),
  splitCountThreshold: safeNumber(settings?.chargeback_split_count_threshold, 3),
  highRiskThreshold: safeNumber(settings?.chargeback_high_risk_threshold, 65),
  criticalThreshold: safeNumber(settings?.chargeback_critical_threshold, 85),
  avgCost: safeNumber(settings?.chargeback_avg_cost, 190),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toLevel = (score: number, cfg: ChargebackConfig): ChargebackRiskLevel => {
  if (score >= cfg.criticalThreshold) return 'critical';
  if (score >= cfg.highRiskThreshold) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const isRecentlyAlerted = async (
  db: ReturnType<typeof useDB>,
  orderId: string,
  hours = 6
): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM chargeback_risk_alert
       WHERE order_id = $oid AND detected_at > time::now() - ${hours}h
       LIMIT 1`,
      { oid: orderId }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

const fetchRecentOrders = async (db: any, _cfg: ChargebackConfig): Promise<any[]> => {
  try {
    const result = await db.query(
      `SELECT
         id, auto_id, total, split, status, created_at,
         customer.id AS customer_id, customer.name AS customer_name,
         cashier.id AS cashier_id, cashier.name AS cashier_name,
         order_type, payments, delivery,
         (SELECT * FROM order_refund WHERE order = parent.id) AS refunds
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND created_at > time::now() - 24h
       ORDER BY created_at DESC
       LIMIT 100
       FETCH customer, cashier, payments.payment_type`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.warn('[chargeback] fetchRecentOrders failed', err);
    return [];
  }
};

const getCustomerOrderCount = async (db: any, customerId: string): Promise<number> => {
  if (!customerId) return 0;
  try {
    const result = await db.query(
      `SELECT count() AS cnt FROM order
       WHERE customer = $cid AND status = 'Paid' AND deleted_at IS NONE`,
      { cid: customerId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.cnt, 0);
  } catch { return 0; }
};

const getCustomerPriorChargebacks = async (db: any, customerId: string, cfg: ChargebackConfig): Promise<number> => {
  if (!customerId) return 0;
  try {
    const result = await db.query(
      `SELECT count() AS cnt FROM chargeback_risk_alert
       WHERE customer = $cid
         AND action_taken = 'charged_back'
         AND detected_at > time::now() - ${cfg.lookbackDays}d`,
      { cid: customerId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.cnt, 0);
  } catch { return 0; }
};

const getCustomerCashRefunds = async (db: any, customerId: string, cfg: ChargebackConfig): Promise<number> => {
  if (!customerId) return 0;
  try {
    const result = await db.query(
      `SELECT count() AS cnt FROM order_refund
       WHERE order.customer = $cid
         AND created_at > time::now() - ${cfg.lookbackDays}d`,
      { cid: customerId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.cnt, 0);
  } catch { return 0; }
};

const isFirstDeliveryToAddress = async (db: any, customerId: string, deliveryId: string): Promise<boolean> => {
  if (!customerId || !deliveryId) return false;
  try {
    const result = await db.query(
      `SELECT count() AS cnt FROM order
       WHERE customer = $cid AND delivery = $did AND status = 'Paid'
         AND deleted_at IS NONE`,
      { cid: customerId, did: deliveryId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.cnt, 0) <= 1;
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const scoreOrder = async (
  db: any,
  order: any,
  cfg: ChargebackConfig
): Promise<{ score: number; factors: Record<string, RiskFactor> } | null> => {
  const factors: Record<string, RiskFactor> = {};
  let score = 0;

  const total = safeNumber(order.total, 0);
  const customerId = order.customer_id?.toString?.() ?? '';
  const createdAt = new Date(order.created_at);
  const hour = createdAt.getHours();
  const isLateNight = hour >= 22 || hour < 4;
  const splitCount = safeNumber(order.split, 0);
  const payments = Array.isArray(order.payments) ? order.payments : [];
  const isDelivery = order.order_type === 'delivery' || !!order.delivery;

  // 1. LARGE_FIRST_ORDER — first order from customer > $200 (+20)
  if (total > cfg.largeOrderThreshold) {
    const orderCount = await getCustomerOrderCount(db, customerId);
    if (orderCount <= 1) {
      factors.large_first_order = {
        weight: 20,
        detail: `First order totaling ${formatCurrency(total)} — no purchase history to assess risk`,
      };
      score += 20;
    }
  }

  // 2. LATE_NIGHT_HIGH_VALUE — orders > $150 between 22:00-04:00 (+15)
  if (isLateNight && total > cfg.lateNightThreshold) {
    factors.late_night_high_value = {
      weight: 15,
      detail: `${formatCurrency(total)} order at ${hour}:00 — late-night high-value transactions have elevated dispute rates`,
    };
    score += 15;
  }

  // 3. SPLIT_PAYMENT_HIGH — split into 3+ payments (+12)
  if (splitCount >= cfg.splitCountThreshold || payments.length >= cfg.splitCountThreshold) {
    factors.split_payment_high = {
      weight: 12,
      detail: `${Math.max(splitCount, payments.length)} payments on one order — split payments increase confusion disputes`,
    };
    score += 12;
  }

  // 4. RUSH_DELIVERY — delivery with expedited flag (+10)
  // Without explicit rush field, use delivery + late night as proxy
  if (isDelivery && isLateNight) {
    factors.rush_delivery = {
      weight: 10,
      detail: 'Late-night delivery — time pressure increases order errors and disputes',
    };
    score += 10;
  }

  // 5. NEW_DEVICE_OR_ADDRESS — first delivery to this address (+12)
  if (isDelivery && order.delivery) {
    const deliveryId = order.delivery?.toString?.() ?? order.delivery;
    const isFirst = await isFirstDeliveryToAddress(db, customerId, deliveryId);
    if (isFirst) {
      factors.new_address = {
        weight: 12,
        detail: 'First delivery to this address — no delivery history, fraud risk elevated',
      };
      score += 12;
    }
  }

  // 6. PRIOR_CHARGEBACK — customer has chargeback history (+18)
  const priorChargebacks = await getCustomerPriorChargebacks(db, customerId, cfg);
  if (priorChargebacks > 0) {
    factors.prior_chargeback = {
      weight: 18,
      detail: `${priorChargebacks} prior chargeback(s) in last ${cfg.lookbackDays} days — chronic disputer pattern`,
    };
    score += 18;
  }

  // 7. CASH_REFUND_PATTERN — orders with refunds in last 30 days (+13)
  const cashRefunds = await getCustomerCashRefunds(db, customerId, cfg);
  if (cashRefunds >= 2) {
    factors.cash_refund_pattern = {
      weight: 13,
      detail: `${cashRefunds} refund(s) in last ${cfg.lookbackDays} days — frequent refund pattern indicates dispute-prone customer`,
    };
    score += 13;
  }

  if (Object.keys(factors).length === 0) return null; // no risk factors, skip

  score = Math.max(0, Math.min(100, score));
  return { score, factors };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: ChargebackRiskAlert[], _cfg: ChargebackConfig): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const high = alerts.filter(a => a.risk_score >= 35).slice(0, 15);

  const prompt = `You are a restaurant payment fraud prevention specialist.
For each high-risk transaction below, provide:
  - insight: max 200 chars — why this transaction is risky
  - recommendation: one of require_signature | verify_id | call_confirm | photo_on_delivery | decline_transaction | review_manually | accept

Recommendation guidance:
  - decline_transaction: only for critical risk with prior_chargeback factor (chronic fraudster)
  - require_signature: high-value delivery (new_address factor)
  - verify_id: large_first_order factor (verify customer identity)
  - call_confirm: late_night_high_value (confirm sobriety + intent)
  - photo_on_delivery: delivery orders (proof of delivery)
  - review_manually: medium risk, manual review warranted
  - accept: low risk, proceed normally

Transactions (JSON):
${JSON.stringify(high.map(a => ({
  order: a.order_number ?? a.order_id,
  customer: a.customer_name,
  total: a.order_total,
  payment: a.payment_method,
  risk_score: a.risk_score,
  risk_factors: Object.fromEntries(
    Object.entries(a.risk_factors ?? {}).map(([k, v]) => [k, (v as any).detail])
  ),
})), null, 2)}

Respond with JSON array:
[{
  "order": "<match order_number or order_id>",
  "insight": "<max 200 chars>",
  "recommendation": "require_signature" | "verify_id" | "call_confirm" | "photo_on_delivery" | "decline_transaction" | "review_manually" | "accept"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a payment fraud prevention AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      order: string; insight?: string; recommendation?: ChargebackRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.order_number === item.order || a.order_id === item.order);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[chargeback] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runChargebackRiskScan = async (
  db: ReturnType<typeof useDB>,
  config: ChargebackConfig = DEFAULT_CHARGEBACK_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: ChargebackRiskAlert[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch recent paid orders (last 24h)
  const orders = await fetchRecentOrders(db, config);
  if (onProgress) onProgress(1, 2);

  // 2. Score each
  const alerts: ChargebackRiskAlert[] = [];
  for (let i = 0; i < orders.length; i++) {
    if (onProgress && i % 10 === 0) {
      onProgress(1 + Math.floor((i / Math.max(1, orders.length)) * 1), 2);
    }
    const order = orders[i];
    try {
      const orderId = order.id?.toString?.() ?? '';
      if (await isRecentlyAlerted(db, orderId, 6)) continue;
      const scored = await scoreOrder(db, order, config);
      if (!scored || scored.score < 35) continue; // only persist at-risk

      // Determine payment method
      const payments = Array.isArray(order.payments) ? order.payments : [];
      let paymentMethod = 'unknown';
      if (payments.length === 1) {
        const pt = payments[0]?.payment_type;
        paymentMethod = typeof pt === 'object' ? pt?.name ?? 'card' : String(pt ?? 'card');
      } else if (payments.length > 1) {
        paymentMethod = 'split';
      }

      alerts.push({
        order_id: orderId,
        order_number: order.auto_id?.toString?.() ?? order.id?.toString?.(),
        customer: order.customer_id?.toString?.(),
        customer_name: order.customer_name,
        cashier: order.cashier_id?.toString?.(),
        cashier_name: order.cashier_name,
        order_total: safeNumber(order.total, 0),
        payment_method: paymentMethod,
        risk_score: scored.score,
        risk_level: toLevel(scored.score, config),
        risk_factors: scored.factors,
        est_chargeback_cost: config.avgCost,
        action_taken: 'none',
        detected_at: new Date(order.created_at),
      });
    } catch (err) {
      console.warn('[chargeback] score failed for order', order.id, err);
    }
  }

  // 3. AI enhancement
  if (config.aiEnabled && alerts.length > 0) {
    await enhanceWithAI(alerts, config);
  }

  // 4. Persist
  for (const alert of alerts) {
    try {
      await db.query(`CREATE chargeback_risk_alert CONTENT $data`, {
        data: { ...alert, detected_at: alert.detected_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { alerts, scanned: orders.length };
};

// ---------------------------------------------------------------------------
// Read + update
// ---------------------------------------------------------------------------

export const getOpenChargebackAlerts = async (
  db: ReturnType<typeof useDB>
): Promise<ChargebackRiskAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM chargeback_risk_alert
       WHERE risk_score >= 35
         AND action_taken = 'none'
         AND detected_at > time::now() - 24h
       ORDER BY
         CASE risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         risk_score DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getChargebackSummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  total: number;
  critical: number;
  high: number;
  medium: number;
  totalExposure: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level = 'critical') AS critical,
         math::count(risk_level = 'high') AS high,
         math::count(risk_level = 'medium') AS medium,
         math::sum(est_chargeback_cost) AS total_exposure
       FROM chargeback_risk_alert
       WHERE risk_score >= 35 AND action_taken = 'none'
         AND detected_at > time::now() - 24h
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      high: safeNumber(row.high, 0),
      medium: safeNumber(row.medium, 0),
      totalExposure: safeNumber(row.total_exposure, 0),
    };
  } catch {
    return { total: 0, critical: 0, high: 0, medium: 0, totalExposure: 0 };
  }
};

export const updateChargebackAction = async (
  db: ReturnType<typeof useDB>, alertId: string, action: string
): Promise<void> => {
  await db.query(
    `UPDATE $id SET action_taken = $action, updated_at = time::now()`,
    { id: alertId, action }
  );
};
