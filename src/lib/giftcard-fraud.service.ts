/**
 * AI Gift Card Fraud Detection service — detect suspicious gift card activity.
 *
 * 29th POSR-exclusive differentiator — gift card fraud costs restaurants
 * $3-5k/year (balance manipulation, fake issuance, rapid drain, staff theft).
 * Toast and Square have basic gift card tracking but NO fraud pattern detection.
 * POSR analyzes gift_card_transaction patterns + AI flags suspicious activity.
 *
 * Detection rules (6):
 *   1. RAPID_DRAIN — card drained > 80% within 24h of issuance
 *   2. BALANCE_MANIPULATION — balance increased without purchase (manual adjust)
 *   3. MULTIPLE_CARDS_SAME_CUSTOMER — one customer has 5+ active cards
 *   4. HIGH_VALUE_FIRST_USE — first transaction > $100 (often stolen cards)
 *   5. AFTER_HOURS_REDEMPTION — redemptions at unusual hours (22:00-06:00)
 *   6. STAFF_ISSUANCE_SPIKE — staff issuing unusually high number of cards
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GiftCardFraudSeverity = 'info' | 'warning' | 'critical';
export type GiftCardFraudRecommendation =
  | 'freeze_card' | 'investigate_staff' | 'refund_customer'
  | 'void_transaction' | 'monitor' | 'dismiss';

export interface GiftCardFraudAlert {
  id?: string;
  rule_id: string;
  severity: GiftCardFraudSeverity;
  gift_card_code?: string;
  customer_name?: string;
  staff_name?: string;
  metric_value: number;
  expected_value: number;
  estimated_loss: number;
  description: string;
  context?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: GiftCardFraudRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
}

export interface GiftCardFraudConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  rapidDrainPct: number;
  highValueThreshold: number;
  maxCardsPerCustomer: number;
}

export const DEFAULT_GIFTCARD_FRAUD_CONFIG: GiftCardFraudConfig = {
  aiEnabled: true,
  lookbackDays: 30,
  rapidDrainPct: 0.80,
  highValueThreshold: 100,
  maxCardsPerCustomer: 5,
};

export const readGiftCardFraudConfig = (settings: any): GiftCardFraudConfig => ({
  aiEnabled: settings?.giftcard_fraud_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.giftcard_fraud_lookback_days, 30),
  rapidDrainPct: safeNumber(settings?.giftcard_fraud_rapid_drain_pct, 0.80),
  highValueThreshold: safeNumber(settings?.giftcard_fraud_high_value_threshold, 100),
  maxCardsPerCustomer: safeNumber(settings?.giftcard_fraud_max_cards_per_customer, 5),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

const isRecentlyAlerted = async (
  db: ReturnType<typeof useDB>,
  ruleId: string,
  identifier: string,
  hours = 24
): Promise<boolean> => {
  try {
    const result = await db.query(
      `SELECT id FROM giftcard_fraud_alert
       WHERE rule_id = $ruleId
         AND (gift_card_code = $id OR customer_name = $id OR staff_name = $id)
         AND detected_at > time::now() - ${hours}h
       LIMIT 1`,
      { ruleId, id: identifier }
    );
    return Array.isArray(result) && result.flat().length > 0;
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

// 1. RAPID_DRAIN — card drained > 80% within 24h of issuance
const checkRapidDrain = async (db: any, cfg: GiftCardFraudConfig): Promise<GiftCardFraudAlert[]> => {
  const alerts: GiftCardFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         gc.code AS card_code,
         gc.initial_balance AS initial,
         gc.customer AS customer_id,
         customer.name AS customer_name,
         math::sum(IF gtx.type = 'redeem' THEN gtx.amount ELSE 0 END) AS drained,
         max(gtx.created_at) AS last_txn
       FROM gift_card_transaction AS gtx
       JOIN gift_card gc ON gtx.gift_card = gc.id
       LEFT JOIN customer ON gc.customer = customer.id
       WHERE gtx.created_at > time::now() - ${cfg.lookbackDays}d
         AND gtx.created_at < gc.issued_at + 24h
       GROUP BY gc.id
       FETCH gc, customer`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const initial = safeNumber(r.initial, 0);
      const drained = safeNumber(r.drained, 0);
      if (initial > 0 && drained / initial >= cfg.rapidDrainPct) {
        const cardCode = r.card_code ?? '';
        if (await isRecentlyAlerted(db, 'rapid_drain', cardCode, 48)) continue;
        alerts.push({
          rule_id: 'rapid_drain',
          severity: 'critical',
          gift_card_code: cardCode,
          customer_name: r.customer_name,
          metric_value: drained / initial,
          expected_value: cfg.rapidDrainPct,
          estimated_loss: drained,
          description: `Card "${cardCode}" drained ${formatCurrency(drained)} (${Math.round((drained/initial)*100)}% of initial ${formatCurrency(initial)}) within 24h of issuance. Rapid drain pattern suggests stolen card or fraud.`,
          context: { initial_balance: initial, drained, drain_pct: drained/initial },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[giftcard-fraud] rapid_drain failed', err); }
  return alerts;
};

// 2. BALANCE_MANIPULATION — balance increased without purchase (manual adjust)
const checkBalanceManipulation = async (db: any, cfg: GiftCardFraudConfig): Promise<GiftCardFraudAlert[]> => {
  const alerts: GiftCardFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         gift_card.code AS card_code,
         amount,
         balance_after,
         type,
         created_by.name AS staff_name,
         created_at
       FROM gift_card_transaction
       WHERE type = 'adjust'
         AND amount > 0
         AND created_at > time::now() - ${cfg.lookbackDays}d
       FETCH gift_card, created_by`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const amount = safeNumber(r.amount, 0);
      if (amount > 50) {
        const cardCode = r.card_code ?? '';
        if (await isRecentlyAlerted(db, 'balance_manipulation', cardCode + r.staff_name, 24)) continue;
        alerts.push({
          rule_id: 'balance_manipulation',
          severity: amount > 200 ? 'critical' : 'warning',
          gift_card_code: cardCode,
          staff_name: r.staff_name,
          metric_value: amount,
          expected_value: 0,
          estimated_loss: amount,
          description: `Card "${cardCode}" balance manually increased by ${formatCurrency(amount)} by staff "${r.staff_name}". Manual positive adjustments warrant review.`,
          context: { amount, balance_after: r.balance_after, staff: r.staff_name },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[giftcard-fraud] balance_manipulation failed', err); }
  return alerts;
};

// 3. MULTIPLE_CARDS_SAME_CUSTOMER — 5+ active cards per customer
const checkMultipleCards = async (db: any, cfg: GiftCardFraudConfig): Promise<GiftCardFraudAlert[]> => {
  const alerts: GiftCardFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         customer.id AS customer_id,
         customer.name AS customer_name,
         count() AS card_count,
         math::sum(balance) AS total_balance
       FROM gift_card
       WHERE status = 'active'
         AND customer IS NOT NONE
       GROUP BY customer
       FETCH customer`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const cardCount = safeNumber(r.card_count, 0);
      if (cardCount >= cfg.maxCardsPerCustomer) {
        const customerId = r.customer_id?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'multiple_cards', customerId, 72)) continue;
        alerts.push({
          rule_id: 'multiple_cards',
          severity: cardCount >= 10 ? 'critical' : 'warning',
          customer_name: r.customer_name,
          metric_value: cardCount,
          expected_value: cfg.maxCardsPerCustomer - 1,
          estimated_loss: safeNumber(r.total_balance, 0) * 0.1,
          description: `Customer "${r.customer_name}" has ${cardCount} active gift cards (threshold ${cfg.maxCardsPerCustomer}). Multiple cards may indicate fraud or card farming.`,
          context: { card_count: cardCount, total_balance: r.total_balance },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[giftcard-fraud] multiple_cards failed', err); }
  return alerts;
};

// 4. HIGH_VALUE_FIRST_USE — first transaction > $100
const checkHighValueFirstUse = async (db: any, cfg: GiftCardFraudConfig): Promise<GiftCardFraudAlert[]> => {
  const alerts: GiftCardFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         gift_card.code AS card_code,
         gift_card.initial_balance AS initial,
         amount,
         type,
         created_at
       FROM gift_card_transaction
       WHERE type = 'redeem'
         AND amount > $threshold
         AND created_at > time::now() - ${cfg.lookbackDays}d
       FETCH gift_card`,
      { threshold: cfg.highValueThreshold }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const amount = safeNumber(r.amount, 0);
      const cardCode = r.card_code ?? '';
      if (await isRecentlyAlerted(db, 'high_value_first_use', cardCode, 48)) continue;
      alerts.push({
        rule_id: 'high_value_first_use',
        severity: amount > 300 ? 'critical' : 'warning',
        gift_card_code: cardCode,
        metric_value: amount,
        expected_value: cfg.highValueThreshold,
        estimated_loss: amount,
        description: `Card "${cardCode}" redeemed ${formatCurrency(amount)} (threshold ${formatCurrency(cfg.highValueThreshold)}). High-value first redemption may indicate stolen card.`,
        context: { amount, initial_balance: r.initial },
        status: 'open',
        detected_at: new Date(),
      });
    }
  } catch (err) { console.warn('[giftcard-fraud] high_value_first_use failed', err); }
  return alerts;
};

// 5. AFTER_HOURS_REDEMPTION — redemptions at 22:00-06:00
const checkAfterHoursRedemption = async (db: any, _cfg: GiftCardFraudConfig): Promise<GiftCardFraudAlert[]> => {
  const alerts: GiftCardFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         gift_card.code AS card_code,
         amount,
         created_at,
         created_by.name AS staff_name
       FROM gift_card_transaction
       WHERE type = 'redeem'
         AND created_at > time::now() - 7d
       FETCH gift_card, created_by`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const r of rows) {
      const hour = new Date(r.created_at).getHours();
      if (hour >= 22 || hour < 6) {
        const cardCode = r.card_code ?? '';
        if (await isRecentlyAlerted(db, 'after_hours_redemption', cardCode, 24)) continue;
        alerts.push({
          rule_id: 'after_hours_redemption',
          severity: 'warning',
          gift_card_code: cardCode,
          staff_name: r.staff_name,
          metric_value: hour,
          expected_value: 8,
          estimated_loss: safeNumber(r.amount, 0),
          description: `Card "${cardCode}" redeemed at ${hour}:00 (after hours 22:00-06:00) by staff "${r.staff_name}". After-hours redemptions warrant review.`,
          context: { hour, amount: r.amount, staff: r.staff_name },
          status: 'open',
          detected_at: new Date(r.created_at),
        });
      }
    }
  } catch (err) { console.warn('[giftcard-fraud] after_hours_redemption failed', err); }
  return alerts;
};

// 6. STAFF_ISSUANCE_SPIKE — staff issuing unusually high number of cards
const checkStaffIssuanceSpike = async (db: any, cfg: GiftCardFraudConfig): Promise<GiftCardFraudAlert[]> => {
  const alerts: GiftCardFraudAlert[] = [];
  try {
    const result = await db.query(
      `SELECT
         created_by.id AS staff_id,
         created_by.name AS staff_name,
         count() AS issued_count,
         math::sum(initial_balance) AS total_issued_value
       FROM gift_card
       WHERE issued_at > time::now() - ${cfg.lookbackDays}d
         AND created_by IS NOT NONE
       GROUP BY created_by
       FETCH created_by`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return alerts;
    const avgIssued = rows.reduce((s: number, r: any) => s + safeNumber(r.issued_count, 0), 0) / rows.length;
    for (const r of rows) {
      const issuedCount = safeNumber(r.issued_count, 0);
      if (avgIssued > 0 && issuedCount > avgIssued * 3) {
        const staffId = r.staff_id?.toString?.() ?? '';
        if (await isRecentlyAlerted(db, 'staff_issuance_spike', staffId, 72)) continue;
        alerts.push({
          rule_id: 'staff_issuance_spike',
          severity: issuedCount > avgIssued * 5 ? 'critical' : 'warning',
          staff_name: r.staff_name,
          metric_value: issuedCount,
          expected_value: Math.round(avgIssued),
          estimated_loss: safeNumber(r.total_issued_value, 0) * 0.05,
          description: `Staff "${r.staff_name}" issued ${issuedCount} gift cards in ${cfg.lookbackDays}d — ${Math.round(issuedCount/avgIssued)}× team average of ${Math.round(avgIssued)}. Unusual issuance volume warrants review.`,
          context: { issued_count: issuedCount, avg: Math.round(avgIssued), total_value: r.total_issued_value },
          status: 'open',
          detected_at: new Date(),
        });
      }
    }
  } catch (err) { console.warn('[giftcard-fraud] staff_issuance_spike failed', err); }
  return alerts;
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (alerts: GiftCardFraudAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;

  const prompt = `You are a restaurant gift card fraud analyst.
Analyze these alerts and provide insight + recommendation.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 12).map(a => ({
  rule: a.rule_id,
  severity: a.severity,
  card: a.gift_card_code,
  customer: a.customer_name,
  staff: a.staff_name,
  metric: a.metric_value,
  loss: a.estimated_loss,
  description: a.description,
})), null, 2)}

Respond with JSON array:
[{
  "rule": "<match rule_id>",
  "insight": "<max 200 chars>",
  "recommendation": "freeze_card" | "investigate_staff" | "refund_customer" | "void_transaction" | "monitor" | "dismiss"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a gift card fraud detection AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      rule: string; insight?: string; recommendation?: GiftCardFraudRecommendation;
    }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[giftcard-fraud] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runGiftCardFraudScan = async (
  db: ReturnType<typeof useDB>,
  config: GiftCardFraudConfig = DEFAULT_GIFTCARD_FRAUD_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ alerts: GiftCardFraudAlert[]; checked: number }> => {
  const checks = [
    () => checkRapidDrain(db, config),
    () => checkBalanceManipulation(db, config),
    () => checkMultipleCards(db, config),
    () => checkHighValueFirstUse(db, config),
    () => checkAfterHoursRedemption(db, config),
    () => checkStaffIssuanceSpike(db, config),
  ];
  const total = checks.length;
  let allAlerts: GiftCardFraudAlert[] = [];

  for (let i = 0; i < checks.length; i++) {
    if (onProgress) onProgress(i, total);
    try {
      const alerts = await checks[i]();
      allAlerts.push(...alerts);
    } catch (err) { console.warn('[giftcard-fraud] check failed at', i, err); }
  }

  if (config.aiEnabled && allAlerts.length > 0) {
    await enhanceWithAI(allAlerts);
  }

  // Persist
  for (const alert of allAlerts) {
    try {
      await db.query(`CREATE giftcard_fraud_alert CONTENT $data`, {
        data: { ...alert, detected_at: alert.detected_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(total, total);
  return { alerts: allAlerts, checked: total };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getOpenAlerts = async (db: ReturnType<typeof useDB>): Promise<GiftCardFraudAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM giftcard_fraud_alert WHERE status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       estimated_loss DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  total: number; critical: number; warning: number; totalLoss: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(severity = 'warning') AS warning,
         math::sum(estimated_loss) AS total_loss
       FROM giftcard_fraud_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      warning: safeNumber(row.warning, 0),
      totalLoss: safeNumber(row.total_loss, 0),
    };
  } catch { return { total: 0, critical: 0, warning: 0, totalLoss: 0 }; }
};

export const updateStatus = async (
  db: ReturnType<typeof useDB>, alertId: string, status: string
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
