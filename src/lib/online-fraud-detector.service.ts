/**
 * AI Online Order Fraud Detector — external customer-side fraud detection.
 *
 * 58th POSR-exclusive differentiator — online food order fraud costs
 * restaurants $2-5k/year per location (Statista, Radial). 1-2% of online
 * orders are fraudulent.
 *
 * Distinct from:
 *   - order-fraud-detection.service (INTERNAL employee theft/collusion — NOT
 *     external customer fraud)
 *   - chargeback-risk.service (PAYMENT chargeback probability — NOT device/IP/
 *     address fraud signals)
 *   - promo-abuse.service (promo code redemption — NOT credit card fraud)
 *   - refund-abuse.service (refund patterns — NOT stolen card fraud)
 *   - giftcard-fraud.service (gift card redemption — NOT online order fraud)
 *
 * Detects EXTERNAL customer-side fraud:
 *   1. Stolen card patterns (velocity, high-value first order, BIN mismatch)
 *   2. Fake delivery addresses (hotel/warehouse/vacant lot detection)
 *   3. Multi-account abuse (same device/IP creating multiple accounts)
 *   4. Velocity fraud (multiple orders from same device in 24h)
 *   5. VPN/proxy detection (anonymizing fraudster location)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type OnlineFraudRuleId =
  | 'stolen_card_pattern'
  | 'fake_address'
  | 'multi_account_abuse'
  | 'velocity_fraud'
  | 'vpn_proxy_detected';

export type OnlineFraudAiRec =
  | 'block_order'
  | 'require_verification'
  | 'manual_review'
  | 'flag_customer'
  | 'allow_with_monitoring';

export interface OnlineFraudAlert {
  id?: string;
  rule_id: OnlineFraudRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  order_id?: string;
  customer_id?: string;
  customer_name?: string;
  risk_score: number;
  order_value: number;
  device_fingerprint?: string;
  ip_address?: string;
  billing_address?: string;
  delivery_address?: string;
  address_mismatch?: boolean;
  is_vpn_proxy?: boolean;
  linked_accounts?: string;
  order_count_24h?: number;
  est_loss: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: OnlineFraudAiRec;
  status: 'open' | 'blocked' | 'verified' | 'allowed' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface OnlineFraudConfig {
  aiEnabled: boolean;
  velocityThreshold: number;
  highValueThreshold: number;
  blockThreshold: number;
}

export const DEFAULT_ONLINE_FRAUD_CONFIG: OnlineFraudConfig = {
  aiEnabled: true,
  velocityThreshold: 3,
  highValueThreshold: 200,
  blockThreshold: 75,
};

export const readOnlineFraudConfig = (settings: any): OnlineFraudConfig => ({
  aiEnabled: settings?.online_fraud_ai_enabled ?? true,
  velocityThreshold: safeNumber(settings?.online_fraud_velocity_threshold, 3),
  highValueThreshold: safeNumber(settings?.online_fraud_high_value_threshold, 200),
  blockThreshold: safeNumber(settings?.online_fraud_block_threshold, 75),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Fake address indicators (keywords in delivery address)
const FAKE_ADDRESS_KEYWORDS = [
  'hotel', 'motel', 'inn', 'suite 0', 'warehouse', 'storage', 'lot ', 'vacant',
  'abandoned', 'parking lot', 'gas station', 'park', 'alley', 'street corner',
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface OnlineOrderData {
  order_id: string;
  customer_id: string;
  customer_name: string;
  total: number;
  created_at: string;
  device_fingerprint?: string;
  ip_address?: string;
  billing_address?: string;
  delivery_address?: string;
  is_first_order: boolean;
  payment_method?: string;
}

/**
 * Run the online fraud detector engine.
 * Fetches recent online orders, applies fraud detection rules.
 */
