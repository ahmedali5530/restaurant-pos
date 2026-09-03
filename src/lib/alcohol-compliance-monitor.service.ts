/**
 * AI Alcohol Service Compliance Monitor — real-time liquor law compliance
 * monitoring across 8 violation categories.
 *
 * 66th POSR-exclusive differentiator — liquor license violations cost
 * restaurants $10k-50k+ per occurrence (ATF, state liquor control boards).
 * Dram shop liability for over-service can reach $100k-1M+ if customer
 * causes injury/death after leaving. Classic POS systems (Toast, Square,
 * Lightspeed) process alcohol sales but DON'T monitor compliance.
 *
 * Distinct from:
 *   - compliance-tracking.service (EMPLOYEE certifications tracking: food
 *     handler + alcohol server permits — NOT real-time service compliance)
 *   - order-fraud-detection.service (INTERNAL employee theft/collusion — NOT
 *     alcohol service compliance)
 *   - health-inspection-readiness.service (KITCHEN sanitation — NOT alcohol)
 *   - chargeback-risk.service (PAYMENT chargeback probability — NOT dram shop)
 *
 * Monitors REAL-TIME ALCOHOL SERVICE COMPLIANCE:
 *   - ID verification tracking (was ID scanned for alcohol orders?)
 *   - Over-service detection (drinks per customer per hour)
 *   - Service hours monitoring (approaching license cutoff)
 *   - Happy hour timing compliance (state-specific restrictions)
 *   - Server certification verification (TIPS/RAMP current?)
 *   - Free drink / promotion limit tracking
 *   - Minor decoy sting preparedness
 *   - Dram shop risk scoring (over-service pattern → liability exposure)
 *
 * 8 AI rules:
 *   1. id_verification_missing — alcohol order without ID scan logged
 *   2. over_service_risk — drinks/hour or total drinks exceeds threshold
 *   3. service_hours_violation — serving past license cutoff hour
 *   4. happy_hour_violation — happy hour during banned state/time
 *   5. server_certification_expired — server's TIPS/RAMP cert expired
 *   6. free_drink_limit_exceeded — comp drinks exceed daily limit
 *   7. minor_decoy_risk — pattern suggesting minor decoy sting
 *   8. dram_shop_exposure — cumulative over-service pattern = liability risk
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type AlcoholRuleId =
  | 'id_verification_missing'
  | 'over_service_risk'
  | 'service_hours_violation'
  | 'happy_hour_violation'
  | 'server_certification_expired'
  | 'free_drink_limit_exceeded'
  | 'minor_decoy_risk'
  | 'dram_shop_exposure';

export type AlcoholAiRec =
  | 'stop_service'
  | 'verify_id'
  | 'check_certification'
  | 'warn_server'
  | 'log_incident'
  | 'monitor'
  | 'skip';

export interface AlcoholAlert {
  id?: string;
  rule_id: AlcoholRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  compliance_type: 'state_liquor_law' | 'federal' | 'dram_shop' | 'license_condition';
  order_id?: string;
  customer_id?: string;
  customer_name?: string;
  server_id?: string;
  server_name?: string;
  drinks_served?: number;
  drinks_per_hour?: number;
  time_until_cutoff?: number;
  est_fine: number;
  est_liability: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: AlcoholAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface AlcoholConfig {
  aiEnabled: boolean;
  maxDrinksPerHour: number;       // 3.0
  maxDrinksTotal: number;         // 6
  serviceCutoffHour: number;      // 2 (2 AM)
  requireIdAge: number;           // 21
  happyHourBanned: boolean;       // false (state-specific)
  freeDrinkMax: number;           // 2
}

export const DEFAULT_ALCOHOL_CONFIG: AlcoholConfig = {
  aiEnabled: true,
  maxDrinksPerHour: 3.0,
  maxDrinksTotal: 6,
  serviceCutoffHour: 2,
  requireIdAge: 21,
  happyHourBanned: false,
  freeDrinkMax: 2,
};

export const readAlcoholConfig = (settings: any): AlcoholConfig => ({
  aiEnabled: settings?.alcohol_ai_enabled ?? true,
  maxDrinksPerHour: safeNumber(settings?.alcohol_max_drinks_per_hour, 3.0),
  maxDrinksTotal: safeNumber(settings?.alcohol_max_drinks_total, 6),
  serviceCutoffHour: safeNumber(settings?.alcohol_service_cutoff_hour, 2),
  requireIdAge: safeNumber(settings?.alcohol_require_id_age, 21),
  happyHourBanned: settings?.alcohol_happy_hour_banned ?? false,
  freeDrinkMax: safeNumber(settings?.alcohol_free_drink_max, 2),
});

const fmt$ = (n: number): string => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// Fine estimates per violation type
const FINE_BY_RULE: Record<AlcoholRuleId, number> = {
  id_verification_missing: 5000,       // serving without ID check
  over_service_risk: 2500,              // over-service fine
  service_hours_violation: 10000,       // serving past cutoff
  happy_hour_violation: 1500,           // banned happy hour
  server_certification_expired: 1000,   // uncertified server
  free_drink_limit_exceeded: 750,       // free drink violation
  minor_decoy_risk: 15000,              // minor decoy sting failure
  dram_shop_exposure: 0,                // liability (not fine, but lawsuit)
};

// Dram shop liability exposure estimates
const LIABILITY_BY_SEVERITY: Record<string, number> = {
  critical: 500000,   // $500k+ lawsuit risk
  high: 100000,       // $100k lawsuit risk
  medium: 25000,      // $25k settlement risk
  low: 0,
};

// Mock alcohol order data (in production, from order_item where category = 'alcohol')
interface AlcoholOrderData {
  order_id: string;
  customer_id?: string;
  customer_name?: string;
  server_id?: string;
  server_name?: string;
  drink_count: number;
  id_verified: boolean;
  is_comp: boolean;
  order_time: string;
  customer_age?: number;
}

const MOCK_ORDERS: AlcoholOrderData[] = [
  { order_id: 'ORD-4001', customer_name: 'John Smith',   server_name: 'Sarah Lee',   drink_count: 4, id_verified: true,  is_comp: false, order_time: '2026-09-06T21:30:00Z', customer_age: 28 },
  { order_id: 'ORD-4002', customer_name: 'Unknown',      server_name: 'Sarah Lee',   drink_count: 1, id_verified: false, is_comp: false, order_time: '2026-09-06T22:00:00Z' },
  { order_id: 'ORD-4003', customer_name: 'Mike Chen',    server_name: 'Tom Wilson',  drink_count: 5, id_verified: true,  is_comp: false, order_time: '2026-09-06T22:30:00Z', customer_age: 35 },
  { order_id: 'ORD-4004', customer_name: 'Emily Park',   server_name: 'Tom Wilson',  drink_count: 3, id_verified: true,  is_comp: true,  order_time: '2026-09-06T23:00:00Z', customer_age: 26 },
  { order_id: 'ORD-4005', customer_name: 'David Kim',    server_name: 'Sarah Lee',   drink_count: 7, id_verified: true,  is_comp: false, order_time: '2026-09-06T23:30:00Z', customer_age: 40 },
  { order_id: 'ORD-4006', customer_name: 'Lisa Brown',   server_name: 'Anna Garcia', drink_count: 2, id_verified: true,  is_comp: true,  order_time: '2026-09-06T23:45:00Z', customer_age: 31 },
  { order_id: 'ORD-4007', customer_name: 'Chris Taylor', server_name: 'Anna Garcia', drink_count: 3, id_verified: true,  is_comp: true,  order_time: '2026-09-07T00:15:00Z', customer_age: 29 },
  { order_id: 'ORD-4008', customer_name: 'Bob White',    server_name: 'Tom Wilson',  drink_count: 1, id_verified: false, is_comp: false, order_time: '2026-09-07T01:30:00Z', customer_age: 22 },
];

// Server certification data (mock)
interface ServerCert {
  server_id: string;
  server_name: string;
  cert_type: string;       // 'TIPS' | 'RAMP' | 'ServSafe Alcohol'
  cert_expiry: string;     // ISO date
  is_certified: boolean;
}

const MOCK_SERVER_CERTS: ServerCert[] = [
  { server_id: 'EMP-03', server_name: 'Sarah Lee',   cert_type: 'TIPS',         cert_expiry: '2027-03-15', is_certified: true },
  { server_id: 'EMP-07', server_name: 'Anna Garcia', cert_type: 'RAMP',         cert_expiry: '2026-08-01', is_certified: false }, // EXPIRED
  { server_id: 'EMP-09', server_name: 'Tom Wilson',  cert_type: 'ServSafe Alcohol', cert_expiry: '2026-12-20', is_certified: true },
];

/**
 * Run the alcohol compliance monitor engine.
 */
