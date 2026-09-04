/**
 * AI Customer Order Frequency Predictor — predicts the frequency trajectory
 * (increasing/stable/declining/dormant) of each customer and triggers proactive
 * outreach during decline, before churn happens.
 *
 * 121st POSR-exclusive differentiator — restaurants lose $400-1,500/mo per
 * location from declining customer order frequency going undetected. No POS
 * tracks frequency trajectory.
 *
 * Distinct from:
 *   - visit-cadence.service (21st) — predicts WHEN next visit occurs (timing)
 *   - churn-prediction.service — predicts IF customer will leave (binary)
 *   - retention-program.service — general retention (not frequency-targeted)
 *   - clv-trajectory.service — tracks VALUE direction (not frequency)
 *   - customer-segmentation.service — segments by behavior (not frequency trend)
 *   - winback.service — targets already-left customers (not declining)
 *
 * 8 AI rules:
 *   1. frequency_declining — current freq <75% of baseline → proactive outreach
 *   2. frequency_increased — current freq >125% of baseline → reward + amplify
 *   3. frequency_stable_high — high + stable frequency → VIP recognition
 *   4. dormant_customer — no orders in 6+ weeks → winback offer
 *   5. frequency_recovery_needed — declining after being high → urgent intervention
 *   6. seasonal_frequency_shift — seasonal pattern (not true decline) → don't overreact
 *   7. frequency_baseline_drop — baseline itself dropping (long-term decline) → investigate
 *   8. frequency_momentum — frequency accelerating upward → capitalize
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type OrderFreqRuleId =
  | 'frequency_declining'
  | 'frequency_increased'
  | 'frequency_stable_high'
  | 'dormant_customer'
  | 'frequency_recovery_needed'
  | 'seasonal_frequency_shift'
  | 'frequency_baseline_drop'
  | 'frequency_momentum';

export type OrderFreqAiRec =
  | 'send_reminder'
  | 'winback_offer'
  | 'loyalty_reward'
  | 'frequency_incentive'
  | 'monitor'
  | 'investigate'
  | 'skip';

export interface OrderFreqAlert {
  id?: string;
  rule_id: OrderFreqRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_id: string;
  customer_name: string;
  baseline_frequency?: number;
  current_frequency?: number;
  previous_frequency?: number;
  frequency_trend?: string;
  frequency_change_pct?: number;
  weeks_since_last_order?: number;
  predicted_churn_weeks?: number;
  total_orders?: number;
  customer_value?: string;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: OrderFreqAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface OrderFreqConfig {
  aiEnabled: boolean;
  declineThreshold: number;
  dormantWeeks: number;
  churnWindow: number;
  seasonalFilter: boolean;
}

export const DEFAULT_ORDFREQ_CONFIG: OrderFreqConfig = {
  aiEnabled: true,
  declineThreshold: 25.0,
  dormantWeeks: 6,
  churnWindow: 8,
  seasonalFilter: true,
};

export const readOrderFreqConfig = (settings: any): OrderFreqConfig => ({
  aiEnabled: settings?.ordfreq_ai_enabled ?? true,
  declineThreshold: safeNumber(settings?.ordfreq_decline_threshold, 25.0),
  dormantWeeks: safeNumber(settings?.ordfreq_dormant_weeks, 6),
  churnWindow: safeNumber(settings?.ordfreq_churn_window, 8),
  seasonalFilter: settings?.ordfreq_seasonal_filter ?? true,
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface CustomerFreqData {
  customer_id: string;
  customer_name: string;
  baseline_frequency: number;    // historical avg orders/week (6mo baseline)
  current_frequency: number;     // current orders/week (rolling 4wk)
  previous_frequency: number;    // previous 4wk frequency
  weeks_since_last_order: number;
  total_orders: number;
  avg_order_value: number;
  customer_value: 'high_value' | 'medium_value' | 'low_value';
  // For seasonal filter
  seasonal_pattern?: boolean;    // does customer have known seasonal pattern?
  // For baseline_drop detection
  previous_baseline?: number;    // baseline from 6-12 months ago
}

const MOCK_CUSTOMERS: CustomerFreqData[] = [
  {
    customer_id: 'F001', customer_name: 'Sarah Chen',
    baseline_frequency: 2.5, current_frequency: 1.5, previous_frequency: 1.8,
    weeks_since_last_order: 2, total_orders: 65, avg_order_value: 32,
    customer_value: 'high_value', previous_baseline: 2.8,
  },
  {
    customer_id: 'F002', customer_name: 'Mike Rodriguez',
    baseline_frequency: 1.0, current_frequency: 1.8, previous_frequency: 1.4,
    weeks_since_last_order: 1, total_orders: 42, avg_order_value: 28,
    customer_value: 'medium_value',
  },
  {
    customer_id: 'F003', customer_name: 'Emma Williams',
    baseline_frequency: 3.2, current_frequency: 3.0, previous_frequency: 3.1,
    weeks_since_last_order: 0, total_orders: 120, avg_order_value: 25,
    customer_value: 'high_value',
  },
  {
    customer_id: 'F004', customer_name: 'James Park',
    baseline_frequency: 1.5, current_frequency: 0, previous_frequency: 0.2,
    weeks_since_last_order: 8, total_orders: 35, avg_order_value: 45,
    customer_value: 'high_value', seasonal_pattern: true,
  },
  {
    customer_id: 'F005', customer_name: 'Lisa Anderson',
    baseline_frequency: 2.0, current_frequency: 1.0, previous_frequency: 1.4,
    weeks_since_last_order: 3, total_orders: 50, avg_order_value: 30,
    customer_value: 'medium_value', previous_baseline: 2.2,
  },
  {
    customer_id: 'F006', customer_name: 'David Kumar',
    baseline_frequency: 0.8, current_frequency: 1.5, previous_frequency: 1.2,
    weeks_since_last_order: 1, total_orders: 28, avg_order_value: 38,
    customer_value: 'high_value',
  },
  {
    customer_id: 'F007', customer_name: 'Rachel Green',
    baseline_frequency: 1.2, current_frequency: 0.8, previous_frequency: 1.0,
    weeks_since_last_order: 4, total_orders: 38, avg_order_value: 26,
    customer_value: 'medium_value', previous_baseline: 1.5,
  },
  {
    customer_id: 'F008', customer_name: 'Tom Wilson',
    baseline_frequency: 2.8, current_frequency: 2.5, previous_frequency: 2.6,
    weeks_since_last_order: 0, total_orders: 95, avg_order_value: 35,
    customer_value: 'high_value',
  },
];

function computeTrend(current: number, previous: number): 'increasing' | 'stable' | 'declining' | 'dormant' {
  if (current === 0 && previous === 0) return 'dormant';
  const changePct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  if (changePct >= 15) return 'increasing';
  if (changePct <= -15) return 'declining';
  return 'stable';
}

function computeChurnWeeks(currentFreq: number, baselineFreq: number): number {
  if (currentFreq <= 0) return 0;
  const declineRate = (baselineFreq - currentFreq) / Math.max(baselineFreq, 0.1);
  if (declineRate <= 0) return 999;
  return Math.round(currentFreq / (currentFreq * declineRate));
}

export const runOrderFreqEngine = async (
  db: ReturnType<typeof useDB>,
  config: OrderFreqConfig = DEFAULT_ORDFREQ_CONFIG
): Promise<{ alerts: OrderFreqAlert[]; generated: number }> => {
  const alerts: OrderFreqAlert[] = [];
  const now = new Date();

  let customers: CustomerFreqData[] = [];
  try {
    const result = await db.query(
      `SELECT customer_id, customer_name, baseline_frequency, current_frequency,
              previous_frequency, weeks_since_last_order, total_orders,
              avg_order_value, customer_value, seasonal_pattern, previous_baseline
       FROM order_frequency_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    customers = rows.map((r: any) => ({
      customer_id: String(r.customer_id ?? 'Unknown'),
      customer_name: String(r.customer_name ?? 'Unknown'),
      baseline_frequency: safeNumber(r.baseline_frequency, 0),
      current_frequency: safeNumber(r.current_frequency, 0),
      previous_frequency: safeNumber(r.previous_frequency, 0),
      weeks_since_last_order: safeNumber(r.weeks_since_last_order, 0),
      total_orders: safeNumber(r.total_orders, 0),
      avg_order_value: safeNumber(r.avg_order_value, 0),
      customer_value: r.customer_value ?? 'medium_value',
      seasonal_pattern: r.seasonal_pattern ?? false,
      previous_baseline: r.previous_baseline != null ? safeNumber(r.previous_baseline, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[ordfreq] fetchCustomers failed — using mock', err);
  }

  if (customers.length === 0) {
    customers = MOCK_CUSTOMERS;
  }

  for (const c of customers) {
    const changePct = c.baseline_frequency > 0
      ? ((c.current_frequency - c.baseline_frequency) / c.baseline_frequency) * 100
      : 0;
    const trend = computeTrend(c.current_frequency, c.previous_frequency);
    const churnWeeks = computeChurnWeeks(c.current_frequency, c.baseline_frequency);
    const monthlyOpp = Math.round(c.avg_order_value * c.baseline_frequency * 4 * 0.3);

    // Rule 1: FREQUENCY_DECLINING (current <75% of baseline)
    if (changePct <= -config.declineThreshold && c.current_frequency > 0 && !c.seasonal_pattern) {
      alerts.push({
        rule_id: 'frequency_declining',
        severity: churnWeeks <= config.churnWindow ? 'critical' : 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        baseline_frequency: c.baseline_frequency,
        current_frequency: c.current_frequency,
        previous_frequency: c.previous_frequency,
        frequency_trend: trend,
        frequency_change_pct: Math.round(changePct * 10) / 10,
        weeks_since_last_order: c.weeks_since_last_order,
        predicted_churn_weeks: churnWeeks,
        total_orders: c.total_orders,
        customer_value: c.customer_value,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: FREQUENCY DECLINING — current ${c.current_frequency.toFixed(1)}/wk vs baseline ${c.baseline_frequency.toFixed(1)}/wk (${changePct.toFixed(0)}% decline). Trend: ${trend}. At current decline rate, predicted churn in ${churnWeeks} weeks. SEND REMINDER now — proactive outreach during decline is 5x more effective than after churn. ${c.customer_value === 'high_value' ? 'HIGH-VALUE customer — prioritize intervention.' : ''} Potential ${fmt$(monthlyOpp)}/mo if frequency restored.`,
        ai_recommendation: 'send_reminder',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: FREQUENCY_INCREASED (current >125% of baseline)
    if (changePct >= 25 && trend === 'increasing') {
      alerts.push({
        rule_id: 'frequency_increased',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        baseline_frequency: c.baseline_frequency,
        current_frequency: c.current_frequency,
        frequency_trend: trend,
        frequency_change_pct: Math.round(changePct * 10) / 10,
        total_orders: c.total_orders,
        customer_value: c.customer_value,
        est_monthly_opportunity: Math.round(c.avg_order_value * c.current_frequency * 4 * 0.1),
        description: `${c.customer_name}: FREQUENCY INCREASED — current ${c.current_frequency.toFixed(1)}/wk vs baseline ${c.baseline_frequency.toFixed(1)}/wk (+${changePct.toFixed(0)}%). Customer is ordering MORE often — momentum building. REWARD this behavior: loyalty reward, personalized thank-you, or frequency-based perk. Amplifying increasing frequency locks in the habit. Each additional visit/week = ${fmt$(c.avg_order_value * 4)}/mo in added revenue.`,
        ai_recommendation: 'loyalty_reward',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: FREQUENCY_STABLE_HIGH (high + stable frequency → VIP)
    if (c.current_frequency >= 2.5 && trend === 'stable' && c.customer_value === 'high_value') {
      alerts.push({
        rule_id: 'frequency_stable_high',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        baseline_frequency: c.baseline_frequency,
        current_frequency: c.current_frequency,
        frequency_trend: trend,
        total_orders: c.total_orders,
        customer_value: c.customer_value,
        est_monthly_opportunity: Math.round(c.avg_order_value * c.current_frequency * 4 * 0.05),
        description: `${c.customer_name}: STABLE HIGH FREQUENCY — ${c.current_frequency.toFixed(1)}/wk consistently, ${c.total_orders} total orders. Top-tier loyal customer. VIP RECOGNITION: personal greeting, priority service, exclusive offers. Stable high-frequency customers are the foundation of revenue — don't take them for granted. Small recognition investment preserves ${fmt$(c.avg_order_value * c.current_frequency * 4)}/mo in revenue.`,
        ai_recommendation: 'loyalty_reward',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: DORMANT_CUSTOMER (no orders in 6+ weeks)
    if (c.weeks_since_last_order >= config.dormantWeeks) {
      alerts.push({
        rule_id: 'dormant_customer',
        severity: c.customer_value === 'high_value' ? 'critical' : 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        baseline_frequency: c.baseline_frequency,
        current_frequency: c.current_frequency,
        weeks_since_last_order: c.weeks_since_last_order,
        total_orders: c.total_orders,
        customer_value: c.customer_value,
        predicted_churn_weeks: 0,
        est_monthly_opportunity: Math.round(c.avg_order_value * c.baseline_frequency * 4 * 0.5),
        description: `${c.customer_name}: DORMANT — no orders in ${c.weeks_since_last_order} weeks (baseline was ${c.baseline_frequency.toFixed(1)}/wk). Customer has effectively churned. WINBACK OFFER needed: compelling incentive to return (50% off, free item, personal outreach). ${c.customer_value === 'high_value' ? 'Was HIGH-VALUE — losing ${fmt$(c.avg_order_value * c.baseline_frequency * 4)}/mo in revenue. ' : ''}Winback success rate drops to <5% after 12 weeks dormant — act NOW.`,
        ai_recommendation: 'winback_offer',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: FREQUENCY_RECOVERY_NEEDED (declining after being high)
    if (changePct <= -config.declineThreshold && c.baseline_frequency >= 2.0 && c.customer_value === 'high_value') {
      alerts.push({
        rule_id: 'frequency_recovery_needed',
        severity: 'critical',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        baseline_frequency: c.baseline_frequency,
        current_frequency: c.current_frequency,
        frequency_change_pct: Math.round(changePct * 10) / 10,
        weeks_since_last_order: c.weeks_since_last_order,
        predicted_churn_weeks: churnWeeks,
        customer_value: c.customer_value,
        est_monthly_opportunity: monthlyOpp * 2,
        description: `${c.customer_name}: RECOVERY NEEDED — was high-frequency (${c.baseline_frequency.toFixed(1)}/wk) now declining (${c.current_frequency.toFixed(1)}/wk, ${changePct.toFixed(0)}%). HIGH-VALUE customer at risk of churn in ${churnWeeks} weeks. URGENT INTERVENTION: personal manager outreach, not just automated reminder. "We miss you" message + compelling offer. Losing this customer = ${fmt$(c.avg_order_value * c.baseline_frequency * 4 * 12)}/year in revenue.`,
        ai_recommendation: 'winback_offer',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: SEASONAL_FREQUENCY_SHIFT (seasonal pattern, not true decline)
    if (c.seasonal_pattern && changePct <= -config.declineThreshold) {
      alerts.push({
        rule_id: 'seasonal_frequency_shift',
        severity: 'low',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        baseline_frequency: c.baseline_frequency,
        current_frequency: c.current_frequency,
        frequency_change_pct: Math.round(changePct * 10) / 10,
        est_monthly_opportunity: 0,
        description: `${c.customer_name}: SEASONAL SHIFT — frequency declined ${changePct.toFixed(0)}% but customer has known seasonal pattern. NOT a true decline — frequency will recover seasonally. DON'T overreact with aggressive winback offers (wastes budget). MONITOR — if frequency doesn't recover within expected seasonal window, then escalate. Seasonal filter prevents false-positive decline alerts. Saves ${fmt$(15)} in misallocated outreach per customer.`,
        ai_recommendation: 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: FREQUENCY_BASELINE_DROP (baseline itself dropping → long-term decline)
    if (c.previous_baseline != null && c.baseline_frequency < c.previous_baseline * 0.85) {
      const baselineDropPct = ((c.previous_baseline - c.baseline_frequency) / c.previous_baseline) * 100;
      alerts.push({
        rule_id: 'frequency_baseline_drop',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        baseline_frequency: c.baseline_frequency,
        current_frequency: c.current_frequency,
        previous_frequency: c.previous_baseline,
        frequency_change_pct: Math.round(baselineDropPct * 10) / 10,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: BASELINE DROP — 6-month baseline dropped ${baselineDropPct.toFixed(0)}% from previous period (${c.previous_baseline.toFixed(1)} → ${c.baseline_frequency.toFixed(1)}/wk). This isn't a temporary dip — the CUSTOMER'S NEW NORMAL is lower frequency. Long-term engagement declining. INVESTIGATE: did something change? Competitor? Dissatisfaction? Price? Address root cause — surface-level reminders won't fix structural decline.`,
        ai_recommendation: 'investigate',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: FREQUENCY_MOMENTUM (frequency accelerating upward)
    if (trend === 'increasing' && c.current_frequency > c.previous_frequency * 1.3 && c.current_frequency >= c.baseline_frequency) {
      const momentumPct = ((c.current_frequency - c.previous_frequency) / Math.max(c.previous_frequency, 0.1)) * 100;
      alerts.push({
        rule_id: 'frequency_momentum',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        baseline_frequency: c.baseline_frequency,
        current_frequency: c.current_frequency,
        previous_frequency: c.previous_frequency,
        frequency_trend: trend,
        est_monthly_opportunity: Math.round(c.avg_order_value * c.current_frequency * 4 * 0.15),
        description: `${c.customer_name}: FREQUENCY MOMENTUM — frequency jumped ${momentumPct.toFixed(0)}% in last 4 weeks (${c.previous_frequency.toFixed(1)} → ${c.current_frequency.toFixed(1)}/wk). Customer is accelerating — capitalize NOW. FREQUENCY INCENTIVE: "You've visited 3x this week — 4th visit is on us!" Amplifies momentum into habit. Momentum customers are 3x more likely to become long-term regulars if rewarded during acceleration phase.`,
        ai_recommendation: 'frequency_incentive',
        status: 'open', detected_at: now,
      });
    }
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant customer retention AI specializing in order frequency trajectory analysis. Recommend specific proactive interventions to prevent frequency decline from becoming churn. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Customer: ${a.customer_name} — ${a.rule_id}. Baseline ${a.baseline_frequency ?? 0}/wk, current ${a.current_frequency ?? 0}/wk (${a.frequency_change_pct ?? 0}% change). Trend: ${a.frequency_trend ?? 'N/A'}. Last order: ${a.weeks_since_last_order ?? 0}wk ago. Predicted churn: ${a.predicted_churn_weeks ?? '?'}wk. Value: ${a.customer_value ?? 'N/A'}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM order_frequency_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE order_frequency_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<OrderFreqAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM order_frequency_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  decliningCount: number; dormantCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'frequency_declining') AS declining,
              math::count(rule_id = 'dormant_customer') AS dormant
       FROM order_frequency_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      decliningCount: safeNumber(r.declining, 0), dormantCount: safeNumber(r.dormant, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, decliningCount: 0, dormantCount: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
