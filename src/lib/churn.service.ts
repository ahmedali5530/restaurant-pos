/**
 * AI Churn Prediction service — identify at-risk customers + retention.
 *
 * Research finding: Toast Customer 360 + Square Customer Retention bundle
 * churn prediction in higher tiers (~$50/mo). POSR offers it free —
 * identifies customers likely to churn in next 30 days + generates
 * personalized retention recommendations + tracks churn trend over time.
 *
 * Complements CLV (which computes churn_risk per customer) by adding:
 *   1. At-risk customer identification — list of customers with high churn_risk
 *      + their CLV (to prioritize retention efforts by value)
 *   2. AI retention recommendations — per-customer: which action + message
 *   3. Churn snapshot history — periodic rollups for trend analysis
 *   4. Retention action tracking — record attempts + outcomes
 *   5. Churn drivers analysis — common patterns among high-risk customers
 *
 * Priority tiers:
 *   CRITICAL — churn_risk >= 0.7 AND CLV >= min_clv_for_retention
 *     → immediate action (personal call/visit)
 *   HIGH — churn_risk >= 0.5 AND CLV >= min_clv_for_retention
 *     → active retention (email/SMS with personalized offer)
 *   MODERATE — churn_risk >= 0.4
 *     → passive monitoring (automated re-engagement campaign)
 *   LOW — churn_risk < 0.4
 *     → no action needed (healthy)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChurnPriority = 'critical' | 'high' | 'moderate' | 'low';
export type RetentionActionType = 'email' | 'sms' | 'phone_call' | 'discount' | 'loyalty_bonus' | 'personal_visit' | 'other';
export type RetentionOutcome = 'pending' | 'saved' | 'churned' | 'no_response';

export interface AtRiskCustomer {
  customer_id: string;
  customer_name: string;
  email?: string;
  phone?: string;
  churn_risk: number;
  clv: number;
  segment: string;
  days_since_last_order: number;
  total_orders: number;
  loyalty_tier?: string;
  priority: ChurnPriority;
  ai_recommendation?: string;
  ai_message?: string;
  suggested_action: RetentionActionType;
}

export interface ChurnSnapshot {
  id?: string;
  snapshot_date: Date;
  period_type: 'daily' | 'weekly' | 'monthly';
  total_customers: number;
  at_risk_count: number;
  critical_count: number;
  avg_churn_risk: number;
  churn_rate: number;
  revenue_at_risk: number;
  by_segment?: Record<string, number>;
  top_churn_drivers?: string[];
  ai_summary?: string;
  generated_at: Date;
}

export interface RetentionAction {
  id?: string;
  customer_id: string;
  customer_name: string;
  action_type: RetentionActionType;
  description?: string;
  churn_risk_at_action: number;
  clv_at_action: number;
  initiated_by?: string;
  initiated_at: Date;
  outcome: RetentionOutcome;
  outcome_date?: Date;
  notes?: string;
}

export interface ChurnConfig {
  atRiskThreshold: number;
  criticalThreshold: number;
  predictionWindowDays: number;
  aiEnabled: boolean;
  minClvForRetention: number;
}

export const DEFAULT_CHURN_CONFIG: ChurnConfig = {
  atRiskThreshold: 0.5,
  criticalThreshold: 0.7,
  predictionWindowDays: 30,
  aiEnabled: true,
  minClvForRetention: 100,
};

export const readChurnConfig = (settings: any): ChurnConfig => ({
  atRiskThreshold: safeNumber(settings?.churn_at_risk_threshold, 0.5),
  criticalThreshold: safeNumber(settings?.churn_critical_threshold, 0.7),
  predictionWindowDays: safeNumber(settings?.churn_prediction_window_days, 30),
  aiEnabled: settings?.churn_ai_enabled ?? true,
  minClvForRetention: safeNumber(settings?.churn_min_clv_for_retention, 100),
});

// ---------------------------------------------------------------------------
// At-risk customer identification
// ---------------------------------------------------------------------------

const determinePriority = (
  churnRisk: number,
  clv: number,
  config: ChurnConfig
): ChurnPriority => {
  // Below retention threshold — let churn (low priority even if high risk)
  if (clv < config.minClvForRetention) {
    if (churnRisk >= config.criticalThreshold) return 'moderate';
    return 'low';
  }
  if (churnRisk >= config.criticalThreshold) return 'critical';
  if (churnRisk >= config.atRiskThreshold) return 'high';
  if (churnRisk >= 0.4) return 'moderate';
  return 'low';
};

const determineSuggestedAction = (
  priority: ChurnPriority,
  segment: string,
  loyaltyTier?: string
): RetentionActionType => {
  if (priority === 'critical') {
    // High-value + high-risk → personal touch
    if (segment === 'cant_lose') return 'personal_visit';
    return 'phone_call';
  }
  if (priority === 'high') {
    // Active retention
    if (loyaltyTier === 'platinum' || loyaltyTier === 'gold') return 'loyalty_bonus';
    return 'email';
  }
  if (priority === 'moderate') {
    return 'sms';
  }
  return 'email';
};

export const getAtRiskCustomers = async (
  db: ReturnType<typeof useDB>,
  config: ChurnConfig = DEFAULT_CHURN_CONFIG
): Promise<AtRiskCustomer[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM customer_clv
       WHERE expires_at > time::now()
         AND churn_risk >= 0.4
       ORDER BY churn_risk DESC, total_clv DESC`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    return rows.map((c: any) => {
      const churnRisk = safeNumber(c.churn_risk, 0);
      const clv = safeNumber(c.total_clv, 0);
      const priority = determinePriority(churnRisk, clv, config);
      const suggestedAction = determineSuggestedAction(priority, c.segment, c.loyalty_tier);

      return {
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        email: c.email,
        phone: c.phone,
        churn_risk: churnRisk,
        clv,
        segment: c.segment,
        days_since_last_order: safeNumber(c.days_since_last_order, 0),
        total_orders: safeNumber(c.total_orders, 0),
        loyalty_tier: c.loyalty_tier,
        priority,
        suggested_action: suggestedAction,
        ai_recommendation: c.ai_insight,
      };
    }).filter(c => c.priority !== 'low');
  } catch (err) {
    console.error('[churn] getAtRiskCustomers failed', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// AI retention recommendations — per-customer message + action
// ---------------------------------------------------------------------------

export const generateRetentionRecommendations = async (
  customers: AtRiskCustomer[]
): Promise<void> => {
  if (customers.length === 0) return;

  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[churn] OpenAI not available — using rule-based recommendations');
    ruleBasedRecommendations(customers);
    return;
  }

  // Top 20 most at-risk (to keep prompt manageable)
  const top = customers.slice(0, 20);

  const prompt = `You are a restaurant customer retention expert.
For each at-risk customer, suggest a personalized retention message + action.

At-risk customers (JSON):
${JSON.stringify(top.map(c => ({
  name: c.customer_name,
  churn_risk: c.churn_risk,
  clv: c.clv,
  segment: c.segment,
  days_since_last: c.days_since_last_order,
  total_orders: c.total_orders,
  loyalty_tier: c.loyalty_tier ?? 'none',
  suggested_action: c.suggested_action,
  priority: c.priority,
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match customer name>",
  "message": "<max 200 chars — personalized retention message they'd respond to>",
  "action": "email" | "sms" | "phone_call" | "discount" | "loyalty_bonus" | "personal_visit" | "other",
  "offer": "<max 100 chars — specific offer if applicable, empty if none>"
}]

Make messages warm + specific (reference their history). Don't be generic.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant customer retention AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 2000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      ruleBasedRecommendations(customers);
      return;
    }
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      message?: string;
      action?: RetentionActionType;
      offer?: string;
    }>;

    for (const item of parsed) {
      const customer = customers.find(c => c.customer_name === item.name);
      if (!customer) continue;
      if (item.message) customer.ai_message = item.message.slice(0, 200);
      if (item.action && ['email', 'sms', 'phone_call', 'discount', 'loyalty_bonus', 'personal_visit', 'other'].includes(item.action)) {
        customer.suggested_action = item.action;
      }
      if (item.offer) {
        customer.ai_recommendation = (customer.ai_recommendation ?? '') + ` Offer: ${item.offer}`.slice(0, 300);
      }
    }
  } catch (err) {
    console.warn('[churn] AI recommendations failed', err);
    ruleBasedRecommendations(customers);
  }
};

const ruleBasedRecommendations = (customers: AtRiskCustomer[]): void => {
  for (const c of customers) {
    const days = c.days_since_last_order;
    if (c.priority === 'critical') {
      c.ai_message = `Hi ${c.customer_name}, we've missed you! It's been ${days} days since your last visit. We'd love to welcome you back — please call us to reserve your favorite table.`;
    } else if (c.priority === 'high') {
      c.ai_message = `Hi ${c.customer_name}, we noticed you haven't visited in a while. As a valued customer, we'd like to offer you a special welcome-back treat on your next visit.`;
    } else {
      c.ai_message = `Hi ${c.customer_name}, we miss seeing you! Come back soon — we have new menu items we think you'll love.`;
    }
  }
};

// ---------------------------------------------------------------------------
// Churn snapshot — for trend tracking
// ---------------------------------------------------------------------------

export const generateSnapshot = async (
  db: ReturnType<typeof useDB>,
  config: ChurnConfig = DEFAULT_CHURN_CONFIG
): Promise<ChurnSnapshot | null> => {
  try {
    // Fetch all current CLV records
    const result = await db.query(
      `SELECT * FROM customer_clv WHERE expires_at > time::now()`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return null;

    const total = rows.length;
    const atRisk = rows.filter((c: any) => safeNumber(c.churn_risk, 0) >= config.atRiskThreshold);
    const critical = rows.filter((c: any) => safeNumber(c.churn_risk, 0) >= config.criticalThreshold);
    const avgRisk = rows.reduce((s: number, c: any) => s + safeNumber(c.churn_risk, 0), 0) / total;
    const churnRate = (atRisk.length / total) * 100;
    const revenueAtRisk = atRisk.reduce((s: number, c: any) => s + safeNumber(c.predictive_clv, 0), 0);

    // Segment counts
    const bySegment: Record<string, number> = {};
    for (const c of rows) {
      const seg = (c as any).segment ?? 'unknown';
      bySegment[seg] = (bySegment[seg] ?? 0) + 1;
    }

    // Churn drivers — common patterns among high-risk
    const highRisk = rows.filter((c: any) => safeNumber(c.churn_risk, 0) >= 0.6);
    const drivers: string[] = [];
    if (highRisk.length > 0) {
      const avgDaysSince = highRisk.reduce((s: number, c: any) => s + safeNumber((c as any).days_since_last_order, 0), 0) / highRisk.length;
      drivers.push(`Avg ${Math.round(avgDaysSince)} days since last order`);
      const lowFreq = highRisk.filter((c: any) => safeNumber((c as any).total_orders, 0) < 3).length;
      drivers.push(`${lowFreq}/${highRisk.length} had < 3 total orders`);
      const noLoyalty = highRisk.filter((c: any) => !(c as any).is_loyalty_member).length;
      drivers.push(`${noLoyalty}/${highRisk.length} are not loyalty members`);
    }

    // AI summary
    let aiSummary: string | undefined;
    if (config.aiEnabled) {
      aiSummary = await generateAISummary({
        total,
        atRiskCount: atRisk.length,
        criticalCount: critical.length,
        avgRisk,
        churnRate,
        revenueAtRisk,
        bySegment,
        drivers,
      });
    }

    const snapshot: ChurnSnapshot = {
      snapshot_date: new Date(),
      period_type: 'weekly',
      total_customers: total,
      at_risk_count: atRisk.length,
      critical_count: critical.length,
      avg_churn_risk: Math.round(avgRisk * 100) / 100,
      churn_rate: Math.round(churnRate * 100) / 100,
      revenue_at_risk: Math.round(revenueAtRisk * 100) / 100,
      by_segment: bySegment,
      top_churn_drivers: drivers,
      ai_summary: aiSummary,
      generated_at: new Date(),
    };

    // Persist
    try {
      await db.query(
        `CREATE churn_snapshot CONTENT $data`,
        {
          data: {
            ...snapshot,
            snapshot_date: snapshot.snapshot_date.toISOString(),
            generated_at: snapshot.generated_at.toISOString(),
          },
        }
      );
    } catch (err) {
      console.warn('[churn] persist snapshot failed', err);
    }

    return snapshot;
  } catch (err) {
    console.error('[churn] generateSnapshot failed', err);
    return null;
  }
};

interface SnapshotData {
  total: number;
  atRiskCount: number;
  criticalCount: number;
  avgRisk: number;
  churnRate: number;
  revenueAtRisk: number;
  bySegment: Record<string, number>;
  drivers: string[];
}

const generateAISummary = async (data: SnapshotData): Promise<string> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) return '';

  const prompt = `You are a restaurant customer retention analyst.
Summarize this churn snapshot in max 300 chars.

Total customers: ${data.total}
At-risk: ${data.atRiskCount} (${(data.atRiskCount / data.total * 100).toFixed(0)}%)
Critical: ${data.criticalCount}
Avg churn risk: ${(data.avgRisk * 100).toFixed(0)}%
Revenue at risk: $${data.revenueAtRisk.toFixed(0)}
Segments: ${JSON.stringify(data.bySegment)}
Drivers: ${data.drivers.join('; ')}

Provide: overall assessment + what to prioritize. Be specific + actionable.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant retention analyst AI. Respond with a single paragraph, max 300 chars.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Retention action tracking
// ---------------------------------------------------------------------------

export const logRetentionAction = async (
  db: ReturnType<typeof useDB>,
  action: Omit<RetentionAction, 'id' | 'initiated_at' | 'outcome'>
): Promise<string | null> => {
  try {
    const result = await db.query(
      `CREATE retention_action CONTENT $data`,
      {
        data: {
          ...action,
          initiated_at: new Date().toISOString(),
          outcome: 'pending',
        },
      }
    );
    return (result as any)?.id?.toString?.() ?? null;
  } catch (err) {
    console.error('[churn] logRetentionAction failed', err);
    return null;
  }
};

export const updateRetentionOutcome = async (
  db: ReturnType<typeof useDB>,
  actionId: string,
  outcome: RetentionOutcome,
  notes?: string
): Promise<void> => {
  try {
    await db.query(
      `UPDATE $id SET outcome = $outcome, outcome_date = time::now(), notes = $notes`,
      { id: actionId, outcome, notes: notes ?? null }
    );
  } catch (err) {
    console.error('[churn] updateRetentionOutcome failed', err);
  }
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getSnapshotHistory = async (
  db: ReturnType<typeof useDB>,
  limit = 12
): Promise<ChurnSnapshot[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM churn_snapshot ORDER BY snapshot_date DESC LIMIT $limit`,
      { limit }
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[churn] getSnapshotHistory failed', err);
    return [];
  }
};

export const getRetentionActions = async (
  db: ReturnType<typeof useDB>,
  limit = 50
): Promise<RetentionAction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM retention_action ORDER BY initiated_at DESC LIMIT $limit`,
      { limit }
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[churn] getRetentionActions failed', err);
    return [];
  }
};

export interface RetentionStats {
  total: number;
  saved: number;
  churned: number;
  pending: number;
  noResponse: number;
  saveRate: number;
  revenueSaved: number;
}

export const getRetentionStats = async (
  db: ReturnType<typeof useDB>
): Promise<RetentionStats> => {
  try {
    const result = await db.query(
      `SELECT outcome, count() AS count, clv_at_action FROM retention_action
       WHERE outcome != 'pending'
       GROUP BY outcome`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const total = rows.reduce((s: number, r: any) => s + safeNumber(r.count, 0), 0);
    const saved = rows.find((r: any) => r.outcome === 'saved');
    const churned = rows.find((r: any) => r.outcome === 'churned');
    const noResponse = rows.find((r: any) => r.outcome === 'no_response');

    const savedCount = safeNumber(saved?.count, 0);
    const saveRate = total > 0 ? (savedCount / total) * 100 : 0;
    const revenueSaved = safeNumber(saved?.clv_at_action, 0);

    return {
      total,
      saved: savedCount,
      churned: safeNumber(churned?.count, 0),
      pending: 0,
      noResponse: safeNumber(noResponse?.count, 0),
      saveRate: Math.round(saveRate * 100) / 100,
      revenueSaved: Math.round(revenueSaved * 100) / 100,
    };
  } catch (err) {
    console.error('[churn] getRetentionStats failed', err);
    return { total: 0, saved: 0, churned: 0, pending: 0, noResponse: 0, saveRate: 0, revenueSaved: 0 };
  }
};