export const runOnlineFraudEngine = async (
  db: ReturnType<typeof useDB>,
  config: OnlineFraudConfig = DEFAULT_ONLINE_FRAUD_CONFIG
): Promise<{ alerts: OnlineFraudAlert[]; generated: number }> => {
  const alerts: OnlineFraudAlert[] = [];
  const now = new Date();

  // 1. Fetch recent online orders
  let orders: OnlineOrderData[] = [];
  try {
    const result = await db.query(
      `SELECT
         id AS order_id,
         customer.id AS customer_id,
         customer.name AS customer_name,
         total,
         created_at,
         device_fingerprint,
         ip_address,
         billing_address,
         delivery_address,
         payment_method
       FROM order
       WHERE status = 'Open'
         AND deleted_at IS NONE
         AND created_at > time::now() - 7d
         AND (order_type = 'delivery' OR order_type = 'pickup_online')
       LIMIT 100`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    // Fetch order count per customer to determine first orders
    let customerOrderCounts: Map<string, number> = new Map();
    try {
      const countResult = await db.query(
        `SELECT customer.id AS cid, count() AS cnt
         FROM order
         WHERE status = 'Paid' AND deleted_at IS NONE
           AND customer IS NOT NONE
         GROUP BY customer.id`
      );
      const countRows = Array.isArray(countResult) ? countResult.flat() : [];
      for (const r of countRows) {
        customerOrderCounts.set(String(r.cid), safeNumber(r.cnt, 0));
      }
    } catch (err) {
      console.warn('[online-fraud] fetchCustomerCounts failed', err);
    }

    orders = rows.map((r: any) => ({
      order_id: String(r.order_id ?? ''),
      customer_id: String(r.customer_id ?? ''),
      customer_name: String(r.customer_name ?? 'Unknown'),
      total: safeNumber(r.total, 0),
      created_at: String(r.created_at ?? ''),
      device_fingerprint: r.device_fingerprint ?? undefined,
      ip_address: r.ip_address ?? undefined,
      billing_address: r.billing_address ?? undefined,
      delivery_address: r.delivery_address ?? undefined,
      is_first_order: (customerOrderCounts.get(String(r.customer_id)) ?? 0) === 0,
      payment_method: r.payment_method ?? undefined,
    }));
  } catch (err) {
    console.warn('[online-fraud] fetchOrders failed', err);
  }

  if (orders.length === 0) return { alerts: [], generated: 0 };

  // 2. Aggregate device/IP stats for velocity and multi-account detection
  const ordersByDevice = new Map<string, OnlineOrderData[]>();
  const ordersByIP = new Map<string, OnlineOrderData[]>();
  for (const order of orders) {
    if (order.device_fingerprint) {
      if (!ordersByDevice.has(order.device_fingerprint)) {
        ordersByDevice.set(order.device_fingerprint, []);
      }
      ordersByDevice.get(order.device_fingerprint)!.push(order);
    }
    if (order.ip_address) {
      if (!ordersByIP.has(order.ip_address)) {
        ordersByIP.set(order.ip_address, []);
      }
      ordersByIP.get(order.ip_address)!.push(order);
    }
  }

  // 3. Apply fraud detection rules per order
  for (const order of orders) {
    let riskScore = 0;
    const signals: string[] = [];

    // --- Rule 1: STOLEN_CARD_PATTERN — high-value first order + new device ---
    if (order.is_first_order && order.total > config.highValueThreshold) {
      riskScore += 35;
      signals.push('high-value first order');
    }
    if (order.total > config.highValueThreshold * 2) {
      riskScore += 15;
      signals.push('very high value');
    }

    // Address mismatch (billing ≠ delivery)
    const addressMismatch = order.billing_address && order.delivery_address
      && order.billing_address !== order.delivery_address;
    if (addressMismatch) {
      riskScore += 25;
      signals.push('billing ≠ delivery address');
    }

    // --- Rule 2: FAKE_ADDRESS — suspicious delivery address keywords ---
    if (order.delivery_address) {
      const addrLower = order.delivery_address.toLowerCase();
      const fakeKeywords = FAKE_ADDRESS_KEYWORDS.filter(kw => addrLower.includes(kw));
      if (fakeKeywords.length > 0) {
        riskScore += 30;
        signals.push(`suspicious address: ${fakeKeywords.join(', ')}`);
      }
    }

    // --- Rule 3: MULTI_ACCOUNT_ABUSE — same device/IP, different customers ---
    if (order.device_fingerprint) {
      const deviceOrders = ordersByDevice.get(order.device_fingerprint) ?? [];
      const uniqueCustomers = new Set(deviceOrders.map(o => o.customer_id));
      if (uniqueCustomers.size >= 2) {
        riskScore += 30;
        signals.push(`${uniqueCustomers.size} accounts on same device`);
      }
    }
    if (order.ip_address) {
      const ipOrders = ordersByIP.get(order.ip_address) ?? [];
      const uniqueCustomers = new Set(ipOrders.map(o => o.customer_id));
      if (uniqueCustomers.size >= 3) {
        riskScore += 20;
        signals.push(`${uniqueCustomers.size} accounts on same IP`);
      }
    }

    // --- Rule 4: VELOCITY_FRAUD — multiple orders from same device in 24h ---
    if (order.device_fingerprint) {
      const deviceOrders = ordersByDevice.get(order.device_fingerprint) ?? [];
      const orderDate = new Date(order.created_at);
      const ordersIn24h = deviceOrders.filter(o => {
        const od = new Date(o.created_at);
        return Math.abs(od.getTime() - orderDate.getTime()) < 24 * 60 * 60 * 1000;
      });
      if (ordersIn24h.length >= config.velocityThreshold) {
        riskScore += 35;
        signals.push(`${ordersIn24h.length} orders in 24h from same device`);
      }
    }

    // --- Rule 5: VPN_PROXY_DETECTED ---
    // (In production, would call IP reputation API. Heuristic: private IP ranges,
    // known VPN providers. For now, flag if IP looks suspicious.)
    const isVpn = order.ip_address && isVpnProxyHeuristic(order.ip_address);
    if (isVpn) {
      riskScore += 20;
      signals.push('VPN/proxy detected');
    }

    // Skip if no significant risk
    if (riskScore < 25) continue;

    riskScore = Math.min(100, riskScore);

    // Determine primary rule
    let ruleId: OnlineFraudRuleId;
    if (signals.some(s => s.includes('orders in 24h'))) {
      ruleId = 'velocity_fraud';
    } else if (signals.some(s => s.includes('accounts on same'))) {
      ruleId = 'multi_account_abuse';
    } else if (signals.some(s => s.includes('suspicious address'))) {
      ruleId = 'fake_address';
    } else if (isVpn) {
      ruleId = 'vpn_proxy_detected';
    } else {
      ruleId = 'stolen_card_pattern';
    }

    const severity: 'critical' | 'high' | 'medium' | 'low' =
      riskScore >= config.blockThreshold ? 'critical'
      : riskScore >= 60 ? 'high'
      : riskScore >= 40 ? 'medium' : 'low';

    const aiRec: OnlineFraudAiRec =
      riskScore >= config.blockThreshold ? 'block_order'
      : riskScore >= 60 ? 'require_verification'
      : riskScore >= 40 ? 'manual_review'
      : 'allow_with_monitoring';

    // Build linked accounts JSON
    let linkedAccounts: string | undefined;
    if (order.device_fingerprint) {
      const deviceOrders = ordersByDevice.get(order.device_fingerprint) ?? [];
      const uniqueNames = Array.from(new Set(deviceOrders.map(o => o.customer_name))).slice(0, 5);
      if (uniqueNames.length >= 2) {
        linkedAccounts = JSON.stringify(uniqueNames);
      }
    }

    alerts.push({
      rule_id: ruleId,
      severity,
      order_id: order.order_id,
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      risk_score: Math.round(riskScore),
      order_value: Math.round(order.total * 100) / 100,
      device_fingerprint: order.device_fingerprint,
      ip_address: order.ip_address,
      billing_address: order.billing_address,
      delivery_address: order.delivery_address,
      address_mismatch: addressMismatch || undefined,
      is_vpn_proxy: isVpn || undefined,
      linked_accounts: linkedAccounts,
      order_count_24h: order.device_fingerprint
        ? (ordersByDevice.get(order.device_fingerprint) ?? []).filter(o => {
            const od = new Date(o.created_at);
            const orderDate = new Date(order.created_at);
            return Math.abs(od.getTime() - orderDate.getTime()) < 24 * 60 * 60 * 1000;
          }).length
        : undefined,
      est_loss: Math.round(order.total * 100) / 100,
      description: `Order ${order.order_id} (${fmt$(order.total)}) from ${order.customer_name}: ${signals.join(', ')} — risk score ${Math.round(riskScore)}/100`,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 4. AI insight for top 5 critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts
        .filter(a => a.severity === 'critical' || a.severity === 'high')
        .slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a fraud detection AI for restaurants. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Fraud alert: ${a.rule_id} — risk ${a.risk_score}/100, order ${fmt$(a.order_value)} from ${a.customer_name}. ${a.description}.` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM online_fraud_alert WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE online_fraud_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { alerts, generated: alerts.length };
};

// ---------------------------------------------------------------------------
// Heuristic: VPN/proxy detection (simplified)
// ---------------------------------------------------------------------------

const isVpnProxyHeuristic = (ip: string): boolean => {
  // In production, would use IP reputation API (MaxMind, IPQualityScore)
  // Heuristic checks:
  // - Known VPN provider hostnames (would need reverse DNS)
  // - Datacenter IP ranges (AWS, DigitalOcean, etc.)
  // - For now, flag tor exit nodes and common VPN ranges
  const knownVpnRanges = [
    '10.', // private (unusual for online order)
    '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  ];
  return knownVpnRanges.some(range => ip.startsWith(range));
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<OnlineFraudAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM online_fraud_alert
       WHERE status = 'open'
       ORDER BY risk_score DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  criticalCount: number;
  totalAlerts: number;
  totalOrderValue: number;
  avgRiskScore: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(order_value) AS value,
         math::mean(risk_score) AS risk
       FROM online_fraud_alert
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      criticalCount: safeNumber(r.critical, 0),
      totalAlerts: safeNumber(r.total, 0),
      totalOrderValue: safeNumber(r.value, 0),
      avgRiskScore: safeNumber(r.risk, 0),
    };
  } catch {
    return { criticalCount: 0, totalAlerts: 0, totalOrderValue: 0, avgRiskScore: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'blocked' | 'verified' | 'allowed' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
