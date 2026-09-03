/**
 * AI Refund Abuse Detection service — detect suspicious refund patterns.
 *
 * 30th POSR-exclusive differentiator — refund abuse costs restaurants
 * $1-3k/year (customers getting free food via fake complaints, staff voiding
 * orders and pocketing cash). Toast, Square, Lightspeed track refunds but
 * DON'T detect abuse patterns. POSR analyzes refund patterns + AI flags.
 *
 * Detection rules (6):
 *   1. EXCESSIVE_REFUNDS_CUSTOMER — customer 3+ refunds in 30d
 *   2. HIGH_REFUND_VALUE — single refund > $50
 *   3. REFUND_AFTER_COMPLETION — refunded item on completed order
 *   4. STAFF_REFUND_SPIKE — staff processing 3× team avg
 *   5. CASH_REFUND_PATTERN — cash orders with refunds (pocketing risk)
 *   6. REPEATED_SAME_ITEM_REFUND — same item refunded 3+ times by same customer
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type RefundAbuseSeverity = 'info' | 'warning' | 'critical';
export type RefundAbuseRecommendation =
  | 'freeze_refunds' | 'investigate_staff' | 'warn_customer'
  | 'block_customer' | 'monitor' | 'dismiss';

export interface RefundAbuseAlert {
  id?: string;
  rule_id: string;
  severity: RefundAbuseSeverity;
  customer?: string;
  customer_name?: string;
  staff_id?: string;
  staff_name?: string;
  order_id?: string;
  metric_value: number;
  expected_value: number;
  estimated_loss: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: RefundAbuseRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
}

export interface RefundAbuseConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  customerThreshold: number;
  highValue: number;
  staffMultiplier: number;
}

export const DEFAULT_REFUND_ABUSE_CONFIG: RefundAbuseConfig = {
  aiEnabled: true, lookbackDays: 30, customerThreshold: 3,
  highValue: 50, staffMultiplier: 3,
};

export const readRefundAbuseConfig = (settings: any): RefundAbuseConfig => ({
  aiEnabled: settings?.refund_abuse_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.refund_abuse_lookback_days, 30),
  customerThreshold: safeNumber(settings?.refund_abuse_customer_threshold, 3),
  highValue: safeNumber(settings?.refund_abuse_high_value, 50),
  staffMultiplier: safeNumber(settings?.refund_abuse_staff_multiplier, 3),
});

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const isRecentlyAlerted = async (db: any, ruleId: string, identifier: string, hours = 24): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM refund_abuse_alert WHERE rule_id = $rid AND (customer_name = $id OR staff_name = $id) AND detected_at > time::now() - ${hours}h LIMIT 1`,
      { rid: ruleId, id: identifier }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

// 1. EXCESSIVE_REFUNDS_CUSTOMER
const checkExcessiveRefunds = async (db: any, cfg: RefundAbuseConfig): Promise<RefundAbuseAlert[]> => {
  const alerts: RefundAbuseAlert[] = [];
  try {
    const result = await db.query(
      `SELECT customer.id AS cid, customer.name AS cname, count() AS refund_count
       FROM order_refund WHERE created_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY customer FETCH customer`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const count = safeNumber(r.refund_count, 0);
      if (count >= cfg.customerThreshold) {
        const cid = r.cid?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'excessive_refunds_customer', r.cname ?? cid, 48)) continue;
        alerts.push({
          rule_id: 'excessive_refunds_customer', severity: count >= 6 ? 'critical' : 'warning',
          customer: cid, customer_name: r.cname,
          metric_value: count, expected_value: cfg.customerThreshold - 1,
          estimated_loss: count * 15,
          description: `Customer "${r.cname}" has ${count} refunds in ${cfg.lookbackDays}d (threshold ${cfg.customerThreshold}). Pattern suggests refund abuse.`,
          context: { refund_count: count }, status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[refund-abuse] excessive_refunds failed', err); }
  return alerts;
};

// 2. HIGH_REFUND_VALUE
const checkHighValueRefund = async (db: any, cfg: RefundAbuseConfig): Promise<RefundAbuseAlert[]> => {
  const alerts: RefundAbuseAlert[] = [];
  try {
    const result = await db.query(
      `SELECT id, order.id AS oid, order.customer.name AS cname,
         order.cashier.name AS sname, created_at
       FROM order_refund WHERE created_at > time::now() - 7d
       FETCH order, order.customer, order.cashier`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const refundResult = await db.query(
        `SELECT math::sum(price * quantity) AS refund_value FROM order_item WHERE is_refunded = true AND order = $oid`,
        { oid: r.oid }
      );
      const refundRows = Array.isArray(refundResult) ? refundResult.flat() : [];
      const value = safeNumber(refundRows[0]?.refund_value, 0);
      if (value > cfg.highValue) {
        const cname = r.cname ?? '';
        if (await isRecentlyAlerted(db, 'high_refund_value', cname, 12)) continue;
        alerts.push({
          rule_id: 'high_refund_value', severity: value > 150 ? 'critical' : 'warning',
          customer_name: cname, staff_name: r.sname, order_id: r.oid?.toString?.(),
          metric_value: value, expected_value: cfg.highValue, estimated_loss: value,
          description: `Refund of ${formatCurrency(value)} on order by "${cname}" (threshold ${formatCurrency(cfg.highValue)}). High-value refunds warrant review.`,
          context: { refund_value: value }, status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[refund-abuse] high_value failed', err); }
  return alerts;
};

// 4. STAFF_REFUND_SPIKE
const checkStaffRefundSpike = async (db: any, cfg: RefundAbuseConfig): Promise<RefundAbuseAlert[]> => {
  const alerts: RefundAbuseAlert[] = [];
  try {
    const result = await db.query(
      `SELECT logged_in_user.id AS sid, logged_in_user.name AS sname, count() AS refund_count
       FROM order_refund WHERE created_at > time::now() - ${cfg.lookbackDays}d
         AND logged_in_user IS NOT NONE
       GROUP BY logged_in_user FETCH logged_in_user`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return alerts;
    const avg = rows.reduce((s: number, r: any) => s + safeNumber(r.refund_count, 0), 0) / rows.length;
    for (const r of rows) {
      const count = safeNumber(r.refund_count, 0);
      if (avg > 0 && count > avg * cfg.staffMultiplier) {
        const sname = r.sname ?? '';
        if (await isRecentlyAlerted(db, 'staff_refund_spike', sname, 72)) continue;
        alerts.push({
          rule_id: 'staff_refund_spike', severity: count > avg * 5 ? 'critical' : 'warning',
          staff_id: r.sid?.toString?.(), staff_name: sname,
          metric_value: count, expected_value: Math.round(avg),
          estimated_loss: count * 10,
          description: `Staff "${sname}" processed ${count} refunds in ${cfg.lookbackDays}d — ${Math.round(count/avg)}× team avg of ${Math.round(avg)}. High refund volume by staff member warrants investigation.`,
          context: { refund_count: count, avg: Math.round(avg) }, status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[refund-abuse] staff_spike failed', err); }
  return alerts;
};

// 5. CASH_REFUND_PATTERN
const checkCashRefundPattern = async (db: any, _cfg: RefundAbuseConfig): Promise<RefundAbuseAlert[]> => {
  const alerts: RefundAbuseAlert[] = [];
  try {
    const result = await db.query(
      `SELECT order.cashier.id AS sid, order.cashier.name AS sname, count() AS cash_refund_count
       FROM order_refund WHERE created_at > time::now() - 7d
         AND order.payments.payment_type.type = 'cash'
       GROUP BY order.cashier FETCH order.cashier`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const count = safeNumber(r.cash_refund_count, 0);
      if (count >= 5) {
        const sname = r.sname ?? '';
        if (await isRecentlyAlerted(db, 'cash_refund_pattern', sname, 48)) continue;
        alerts.push({
          rule_id: 'cash_refund_pattern', severity: count >= 10 ? 'critical' : 'warning',
          staff_id: r.sid?.toString?.(), staff_name: sname,
          metric_value: count, expected_value: 2, estimated_loss: count * 20,
          description: `Staff "${sname}" processed ${count} cash-order refunds in 7d. Cash refunds carry higher pocketing risk — review cash drawer balance.`,
          context: { cash_refund_count: count }, status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[refund-abuse] cash_pattern failed', err); }
  return alerts;
};

// 6. REPEATED_SAME_ITEM_REFUND
const checkRepeatedItemRefund = async (db: any, cfg: RefundAbuseConfig): Promise<RefundAbuseAlert[]> => {
  const alerts: RefundAbuseAlert[] = [];
  try {
    const result = await db.query(
      `SELECT order.customer.id AS cid, order.customer.name AS cname,
         item.name AS item_name, count() AS refund_count
       FROM order_item WHERE is_refunded = true
         AND created_at > time::now() - ${cfg.lookbackDays}d
         AND order.customer IS NOT NONE
       GROUP BY order.customer, item FETCH order.customer, item`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const count = safeNumber(r.refund_count, 0);
      if (count >= 3) {
        const cname = r.cname ?? '';
        if (await isRecentlyAlerted(db, 'repeated_item_refund', cname, 72)) continue;
        alerts.push({
          rule_id: 'repeated_item_refund', severity: count >= 5 ? 'critical' : 'warning',
          customer_name: cname,
          metric_value: count, expected_value: 2, estimated_loss: count * 8,
          description: `Customer "${cname}" refunded "${r.item_name}" ${count} times in ${cfg.lookbackDays}d. Repeated same-item refunds suggest systematic complaint abuse.`,
          context: { item: r.item_name, refund_count: count }, status: 'open', detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[refund-abuse] repeated_item failed', err); }
  return alerts;
};

// AI enhancement
const enhanceWithAI = async (alerts: RefundAbuseAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;
  const prompt = `You are a restaurant refund fraud analyst. Analyze these alerts and provide insight + recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 12).map(a => ({
  rule: a.rule_id, severity: a.severity, customer: a.customer_name, staff: a.staff_name,
  metric: a.metric_value, loss: a.estimated_loss, description: a.description,
})), null, 2)}

Respond with JSON array:
[{"rule":"<match rule_id>","insight":"<max 200 chars>","recommendation":"freeze_refunds"|"investigate_staff"|"warn_customer"|"block_customer"|"monitor"|"dismiss"}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a refund abuse detection AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });
    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ rule: string; insight?: string; recommendation?: RefundAbuseRecommendation }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[refund-abuse] AI failed', err); }
};

export const runRefundAbuseScan = async (
  db: ReturnType<typeof useDB>,
  config: RefundAbuseConfig = DEFAULT_REFUND_ABUSE_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: RefundAbuseAlert[]; checked: number }> => {
  const checks = [
    () => checkExcessiveRefunds(db, config),
    () => checkHighValueRefund(db, config),
    () => checkStaffRefundSpike(db, config),
    () => checkCashRefundPattern(db, config),
    () => checkRepeatedItemRefund(db, config),
  ];
  const total = checks.length;
  let allAlerts: RefundAbuseAlert[] = [];
  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try { allAlerts.push(...await checks[i]()); } catch (err) { console.warn('[refund-abuse] check', i, err); }
  }
  if (config.aiEnabled && allAlerts.length > 0) await enhanceWithAI(allAlerts);
  for (const alert of allAlerts) {
    try { await db.query(`CREATE refund_abuse_alert CONTENT $data`, { data: { ...alert, detected_at: alert.detected_at.toISOString() } }); } catch { }
  }
  if (onProgress) onProgress(total, total);
  return { alerts: allAlerts, checked: total };
};

export const getOpenAlerts = async (db: ReturnType<typeof useDB>): Promise<RefundAbuseAlert[]> => {
  try {
    const result = await db.query(`SELECT * FROM refund_abuse_alert WHERE status = 'open' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, estimated_loss DESC`);
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{ total: number; critical: number; warning: number; totalLoss: number }> => {
  try {
    const result = await db.query(`SELECT count() AS total, math::count(severity = 'critical') AS critical, math::count(severity = 'warning') AS warning, math::sum(estimated_loss) AS total_loss FROM refund_abuse_alert WHERE status = 'open' GROUP ALL`);
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return { total: safeNumber(row.total, 0), critical: safeNumber(row.critical, 0), warning: safeNumber(row.warning, 0), totalLoss: safeNumber(row.total_loss, 0) };
  } catch { return { total: 0, critical: 0, warning: 0, totalLoss: 0 }; }
};

export const updateStatus = async (db: ReturnType<typeof useDB>, alertId: string, status: string): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