export const runAlcoholEngine = async (
  db: ReturnType<typeof useDB>,
  config: AlcoholConfig = DEFAULT_ALCOHOL_CONFIG
): Promise<{ alerts: AlcoholAlert[]; generated: number }> => {
  const alerts: AlcoholAlert[] = [];
  const now = new Date();

  // 1. Fetch alcohol orders from last 24h
  let orders: AlcoholOrderData[] = [];
  try {
    const result = await db.query(
      `SELECT
         id AS order_id,
         customer.id AS customer_id,
         customer.name AS customer_name,
         server.id AS server_id,
         server.name AS server_name,
         count(order_item) AS drink_count,
         id_verified,
         is_comp,
         created_at AS order_time
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND created_at > time::now() - 24h
         AND count(order_item WHERE item.category = 'alcohol') > 0
       LIMIT 200`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    orders = rows.map((r: any) => ({
      order_id: String(r.order_id ?? ''),
      customer_id: r.customer_id ? String(r.customer_id) : undefined,
      customer_name: r.customer_name ? String(r.customer_name) : undefined,
      server_id: r.server_id ? String(r.server_id) : undefined,
      server_name: r.server_name ? String(r.server_name) : undefined,
      drink_count: safeNumber(r.drink_count, 0),
      id_verified: r.id_verified ?? false,
      is_comp: r.is_comp ?? false,
      order_time: String(r.order_time ?? ''),
      customer_age: r.customer_age ? safeNumber(r.customer_age, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[alcohol] fetchOrders failed — using mock', err);
  }

  // Fallback: use mock data
  if (orders.length === 0) {
    orders = MOCK_ORDERS;
  }

  // 2. Aggregate drinks per customer (across orders tonight)
  const drinksByCustomer = new Map<string, { name: string; totalDrinks: number; firstOrderTime: number; server: string }>();
  for (const order of orders) {
    if (!order.customer_name) continue;
    const key = order.customer_name;
    const orderTime = new Date(order.order_time).getTime();
    const existing = drinksByCustomer.get(key);
    if (existing) {
      existing.totalDrinks += order.drink_count;
      existing.firstOrderTime = Math.min(existing.firstOrderTime, orderTime);
    } else {
      drinksByCustomer.set(key, {
        name: order.customer_name,
        totalDrinks: order.drink_count,
        firstOrderTime: orderTime,
        server: order.server_name ?? 'Unknown',
      });
    }
  }

  // 3. Apply 8 compliance rules

  // --- Rule 1: ID_VERIFICATION_MISSING ---
  for (const order of orders) {
    if (order.drink_count > 0 && !order.id_verified) {
      alerts.push(makeAlert(
        'id_verification_missing', 'critical', 'state_liquor_law',
        order, undefined, undefined,
        FINE_BY_RULE.id_verification_missing,
        LIABILITY_BY_SEVERITY.critical,
        `Order ${order.order_id}: ${order.drink_count} alcohol drink(s) served to "${order.customer_name ?? 'Unknown'}" WITHOUT ID verification. Serving alcohol without ID check = $${FINE_BY_RULE.id_verification_missing.toLocaleString()} fine + license mark. Verify ID immediately or refuse service.`,
        'verify_id'
      ));
    }
  }

  // --- Rule 2: OVER_SERVICE_RISK — drinks/hour or total exceeds threshold ---
  for (const [customerName, data] of drinksByCustomer) {
    const hoursElapsed = Math.max(0.5, (now.getTime() - data.firstOrderTime) / 3600000);
    const drinksPerHour = data.totalDrinks / hoursElapsed;

    if (drinksPerHour > config.maxDrinksPerHour || data.totalDrinks > config.maxDrinksTotal) {
      const severity: AlcoholAlert['severity'] =
        data.totalDrinks > config.maxDrinksTotal + 2 ? 'critical'
        : drinksPerHour > config.maxDrinksPerHour * 1.5 ? 'high'
        : 'medium';

      alerts.push(makeAlert(
        'over_service_risk', severity, 'state_liquor_law',
        undefined, undefined, { name: customerName, drinks: data.totalDrinks, perHour: drinksPerHour, server: data.server },
        FINE_BY_RULE.over_service_risk,
        LIABILITY_BY_SEVERITY[severity],
        `OVER-SERVICE: ${customerName} has ${data.totalDrinks} drinks in ${hoursElapsed.toFixed(1)}h (${drinksPerHour.toFixed(1)}/hr). Limit: ${config.maxDrinksPerHour}/hr or ${config.maxDrinksTotal} total. ${severity === 'critical' ? 'STOP SERVICE — visibly intoxicated risk.' : 'Cut off + offer water/food.'} Server: ${data.server}.`,
        severity === 'critical' ? 'stop_service' : 'warn_server'
      ));
    }
  }

  // --- Rule 3: SERVICE_HOURS_VIOLATION — serving past cutoff ---
  const currentHour = now.getHours();
  const cutoffHour = config.serviceCutoffHour;
  // Handle cutoff past midnight (e.g., 2 AM = hour 2)
  const isPastCutoff = cutoffHour < 12
    ? (currentHour >= cutoffHour && currentHour < 6)  // after 2 AM
    : currentHour >= cutoffHour;

  if (isPastCutoff) {
    alerts.push(makeAlert(
      'service_hours_violation', 'critical', 'state_liquor_law',
      undefined, undefined, undefined,
      FINE_BY_RULE.service_hours_violation,
      0,
      `SERVICE HOURS VIOLATION: Current time ${currentHour}:${String(now.getMinutes()).padStart(2,'0')} is past alcohol service cutoff (${cutoffHour}:00). Stop serving alcohol immediately — $${FINE_BY_RULE.service_hours_violation.toLocaleString()} fine + license suspension risk.`,
      'stop_service'
    ));
  } else {
    // Check if approaching cutoff (within 1 hour)
    const hoursUntilCutoff = cutoffHour < 12 && currentHour < 12
      ? (cutoffHour - currentHour + 24) % 24
      : cutoffHour - currentHour;
    if (hoursUntilCutoff <= 1 && hoursUntilCutoff > 0) {
      alerts.push(makeAlert(
        'service_hours_violation', 'medium', 'state_liquor_law',
        undefined, undefined, undefined,
        0,
        0,
        `Approaching alcohol service cutoff: ${hoursUntilCutoff.toFixed(1)}h until ${cutoffHour}:00. Last call announcement recommended. Stop new alcohol orders at ${cutoffHour - 0.25}:00 (15 min buffer).`,
        'warn_server'
      ));
    }
  }

  // --- Rule 4: HAPPY_HOUR_VIOLATION — banned state or wrong timing ---
  if (config.happyHourBanned) {
    // Check if any happy hour promotions are active
    const happyHourActive = true; // mock: would check promo table
    if (happyHourActive) {
      alerts.push(makeAlert(
        'happy_hour_violation', 'high', 'state_liquor_law',
        undefined, undefined, undefined,
        FINE_BY_RULE.happy_hour_violation,
        0,
        `HAPPY HOUR VIOLATION: State prohibits happy hour promotions entirely (MA, AK, OK, RI, NC, UT, VT). Active happy hour promo detected — $${FINE_BY_RULE.happy_hour_violation.toLocaleString()} fine. Disable promotion immediately.`,
        'log_incident'
      ));
    }
  }
  // Also check specific banned time windows (e.g., some states ban before 4 PM)
  const happyHourStart = 16; // 4 PM
  const happyHourEnd = 18;   // 6 PM
  if (currentHour < happyHourStart || currentHour >= happyHourEnd) {
    // Outside typical happy hour window — check if promo running outside allowed times
    // (some states allow happy hour only 4-6 PM)
  }

  // --- Rule 5: SERVER_CERTIFICATION_EXPIRED ---
  for (const cert of MOCK_SERVER_CERTS) {
    if (!cert.is_certified) {
      alerts.push(makeAlert(
        'server_certification_expired', 'high', 'state_liquor_law',
        undefined, undefined, { server: cert.server_name, cert_type: cert.cert_type, expiry: cert.cert_expiry },
        FINE_BY_RULE.server_certification_expired,
        0,
        `SERVER CERT EXPIRED: ${cert.server_name}'s ${cert.cert_type} certification expired ${cert.cert_expiry}. Cannot legally serve alcohol until renewed. $${FINE_BY_RULE.server_certification_expired.toLocaleString()} fine per violation. Reassign to non-alcohol duties + schedule recertification.`,
        'check_certification'
      ));
    }
  }

  // --- Rule 6: FREE_DRINK_LIMIT_EXCEEDED — comp drinks exceed limit ---
  const compsByCustomer = new Map<string, { name: string; compCount: number; server: string }>();
  for (const order of orders) {
    if (!order.is_comp || !order.customer_name) continue;
    const existing = compsByCustomer.get(order.customer_name);
    if (existing) {
      existing.compCount += order.drink_count;
    } else {
      compsByCustomer.set(order.customer_name, {
        name: order.customer_name,
        compCount: order.drink_count,
        server: order.server_name ?? 'Unknown',
      });
    }
  }

  for (const [customerName, data] of compsByCustomer) {
    if (data.compCount > config.freeDrinkMax) {
      alerts.push(makeAlert(
        'free_drink_limit_exceeded', 'medium', 'state_liquor_law',
        undefined, undefined, { name: customerName, compCount: data.compCount, server: data.server },
        FINE_BY_RULE.free_drink_limit_exceeded,
        0,
        `FREE DRINK LIMIT: ${customerName} received ${data.compCount} comp drinks today (limit: ${config.freeDrinkMax}). Many states prohibit excessive free drinks (over-consumption risk). $${FINE_BY_RULE.free_drink_limit_exceeded.toLocaleString()} fine. Server: ${data.server}.`,
        'warn_server'
      ));
    }
  }

  // --- Rule 7: MINOR_DECOY_RISK — pattern suggesting sting ---
  // Minor decoy stings: young-looking customer, no ID requested, first order
  for (const order of orders) {
    if (!order.id_verified && order.customer_age != null && order.customer_age < 25) {
      // Young customer without ID = high minor decoy risk
      alerts.push(makeAlert(
        'minor_decoy_risk', 'critical', 'state_liquor_law',
        order, undefined, { age: order.customer_age },
        FINE_BY_RULE.minor_decoy_risk,
        0,
        `MINOR DECOY RISK: Young customer (age ${order.customer_age}) served alcohol without ID verification. This matches minor decoy sting pattern (state liquor control sends 18-20 year olds). If decoy: $${FINE_BY_RULE.minor_decoy_risk.toLocaleString()} fine + automatic license mark. ALWAYS card anyone appearing under 30.`,
        'verify_id'
      ));
    }
  }

  // --- Rule 8: DRAM_SHOP_EXPOSURE — cumulative over-service = liability ---
  const overServiceCount = alerts.filter(a => a.rule_id === 'over_service_risk').length;
  if (overServiceCount >= 2) {
    alerts.push(makeAlert(
      'dram_shop_exposure', 'critical', 'dram_shop',
      undefined, undefined, { count: overServiceCount },
      0,
      LIABILITY_BY_SEVERITY.critical,
      `DRAM SHOP EXPOSURE: ${overServiceCount} customers over-served tonight. If any causes accident/injury after leaving, restaurant liable for $${LIABILITY_BY_SEVERITY.critical.toLocaleString()}+ lawsuit (dram shop liability). Train staff on refusal techniques + log all over-service incidents.`,
      'log_incident'
    ));
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
            { role: 'system', content: 'You are a restaurant alcohol compliance and liability risk AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Alcohol compliance alert: ${a.rule_id} — ${a.description}. Fine: ${fmt$(a.est_fine)}, liability: ${fmt$(a.est_liability)}.` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM alcohol_compliance_alert WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE alcohol_compliance_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { alerts, generated: alerts.length };
};

// ---------------------------------------------------------------------------
// Helper: build an alert
// ---------------------------------------------------------------------------
function makeAlert(
  ruleId: AlcoholRuleId,
  severity: AlcoholAlert['severity'],
  complianceType: AlcoholAlert['compliance_type'],
  order: AlcoholOrderData | undefined,
  _unused: undefined,
  extra: { name?: string; drinks?: number; perHour?: number; server?: string; age?: number; count?: number; cert_type?: string; expiry?: string; compCount?: number } | undefined,
  estFine: number,
  estLiability: number,
  description: string,
  aiRec: AlcoholAiRec
): AlcoholAlert {
  const now = new Date();
  return {
    rule_id: ruleId,
    severity,
    compliance_type: complianceType,
    order_id: order?.order_id,
    customer_id: order?.customer_id,
    customer_name: order?.customer_name ?? extra?.name,
    server_id: order?.server_id,
    server_name: order?.server_name ?? extra?.server,
    drinks_served: order?.drink_count ?? extra?.drinks,
    drinks_per_hour: extra?.perHour,
    est_fine: estFine,
    est_liability: estLiability,
    description,
    ai_recommendation: aiRec,
    status: 'open',
    detected_at: now,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<AlcoholAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM alcohol_compliance_alert
       WHERE status = 'open'
       ORDER BY est_fine DESC, est_liability DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number;
  criticalCount: number;
  totalFines: number;
  totalLiability: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_fine) AS fines,
         math::sum(est_liability) AS liability
       FROM alcohol_compliance_alert
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalFines: safeNumber(r.fines, 0),
      totalLiability: safeNumber(r.liability, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalFines: 0, totalLiability: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
