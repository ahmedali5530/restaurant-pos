/**
 * AI Promotion & Loyalty Abuse Detection service — fraud pattern detection.
 *
 * 15th POSR-exclusive differentiator — Toast and Square have basic redemption
 * limits but NO abuse-pattern AI. Restaurants lose $2-5k/year to promotion/
 * loyalty abuse (coupon stacking, fake accounts, points farming, gift card
 * recycling). POSR analyzes redemption patterns + AI flags suspicious activity.
 *
 * Detection rules (7):
 *   1. RAPID_REDEMPTION    — customer redeems 3+ coupons in 24h
 *   2. SELF_REFERRAL       — customer refers self via multiple emails
 *   3. POINTS_FARMING      — earn + immediate redeem in pattern (no real spend)
 *   4. GIFT_CARD_RECYCLING — gift card redeemed, refunded, re-issued (loop)
 *   5. COUPON_STACKING     — multiple discounts on one order exceeding limits
 *   6. FAKE_ACCOUNT_FARM   — multiple customers from same phone/email redeeming
 *   7. STAFF_DISCOUNT_ABUSE — staff using employee discount for non-staff orders
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromoAbuseSeverity = 'info' | 'warning' | 'critical';
export type PromoAbuseRecommendation =
  | 'block_customer' | 'freeze_points' | 'void_redemption' | 'require_verification'
  | 'review_manually' | 'dismiss';

export interface PromoAbuseAlert {
  id?: string;
  rule_id: string;
  severity: PromoAbuseSeverity;
  customer?: string;
  customer_name?: string;
  staff_id?: string;
  staff_name?: string;
  order_id?: string;
  coupon_code?: string;
  gift_card_code?: string;
  metric_value: number;
  expected_value: number;
  deviation_pct: number;
  estimated_loss: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: PromoAbuseRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
  branch_id?: string;
}

export interface PromoAbuseConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  rapidRedeemThreshold: number;
  pointsFarmWindowH: number;
  stackingPct: number;
  highRiskThreshold: number;
}

export const DEFAULT_PROMO_ABUSE_CONFIG: PromoAbuseConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  rapidRedeemThreshold: 3,
  pointsFarmWindowH: 2,
  stackingPct: 0.30,
  highRiskThreshold: 65,
};

export const readPromoAbuseConfig = (settings: any): PromoAbuseConfig => ({
  aiEnabled: settings?.promo_abuse_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.promo_abuse_lookback_days, 30),
  rapidRedeemThreshold: safeNumber(settings?.promo_abuse_rapid_redeem_threshold, 3),
  pointsFarmWindowH: safeNumber(settings?.promo_abuse_points_farm_window_h, 2),
  stackingPct: safeNumber(settings?.promo_abuse_stacking_pct, 0.30),
  highRiskThreshold: safeNumber(settings?.promo_abuse_high_risk_threshold, 65),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isRecentlyAlerted = async (
  db: ReturnType<typeof useDB>,
  ruleId: string,
  customerId: string,
  hours = 24
): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM promo_abuse_alert
       WHERE rule_id = $ruleId AND customer = $cid
         AND detected_at > time::now() - ${hours}h
       LIMIT 1`,
      { ruleId, cid: customerId }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

// 1. RAPID_REDEMPTION — customer redeems 3+ coupons in 24h
const checkRapidRedemption = async (db: any, cfg: PromoAbuseConfig): Promise<PromoAbuseAlert[]> => {
  const alerts: PromoAbuseAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         customer.id AS customer_id,
         customer.name AS customer_name,
         count() AS redemption_count,
         math::sum(discount_amount) AS total_discount
       FROM coupon_redemption
       WHERE redeemed_at > time::now() - 24h
         AND customer IS NOT NONE
       GROUP BY customer
       FETCH customer`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const count = safeNumber(r.redemption_count, 0);
      if (count >= cfg.rapidRedeemThreshold) {
        const customerId = r.customer_id?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'rapid_redemption', customerId, 24)) continue;
        const loss = safeNumber(r.total_discount, 0);
        alerts.push({
          rule_id: 'rapid_redemption',
          severity: count >= cfg.rapidRedeemThreshold * 2 ? 'critical' : 'warning',
          customer: customerId,
          customer_name: r.customer_name,
          metric_value: count,
          expected_value: cfg.rapidRedeemThreshold - 1,
          deviation_pct: Math.round((count / Math.max(1, cfg.rapidRedeemThreshold - 1) - 1) * 100),
          estimated_loss: loss,
          description: `Customer "${r.customer_name}" redeemed ${count} coupons in 24h (threshold ${cfg.rapidRedeemThreshold}). Total discount: ${formatCurrency(loss)}. Rapid redemption pattern suggests abuse.`,
          context: { redemption_count: count, total_discount: loss },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[promo-abuse] rapid_redemption failed', err); }
  return alerts;
};

// 2. SELF_REFERRAL — customer refers self via multiple emails
const checkSelfReferral = async (db: any, _cfg: PromoAbuseConfig): Promise<PromoAbuseAlert[]> => {
  const alerts: PromoAbuseAlert[] = [];
  try {
    // Find customers with same phone but different emails (potential self-referral)
    const result = await db.query(
      `SELECT
         phone,
         count() AS email_count,
         array::group(name) AS names,
         array::group(email) AS emails
       FROM customer
       WHERE phone IS NOT NONE
         AND phone != ''
       GROUP BY phone`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const emailCount = safeNumber(r.email_count, 0);
      if (emailCount >= 2) {
        const customerId = r.phone?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'self_referral', customerId, 48)) continue;
        alerts.push({
          rule_id: 'self_referral',
          severity: emailCount >= 3 ? 'critical' : 'warning',
          customer_name: Array.isArray(r.names) ? r.names[0] : 'Unknown',
          metric_value: emailCount,
          expected_value: 1,
          deviation_pct: Math.round((emailCount - 1) * 100),
          estimated_loss: emailCount * 10, // estimate $10 per fake referral
          description: `Phone "${r.phone}" has ${emailCount} customer accounts (emails: ${Array.isArray(r.emails) ? r.emails.join(', ') : 'unknown'}). Potential self-referral abuse.`,
          context: { phone: r.phone, email_count: emailCount, emails: r.emails },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[promo-abuse] self_referral failed', err); }
  return alerts;
};

// 3. POINTS_FARMING — earn + immediate redeem in pattern (no real spend)
const checkPointsFarming = async (db: any, cfg: PromoAbuseConfig): Promise<PromoAbuseAlert[]> => {
  const alerts: PromoAbuseAlert[] = [];
  try {
    // Find loyalty members with earn→redeem cycles within short window
    const result = await db.query(
      `SELECT
         member.id AS member_id,
         customer.name AS customer_name,
         count() AS cycle_count,
         math::sum(amount) AS total_earned,
         math::sum(-points) AS total_redeemed
       FROM loyalty_transaction
       WHERE type IN ['earn', 'redeem']
         AND created_at > time::now() - ${cfg.lookbackDays}d
         AND member IS NOT NONE
       GROUP BY member
       FETCH member, member.customer`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const cycleCount = safeNumber(r.cycle_count, 0);
      const totalEarned = safeNumber(r.total_earned, 0);
      const totalRedeemed = safeNumber(r.total_redeemed, 0);
      // Farming pattern: redeemed ≥ 90% of earned, many small cycles
      if (cycleCount >= 10 && totalEarned > 0 && totalRedeemed / totalEarned > 0.9) {
        const customerId = r.member_id?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'points_farming', customerId, 48)) continue;
        alerts.push({
          rule_id: 'points_farming',
          severity: cycleCount >= 20 ? 'critical' : 'warning',
          customer: r.member?.customer?.id?.toString?.(),
          customer_name: r.customer_name,
          metric_value: cycleCount,
          expected_value: 5,
          deviation_pct: Math.round((cycleCount / 5 - 1) * 100),
          estimated_loss: totalRedeemed * 0.01, // $0.01 per point (default conversion)
          description: `Member "${r.customer_name}" has ${cycleCount} earn/redeem transactions — redeemed ${Math.round(totalRedeemed)} pts out of ${Math.round(totalEarned)} earned (${Math.round(totalRedeemed/totalEarned*100)}%). Farming pattern detected.`,
          context: { cycle_count: cycleCount, total_earned: totalEarned, total_redeemed: totalRedeemed },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[promo-abuse] points_farming failed', err); }
  return alerts;
};

// 4. GIFT_CARD_RECYCLING — gift card redeemed, refunded, re-issued (loop)
const checkGiftCardRecycling = async (db: any, cfg: PromoAbuseConfig): Promise<PromoAbuseAlert[]> => {
  const alerts: PromoAbuseAlert[] = [];
  try {
    // Find gift cards with multiple transactions (issue → redeem → refund → redeem pattern)
    const result = await db.query(
      `SELECT
         gift_card.id AS card_id,
         gift_card.code AS card_code,
         gift_card.customer AS customer,
         count() AS txn_count,
         math::sum(amount) AS total_flow
       FROM gift_card_transaction
       WHERE created_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY gift_card
       FETCH gift_card`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const txnCount = safeNumber(r.txn_count, 0);
      if (txnCount >= 5) { // 5+ transactions on one card = suspicious recycling
        const customerId = r.customer?.id?.toString?.() ?? r.customer_id?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'gift_card_recycling', customerId, 48)) continue;
        alerts.push({
          rule_id: 'gift_card_recycling',
          severity: txnCount >= 10 ? 'critical' : 'warning',
          gift_card_code: r.card_code,
          customer: customerId,
          metric_value: txnCount,
          expected_value: 2, // normal: 1 issue + 1-2 redemptions
          deviation_pct: Math.round((txnCount / 2 - 1) * 100),
          estimated_loss: safeNumber(r.total_flow, 0) * 0.1,
          description: `Gift card "${r.card_code}" has ${txnCount} transactions — excessive activity suggests recycling loop (issue→redeem→refund→redeem).`,
          context: { card_code: r.card_code, txn_count: txnCount, total_flow: r.total_flow },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[promo-abuse] gift_card_recycling failed', err); }
  return alerts;
};

// 5. COUPON_STACKING — multiple discounts on one order exceeding limits
const checkCouponStacking = async (db: any, cfg: PromoAbuseConfig): Promise<PromoAbuseAlert[]> => {
  const alerts: PromoAbuseAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         id, total,
         customer.id AS customer_id,
         customer.name AS customer_name,
         discount_amount,
         math::sum(discount_amount) AS total_discount,
         count() AS discount_count
       FROM order_discount
       WHERE created_at > time::now() - 7d
       GROUP BY order
       FETCH order.customer`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const discountCount = safeNumber(r.discount_count, 0);
      const totalDiscount = safeNumber(r.total_discount, 0);
      const orderTotal = safeNumber(r.total, 0);
      if (orderTotal === 0) continue;
      const discountPct = totalDiscount / orderTotal;
      if (discountPct > cfg.stackingPct && discountCount >= 2) {
        const customerId = r.customer_id?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'coupon_stacking', customerId, 12)) continue;
        alerts.push({
          rule_id: 'coupon_stacking',
          severity: discountPct > 0.5 ? 'critical' : 'warning',
          customer: customerId,
          customer_name: r.customer_name,
          order_id: r.id?.toString?.(),
          metric_value: discountPct,
          expected_value: cfg.stackingPct,
          deviation_pct: Math.round((discountPct / cfg.stackingPct - 1) * 100),
          estimated_loss: totalDiscount,
          description: `Order has ${discountCount} discounts totaling ${formatCurrency(totalDiscount)} — ${(discountPct * 100).toFixed(0)}% of order (${formatCurrency(orderTotal)}). Stacking exceeds ${(cfg.stackingPct * 100).toFixed(0)}% limit.`,
          context: { discount_count: discountCount, total_discount: totalDiscount, order_total: orderTotal },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[promo-abuse] coupon_stacking failed', err); }
  return alerts;
};

// 6. FAKE_ACCOUNT_FARM — multiple customers from same phone/email redeeming
const checkFakeAccountFarm = async (db: any, _cfg: PromoAbuseConfig): Promise<PromoAbuseAlert[]> => {
  // This overlaps with SELF_REFERRAL — focus on redemption patterns here
  const alerts: PromoAbuseAlert[] = [];
  try {
    // Find customers with same email but different IDs who all redeemed coupons
    const result = await db.query(
      `SELECT
         email,
         count() AS account_count,
         array::group(name) AS names,
         count(order.id) AS redemption_count
       FROM customer
       LEFT JOIN coupon_redemption ON coupon_redemption.customer = customer.id
       WHERE customer.email IS NOT NONE
         AND customer.email != ''
       GROUP BY customer.email
       HAVING count() > 1`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const accountCount = safeNumber(r.account_count, 0);
      if (accountCount >= 2) {
        const customerId = r.email?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'fake_account_farm', customerId, 48)) continue;
        alerts.push({
          rule_id: 'fake_account_farm',
          severity: accountCount >= 4 ? 'critical' : 'warning',
          customer_name: Array.isArray(r.names) ? r.names[0] : 'Unknown',
          metric_value: accountCount,
          expected_value: 1,
          deviation_pct: Math.round((accountCount - 1) * 100),
          estimated_loss: accountCount * 15, // estimate $15 per fake account
          description: `Email "${r.email}" has ${accountCount} accounts (${Array.isArray(r.names) ? r.names.slice(0, 3).join(', ') : 'unknown'}). Multiple accounts from same email — potential fake account farm.`,
          context: { email: r.email, account_count: accountCount, names: r.names },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[promo-abuse] fake_account_farm failed', err); }
  return alerts;
};

// 7. STAFF_DISCOUNT_ABUSE — staff using employee discount for non-staff orders
const checkStaffDiscountAbuse = async (db: any, cfg: PromoAbuseConfig): Promise<PromoAbuseAlert[]> => {
  const alerts: PromoAbuseAlert[] = [];
  try {
    // Find orders where staff discount applied but customer is not staff
    const result = await db.query(
      `SELECT
         id, total,
         cashier.id AS staff_id,
         cashier.name AS staff_name,
         customer.id AS customer_id,
         customer.name AS customer_name,
         discount_amount,
         order_discount
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND discount_amount > 0
         AND cashier IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       FETCH cashier, customer
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const byStaff = new Map<string, { name: string; orders: any[]; totalDiscount: number }>();
    for (const r of rows) {
      // Heuristic: if cashier applies discount AND customer is different from cashier, suspect
      const cashierId = r.staff_id?.toString?.() ?? '';
      const customerId = r.customer_id?.toString?.() ?? '';
      if (!cashierId || cashierId === customerId) continue;
      if (!byStaff.has(cashierId)) byStaff.set(cashierId, { name: r.staff_name ?? 'Unknown', orders: [], totalDiscount: 0 });
      const entry = byStaff.get(cashierId)!;
      entry.orders.push(r);
      entry.totalDiscount += safeNumber(r.discount_amount, 0);
    }
    for (const [staffId, entry] of byStaff) {
      if (entry.orders.length >= 5 && entry.totalDiscount > 100) {
        if (await isRecentlyAlerted(db, 'staff_discount_abuse', staffId, 48)) continue;
        alerts.push({
          rule_id: 'staff_discount_abuse',
          severity: entry.orders.length >= 10 ? 'critical' : 'warning',
          staff_id: staffId,
          staff_name: entry.name,
          metric_value: entry.orders.length,
          expected_value: 2,
          deviation_pct: Math.round((entry.orders.length / 2 - 1) * 100),
          estimated_loss: entry.totalDiscount,
          description: `Staff "${entry.name}" applied discounts to ${entry.orders.length} orders for non-staff customers — total discount ${formatCurrency(entry.totalDiscount)}. Pattern suggests discount abuse.`,
          context: { order_count: entry.orders.length, total_discount: entry.totalDiscount },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[promo-abuse] staff_discount_abuse failed', err); }
  return alerts;
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: PromoAbuseAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const prompt = `You are a restaurant promotion fraud analyst.
Analyze these promo-abuse alerts and provide insight + recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 12).map(a => ({
  rule: a.rule_id,
  severity: a.severity,
  customer: a.customer_name,
  staff: a.staff_name,
  metric: a.metric_value,
  loss: a.estimated_loss,
  description: a.description,
})), null, 2)}

Respond with JSON array:
[{
  "rule": "<match rule_id>",
  "insight": "<max 200 chars — abuse mechanism + impact>",
  "recommendation": "block_customer" | "freeze_points" | "void_redemption" | "require_verification" | "review_manually" | "dismiss"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a promo abuse detection AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      rule: string; insight?: string; recommendation?: PromoAbuseRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[promo-abuse] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runPromoAbuseScan = async (
  db: ReturnType<typeof useDB>,
  config: PromoAbuseConfig = DEFAULT_PROMO_ABUSE_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: PromoAbuseAlert[]; checked: number }> => {
  const checks = [
    () => checkRapidRedemption(db, config),
    () => checkSelfReferral(db, config),
    () => checkPointsFarming(db, config),
    () => checkGiftCardRecycling(db, config),
    () => checkCouponStacking(db, config),
    () => checkFakeAccountFarm(db, config),
    () => checkStaffDiscountAbuse(db, config),
  ];
  const total = checks.length;
  let allAlerts: PromoAbuseAlert[] = [];

  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try {
      const alerts = await checks[i]();
      allAlerts.push(...alerts);
    } catch (err) { console.warn('[promo-abuse] check failed at', i, err); }
  }

  if (config.aiEnabled && allAlerts.length > 0) {
    await enhanceWithAI(allAlerts);
  }

  // Persist
  for (const alert of allAlerts) {
    try {
      await db.query(`CREATE promo_abuse_alert CONTENT $data`, {
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

export const getOpenPromoAbuseAlerts = async (
  db: ReturnType<typeof useDB>
): Promise<PromoAbuseAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM promo_abuse_alert WHERE status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       estimated_loss DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getPromoAbuseSummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  total: number;
  critical: number;
  warning: number;
  totalLoss: number;
  flaggedCustomers: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(severity = 'warning') AS warning,
         math::sum(estimated_loss) AS total_loss,
         math::count(DISTINCT customer) AS flagged_customers
       FROM promo_abuse_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      warning: safeNumber(row.warning, 0),
      totalLoss: safeNumber(row.total_loss, 0),
      flaggedCustomers: safeNumber(row.flagged_customers, 0),
    };
  } catch {
    return { total: 0, critical: 0, warning: 0, totalLoss: 0, flaggedCustomers: 0 };
  }
};

export const updatePromoAbuseStatus = async (
  db: ReturnType<typeof useDB>, alertId: string, status: string
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
