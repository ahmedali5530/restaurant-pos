/**
 * AI Order Fraud Detection service — internal theft/collusion detection.
 *
 * 6th POSR-exclusive differentiator — Toast, Square, and Lightspeed have NO
 * order-level fraud detection. They only do basic void logging. POSR analyzes
 * orders + payments + discounts + refunds to detect fraud patterns that
 * indicate employee theft or collusion.
 *
 * Restaurants lose 4-6% of annual revenue to internal fraud (NRA). This
 * service surfaces suspicious patterns so managers can investigate before
 * losses compound.
 *
 * Detection rules (7):
 *   1. EXCESSIVE_DISCOUNTS    — cashier discount_rate > 5% of their sales (comp abuse)
 *   2. CASH_DISCOUNT_PATTERN  — orders paid cash + discounted (classic comp-to-pocket-cash)
 *   3. AFTER_HOURS_ACTIVITY   — orders/refunds during 22:00-06:00 (low supervision)
 *   4. DUPLICATE_ORDERS       — same total + items within 5 min (test fraud / mistake)
 *   5. HIGH_REFUND_RATE       — cashier refund rate > 3x average (refund fraud)
 *   6. SPLIT_TENDER_ANOMALY   — split orders where cash < 10% of total (under-reporting)
 *   7. LARGE_CASH_NEAR_CLOSE  — cash orders > $200 within 30 min of close (pocketing)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FraudSeverity = 'info' | 'warning' | 'critical';
export type FraudRecommendation =
  | 'investigate' | 'audit_employee' | 'review_camera'
  | 'require_pin' | 'restrict_perms' | 'dismiss';

export interface OrderFraudAlert {
  id?: string;
  rule_id: string;
  severity: FraudSeverity;
  user_id?: string;
  user_name?: string;
  order_id?: string;
  metric_value: number;
  expected_value: number;
  deviation_pct: number;
  estimated_loss: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: FraudRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
}

export interface FraudConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  discountThreshold: number;     // 0.05 = 5%
  refundMultiplier: number;      // 3 = 3x avg
  afterHoursStart: number;
  afterHoursEnd: number;
  largeCashThreshold: number;
  closeMinutes: number;
}

export const DEFAULT_FRAUD_CONFIG: FraudConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  discountThreshold: 0.05,
  refundMultiplier: 3,
  afterHoursStart: 22,
  afterHoursEnd: 6,
  largeCashThreshold: 200,
  closeMinutes: 30,
};

export const readFraudConfig = (settings: any): FraudConfig => ({
  aiEnabled: settings?.fraud_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.fraud_lookback_days, 30),
  discountThreshold: safeNumber(settings?.fraud_discount_threshold, 0.05),
  refundMultiplier: safeNumber(settings?.fraud_refund_multiplier, 3),
  afterHoursStart: safeNumber(settings?.fraud_after_hours_start, 22),
  afterHoursEnd: safeNumber(settings?.fraud_after_hours_end, 6),
  largeCashThreshold: safeNumber(settings?.fraud_large_cash_threshold, 200),
  closeMinutes: safeNumber(settings?.fraud_close_minutes, 30),
});

// ---------------------------------------------------------------------------
// Deduplication helper
// ---------------------------------------------------------------------------

const isRecentlyAlerted = async (
  db: ReturnType<typeof useDB>,
  ruleId: string,
  hours = 12
): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM order_fraud_alert
       WHERE rule_id = $ruleId AND detected_at > time::now() - ${hours}h
       LIMIT 1`,
      { ruleId }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

// 1. EXCESSIVE_DISCOUNTS — cashier discount_rate > threshold of their sales
const checkExcessiveDiscounts = async (db: any, cfg: FraudConfig): Promise<OrderFraudAlert[]> => {
  if (await isRecentlyAlerted(db, 'excessive_discounts')) return [];
  const alerts: OrderFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         cashier.id AS user_id,
         cashier.name AS user_name,
         count() AS order_count,
         math::sum(total) AS total_sales,
         math::sum(discount_amount) AS total_discount
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND cashier IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY cashier
       FETCH cashier`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const totalSales = safeNumber(r.total_sales, 0);
      const totalDiscount = safeNumber(r.total_discount, 0);
      if (totalSales < 500) continue; // skip low-volume cashiers
      const discountRate = totalDiscount / totalSales;
      if (discountRate > cfg.discountThreshold) {
        const estLoss = totalDiscount - (totalSales * cfg.discountThreshold);
        alerts.push({
          rule_id: 'excessive_discounts',
          severity: discountRate > cfg.discountThreshold * 3 ? 'critical' : 'warning',
          user_id: r.user_id?.toString?.(),
          user_name: r.user_name,
          metric_value: discountRate,
          expected_value: cfg.discountThreshold,
          deviation_pct: Math.round((discountRate / cfg.discountThreshold - 1) * 100),
          estimated_loss: Math.max(0, estLoss),
          description: `Cashier "${r.user_name}" discounted ${r.order_count} orders totaling ${withCurrency(totalDiscount)} (${(discountRate * 100).toFixed(1)}% of sales, threshold ${(cfg.discountThreshold * 100).toFixed(1)}%). Pattern suggests comp abuse.`,
          context: {
            order_count: r.order_count,
            total_sales: totalSales,
            total_discount: totalDiscount,
            discount_rate: discountRate,
          },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[fraud] excessive_discounts failed', err); }
  return alerts;
};

// 2. CASH_DISCOUNT_PATTERN — orders paid cash AND discounted (classic comp-to-pocket-cash)
const checkCashDiscountPattern = async (db: any, cfg: FraudConfig): Promise<OrderFraudAlert[]> => {
  if (await isRecentlyAlerted(db, 'cash_discount_pattern')) return [];
  const alerts: OrderFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         cashier.id AS user_id,
         cashier.name AS user_name,
         total,
         discount_amount,
         created_at
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND discount_amount > 0
         AND cashier IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       FETCH cashier, payments.payment_type`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // Group by cashier: cash+discount orders
    const byCashier = new Map<string, { name: string; orders: any[]; totalDiscount: number; totalSales: number }>();
    for (const o of rows) {
      const payments = (o as any).payments ?? [];
      const isCash = payments.some((p: any) => {
        const pt = p?.payment_type;
        const name = typeof pt === 'object' ? pt?.name : pt;
        return name && /cash|gotovina/i.test(String(name));
      });
      if (!isCash) continue;
      const cid = o.user_id?.toString?.() ?? 'unknown';
      if (!byCashier.has(cid)) byCashier.set(cid, { name: o.user_name ?? 'Unknown', orders: [], totalDiscount: 0, totalSales: 0 });
      const entry = byCashier.get(cid)!;
      entry.orders.push(o);
      entry.totalDiscount += safeNumber(o.discount_amount, 0);
      entry.totalSales += safeNumber(o.total, 0);
    }
    for (const [cid, entry] of byCashier) {
      if (entry.orders.length < 3) continue; // need pattern
      const loss = entry.totalDiscount;
      alerts.push({
        rule_id: 'cash_discount_pattern',
        severity: loss > 200 ? 'critical' : 'warning',
        user_id: cid,
        user_name: entry.name,
        metric_value: entry.orders.length,
        expected_value: 0,
        deviation_pct: 100,
        estimated_loss: loss,
        description: `Cashier "${entry.name}" has ${entry.orders.length} cash orders WITH discounts totaling ${withCurrency(entry.totalDiscount)}. Pattern of comp-then-cash suggests pocketing.`,
        context: { order_count: entry.orders.length, total_discount: loss, total_sales: entry.totalSales },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[fraud] cash_discount_pattern failed', err); }
  return alerts;
};

// 3. AFTER_HOURS_ACTIVITY — orders/refunds during 22:00-06:00
const checkAfterHoursActivity = async (db: any, cfg: FraudConfig): Promise<OrderFraudAlert[]> => {
  if (await isRecentlyAlerted(db, 'after_hours_activity')) return [];
  const alerts: OrderFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         cashier.id AS user_id,
         cashier.name AS user_name,
         total,
         discount_amount,
         created_at
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND cashier IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       FETCH cashier`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const byCashier = new Map<string, { name: string; orders: any[]; totalSales: number }>();
    for (const o of rows) {
      const hour = new Date(o.created_at).getHours();
      const isAfterHours = hour >= cfg.afterHoursStart || hour < cfg.afterHoursEnd;
      if (!isAfterHours) continue;
      const cid = o.user_id?.toString?.() ?? 'unknown';
      if (!byCashier.has(cid)) byCashier.set(cid, { name: o.user_name ?? 'Unknown', orders: [], totalSales: 0 });
      const entry = byCashier.get(cid)!;
      entry.orders.push(o);
      entry.totalSales += safeNumber(o.total, 0);
    }
    for (const [cid, entry] of byCashier) {
      if (entry.orders.length < 2) continue;
      alerts.push({
        rule_id: 'after_hours_activity',
        severity: entry.orders.length >= 5 ? 'critical' : 'warning',
        user_id: cid,
        user_name: entry.name,
        metric_value: entry.orders.length,
        expected_value: 0,
        deviation_pct: 100,
        estimated_loss: entry.totalSales * 0.05, // estimate 5% at risk
        description: `Cashier "${entry.name}" processed ${entry.orders.length} orders during after-hours (${cfg.afterHoursStart}:00-${cfg.afterHoursEnd}:00) totaling ${withCurrency(entry.totalSales)}. Low-supervision window warrants review.`,
        context: { order_count: entry.orders.length, total_sales: entry.totalSales, after_hours: `${cfg.afterHoursStart}:00-${cfg.afterHoursEnd}:00` },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[fraud] after_hours_activity failed', err); }
  return alerts;
};

// 4. DUPLICATE_ORDERS — same total + items within 5 min
const checkDuplicateOrders = async (db: any, _cfg: FraudConfig): Promise<OrderFraudAlert[]> => {
  if (await isRecentlyAlerted(db, 'duplicate_orders')) return [];
  const alerts: OrderFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT id, total, cashier.id AS user_id, cashier.name AS user_name, customer, created_at
       FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE
         AND created_at > time::now() - 7d
       FETCH cashier`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // Group by total (rounded) + 5-min window
    const byBucket = new Map<string, any[]>();
    for (const o of rows) {
      const total = safeNumber(o.total, 0);
      if (total < 20) continue; // ignore tiny orders
      const bucketKey = `${Math.round(total)}_${Math.floor(new Date(o.created_at).getTime() / (5 * 60 * 1000))}`;
      if (!byBucket.has(bucketKey)) byBucket.set(bucketKey, []);
      byBucket.get(bucketKey)!.push(o);
    }
    for (const [, orders] of byBucket) {
      if (orders.length < 2) continue;
      const first = orders[0];
      const cid = first.user_id?.toString?.() ?? 'unknown';
      alerts.push({
        rule_id: 'duplicate_orders',
        severity: orders.length >= 3 ? 'critical' : 'warning',
        user_id: cid,
        user_name: first.user_name,
        order_id: first.id,
        metric_value: orders.length,
        expected_value: 1,
        deviation_pct: (orders.length - 1) * 100,
        estimated_loss: safeNumber(first.total, 0) * 0.5, // partial loss estimate
        description: `${orders.length} orders with identical total (${withCurrency(safeNumber(first.total, 0))}) within 5 minutes by "${first.user_name}". Could be test fraud or accidental duplicate charges.`,
        context: { order_count: orders.length, total: first.total, order_ids: orders.map(o => o.id) },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[fraud] duplicate_orders failed', err); }
  return alerts;
};

// 5. HIGH_REFUND_RATE — cashier refund rate > 3x average
const checkHighRefundRate = async (db: any, cfg: FraudConfig): Promise<OrderFraudAlert[]> => {
  if (await isRecentlyAlerted(db, 'high_refund_rate')) return [];
  const alerts: OrderFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         order.cashier.id AS user_id,
         order.cashier.name AS user_name,
         count() AS refunded_count
       FROM order_item
       WHERE is_refunded = true
         AND created_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY order.cashier
       FETCH order.cashier`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return alerts;
    const refundCounts = rows.map((r: any) => safeNumber(r.refunded_count, 0));
    const avg = refundCounts.reduce((a: number, b: number) => a + b, 0) / refundCounts.length;
    for (const r of rows) {
      const count = safeNumber(r.refunded_count, 0);
      if (avg > 0 && count > avg * cfg.refundMultiplier) {
        alerts.push({
          rule_id: 'high_refund_rate',
          severity: count > avg * cfg.refundMultiplier * 2 ? 'critical' : 'warning',
          user_id: r.user_id?.toString?.(),
          user_name: r.user_name,
          metric_value: count,
          expected_value: Math.round(avg),
          deviation_pct: Math.round((count / avg - 1) * 100),
          estimated_loss: count * 15, // estimate $15 avg per refund
          description: `Cashier "${r.user_name}" has ${count} refunded items in ${cfg.lookbackDays}d — ${cfg.refundMultiplier}x the staff average of ${Math.round(avg)}. High refund rate is a classic refund-fraud indicator.`,
          context: { refund_count: count, avg: Math.round(avg), multiplier: cfg.refundMultiplier },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[fraud] high_refund_rate failed', err); }
  return alerts;
};

// 6. SPLIT_TENDER_ANOMALY — split orders where cash < 10% of total
const checkSplitTenderAnomaly = async (db: any, cfg: FraudConfig): Promise<OrderFraudAlert[]> => {
  if (await isRecentlyAlerted(db, 'split_tender_anomaly')) return [];
  const alerts: OrderFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         cashier.id AS user_id,
         cashier.name AS user_name,
         total,
         split,
         payments,
         created_at
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND split > 1
         AND cashier IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       FETCH cashier, payments.payment_type`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const byCashier = new Map<string, { name: string; orders: any[]; totalCash: number; totalSales: number }>();
    for (const o of rows) {
      const payments = (o as any).payments ?? [];
      if (payments.length < 2) continue;
      let cashPortion = 0;
      let otherPortion = 0;
      for (const p of payments) {
        const amount = safeNumber(p.amount, 0);
        const pt = p?.payment_type;
        const name = typeof pt === 'object' ? pt?.name : pt;
        if (name && /cash|gotovina/i.test(String(name))) {
          cashPortion += amount;
        } else {
          otherPortion += amount;
        }
      }
      const total = safeNumber(o.total, 0);
      if (total === 0) continue;
      const cashRatio = cashPortion / total;
      // Suspicious: cash is tiny (< 10%) but card is large (under-reporting cash)
      if (cashRatio > 0 && cashRatio < 0.10 && otherPortion > 50) {
        const cid = o.user_id?.toString?.() ?? 'unknown';
        if (!byCashier.has(cid)) byCashier.set(cid, { name: o.user_name ?? 'Unknown', orders: [], totalCash: 0, totalSales: 0 });
        const entry = byCashier.get(cid)!;
        entry.orders.push(o);
        entry.totalCash += cashPortion;
        entry.totalSales += total;
      }
    }
    for (const [cid, entry] of byCashier) {
      if (entry.orders.length < 2) continue;
      const loss = entry.orders.length * 20; // estimate $20 under-reported per order
      alerts.push({
        rule_id: 'split_tender_anomaly',
        severity: entry.orders.length >= 4 ? 'critical' : 'warning',
        user_id: cid,
        user_name: entry.name,
        metric_value: entry.orders.length,
        expected_value: 0,
        deviation_pct: 100,
        estimated_loss: loss,
        description: `Cashier "${entry.name}" has ${entry.orders.length} split-tender orders where cash portion < 10% of total. Classic under-reporting pattern — small cash entry to avoid suspicion.`,
        context: { order_count: entry.orders.length, total_cash: entry.totalCash, total_sales: entry.totalSales },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[fraud] split_tender_anomaly failed', err); }
  return alerts;
};

// 7. LARGE_CASH_NEAR_CLOSE — cash orders > $200 within 30 min of close
const checkLargeCashNearClose = async (db: any, cfg: FraudConfig): Promise<OrderFraudAlert[]> => {
  if (await isRecentlyAlerted(db, 'large_cash_near_close')) return [];
  const alerts: OrderFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         cashier.id AS user_id,
         cashier.name AS user_name,
         total,
         created_at
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND cashier IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       FETCH cashier, payments.payment_type`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // We assume close at 23:00 if unknown — alert orders after (23:00 - closeMinutes)
    const closeHour = 23;
    const cutoffMinute = closeHour * 60 - cfg.closeMinutes;
    const byCashier = new Map<string, { name: string; orders: any[]; totalSales: number }>();
    for (const o of rows) {
      const total = safeNumber(o.total, 0);
      if (total < cfg.largeCashThreshold) continue;
      const payments = (o as any).payments ?? [];
      const isCash = payments.some((p: any) => {
        const pt = p?.payment_type;
        const name = typeof pt === 'object' ? pt?.name : pt;
        return name && /cash|gotovina/i.test(String(name));
      });
      if (!isCash) continue;
      const dt = new Date(o.created_at);
      const minutesOfDay = dt.getHours() * 60 + dt.getMinutes();
      if (minutesOfDay < cutoffMinute) continue;
      const cid = o.user_id?.toString?.() ?? 'unknown';
      if (!byCashier.has(cid)) byCashier.set(cid, { name: o.user_name ?? 'Unknown', orders: [], totalSales: 0 });
      const entry = byCashier.get(cid)!;
      entry.orders.push(o);
      entry.totalSales += total;
    }
    for (const [cid, entry] of byCashier) {
      if (entry.orders.length === 0) continue;
      alerts.push({
        rule_id: 'large_cash_near_close',
        severity: entry.orders.length >= 3 ? 'critical' : 'warning',
        user_id: cid,
        user_name: entry.name,
        metric_value: entry.orders.length,
        expected_value: 0,
        deviation_pct: 100,
        estimated_loss: entry.totalSales * 0.10, // estimate 10% at risk
        description: `Cashier "${entry.name}" processed ${entry.orders.length} large cash orders (≥ ${withCurrency(cfg.largeCashThreshold)}) within ${cfg.closeMinutes} min of close, totaling ${withCurrency(entry.totalSales)}. Cash pocketing risk at low supervision.`,
        context: { order_count: entry.orders.length, total_sales: entry.totalSales, threshold: cfg.largeCashThreshold },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[fraud] large_cash_near_close failed', err); }
  return alerts;
};

// Helper: currency formatter (local to avoid import cycle with utils)
const withCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: OrderFraudAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const prompt = `You are a restaurant fraud investigator.
Analyze these order-fraud alerts and provide insight + recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 15).map(a => ({
  rule: a.rule_id,
  severity: a.severity,
  user: a.user_name,
  metric: a.metric_value,
  expected: a.expected_value,
  loss: a.estimated_loss,
  description: a.description,
})), null, 2)}

Respond with JSON array:
[{
  "rule": "<match rule_id>",
  "insight": "<max 200 chars — what likely happened>",
  "recommendation": "investigate" | "audit_employee" | "review_camera" | "require_pin" | "restrict_perms" | "dismiss"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant fraud detection AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      rule: string; insight?: string; recommendation?: FraudRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[fraud] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runFraudDetection = async (
  db: ReturnType<typeof useDB>,
  config: FraudConfig = DEFAULT_FRAUD_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: OrderFraudAlert[]; checked: number }> => {
  const checks = [
    () => checkExcessiveDiscounts(db, config),
    () => checkCashDiscountPattern(db, config),
    () => checkAfterHoursActivity(db, config),
    () => checkDuplicateOrders(db, config),
    () => checkHighRefundRate(db, config),
    () => checkSplitTenderAnomaly(db, config),
    () => checkLargeCashNearClose(db, config),
  ];
  const total = checks.length;
  let allAlerts: OrderFraudAlert[] = [];

  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try {
      const alerts = await checks[i]();
      allAlerts.push(...alerts);
    } catch (err) { console.warn('[fraud] check failed at', i, err); }
  }

  if (config.aiEnabled && allAlerts.length > 0) {
    await enhanceWithAI(allAlerts);
  }

  // Persist
  for (const alert of allAlerts) {
    try {
      await db.query(`CREATE order_fraud_alert CONTENT $data`, {
        data: { ...alert, detected_at: alert.detected_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(total, total);
  return { alerts: allAlerts, checked: total };
};

// ---------------------------------------------------------------------------
// Read + update
// ---------------------------------------------------------------------------

export const getOpenFraudAlerts = async (
  db: ReturnType<typeof useDB>
): Promise<OrderFraudAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM order_fraud_alert WHERE status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       estimated_loss DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getFraudSummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  total: number;
  critical: number;
  warning: number;
  totalLoss: number;
  flaggedUsers: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(severity = 'warning') AS warning,
         math::sum(estimated_loss) AS total_loss,
         math::count(DISTINCT user_id) AS flagged_users
       FROM order_fraud_alert WHERE status = 'open'
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      warning: safeNumber(row.warning, 0),
      totalLoss: safeNumber(row.total_loss, 0),
      flaggedUsers: safeNumber(row.flagged_users, 0),
    };
  } catch {
    return { total: 0, critical: 0, warning: 0, totalLoss: 0, flaggedUsers: 0 };
  }
};

export const updateFraudStatus = async (
  db: ReturnType<typeof useDB>, alertId: string, status: string
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
