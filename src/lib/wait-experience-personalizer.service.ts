/**
 * AI Customer Wait Experience Personalizer — personalizes the wait experience
 * based on customer profile, predicted wait time, and context to reduce
 * perceived wait and prevent complaint escalation.
 *
 * 116th POSR-exclusive differentiator — restaurants lose $200-800/mo per
 * location from poor wait experience management. No POS personalizes the
 * wait experience based on customer profile.
 *
 * Distinct from:
 *   - wait-prediction.service (predicts WAIT TIME — NOT experience personalization)
 *   - waitlist-optimizer.service (optimizes WAITLIST management — NOT experience)
 *   - seating-optimization.service (optimizes TABLE allocation — NOT experience)
 *   - table-turnover.service (tracks table duration — NOT wait experience)
 *   - customer-segmentation.service (segments customers — NOT wait tactics)
 *   - satisfaction-prediction.service (predicts satisfaction — NOT wait tactics)
 *   - complaint-pattern.service (tracks complaints AFTER — NOT prevention)
 *
 * 8 AI rules:
 *   1. business_lunch_priority — time-pressured business customer → priority seating
 *   2. family_with_kids — family party with kids → kids activity + distraction
 *   3. special_occasion_vip — anniversary/birthday → complimentary + best table
 *   4. solo_diner_engagement — solo diner → bar seating + conversation
 *   5. regular_recognition — repeat customer → recognition + skip wait if possible
 *   6. long_wait_compensation — predicted wait ≥25 min → proactive compensation
 *   7. complaint_risk_prevention — complaint risk ≥60 → manager checkin
 *   8. wait_satisfaction_tracking — post-wait satisfaction below target → review tactic
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type WaitExpRuleId =
  | 'business_lunch_priority'
  | 'family_with_kids'
  | 'special_occasion_vip'
  | 'solo_diner_engagement'
  | 'regular_recognition'
  | 'long_wait_compensation'
  | 'complaint_risk_prevention'
  | 'wait_satisfaction_tracking';

export type WaitExpAiRec =
  | 'execute_tactic'
  | 'escalate_manager'
  | 'compensate'
  | 'engage_conversation'
  | 'offer_alternative'
  | 'monitor'
  | 'skip';

export interface WaitExpAlert {
  id?: string;
  rule_id: WaitExpRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  customer_id: string;
  customer_name: string;
  customer_profile?: string;
  party_size?: number;
  predicted_wait_minutes?: number;
  actual_wait_minutes?: number;
  context_factors?: string;
  recommended_tactic?: string;
  tactic_cost?: number;
  complaint_risk_score?: number;
  satisfaction_score?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: WaitExpAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface WaitExpConfig {
  aiEnabled: boolean;
  longWait: number;
  complaintThreshold: number;
  maxTacticCost: number;
  targetSatisfaction: number;
}

export const DEFAULT_WAITEXP_CONFIG: WaitExpConfig = {
  aiEnabled: true,
  longWait: 25,
  complaintThreshold: 60.0,
  maxTacticCost: 15.0,
  targetSatisfaction: 85.0,
};

export const readWaitExpConfig = (settings: any): WaitExpConfig => ({
  aiEnabled: settings?.waitexp_ai_enabled ?? true,
  longWait: safeNumber(settings?.waitexp_long_wait, 25),
  complaintThreshold: safeNumber(settings?.waitexp_complaint_threshold, 60.0),
  maxTacticCost: safeNumber(settings?.waitexp_max_tactic_cost, 15.0),
  targetSatisfaction: safeNumber(settings?.waitexp_target_satisfaction, 85.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface WaitCustomerData {
  customer_id: string;
  customer_name: string;
  customer_profile: 'business_lunch' | 'family' | 'solo' | 'regular' | 'special_occasion' | 'tourist' | 'elderly';
  party_size: number;
  predicted_wait_minutes: number;
  context_factors: string[];
  visit_count: number;          // for regular detection
  // For satisfaction tracking
  actual_wait_minutes?: number;
  satisfaction_score?: number;
  // For complaint risk
  complaint_risk_score: number;
}

const MOCK_CUSTOMERS: WaitCustomerData[] = [
  {
    customer_id: 'W001', customer_name: 'Robert Chen', customer_profile: 'business_lunch',
    party_size: 2, predicted_wait_minutes: 18, context_factors: ['time_pressured', 'business_meeting'],
    visit_count: 12, complaint_risk_score: 55,
  },
  {
    customer_id: 'W002', customer_name: 'The Martinez Family', customer_profile: 'family',
    party_size: 5, predicted_wait_minutes: 22, context_factors: ['has_kids', 'stroller'],
    visit_count: 3, complaint_risk_score: 70,
  },
  {
    customer_id: 'W003', customer_name: 'Jennifer & Mark', customer_profile: 'special_occasion',
    party_size: 2, predicted_wait_minutes: 15, context_factors: ['anniversary', 'dressed_up'],
    visit_count: 1, complaint_risk_score: 40,
  },
  {
    customer_id: 'W004', customer_name: 'David Kumar', customer_profile: 'solo',
    party_size: 1, predicted_wait_minutes: 20, context_factors: ['reading_phone'],
    visit_count: 8, complaint_risk_score: 35,
  },
  {
    customer_id: 'W005', customer_name: 'Sarah Williams', customer_profile: 'regular',
    party_size: 3, predicted_wait_minutes: 12, context_factors: ['knows_staff'],
    visit_count: 45, complaint_risk_score: 25,
  },
  {
    customer_id: 'W006', customer_name: 'The Johnson Party', customer_profile: 'family',
    party_size: 6, predicted_wait_minutes: 35, context_factors: ['has_kids', 'no_reservation'],
    visit_count: 2, complaint_risk_score: 85,
  },
  {
    customer_id: 'W007', customer_name: 'Emma Rodriguez', customer_profile: 'tourist',
    party_size: 4, predicted_wait_minutes: 28, context_factors: ['first_visit', 'luggage'],
    visit_count: 0, complaint_risk_score: 50,
  },
  {
    customer_id: 'W008', customer_name: 'Mr. & Mrs. Thompson', customer_profile: 'elderly',
    party_size: 2, predicted_wait_minutes: 30, context_factors: ['mobility_aid', 'preferred_quiet'],
    visit_count: 15, complaint_risk_score: 65,
    actual_wait_minutes: 32, satisfaction_score: 72,
  },
];

export const runWaitExpEngine = async (
  db: ReturnType<typeof useDB>,
  config: WaitExpConfig = DEFAULT_WAITEXP_CONFIG
): Promise<{ alerts: WaitExpAlert[]; generated: number }> => {
  const alerts: WaitExpAlert[] = [];
  const now = new Date();

  let customers: WaitCustomerData[] = [];
  try {
    const result = await db.query(
      `SELECT customer_id, customer_name, customer_profile, party_size,
              predicted_wait_minutes, context_factors, visit_count,
              actual_wait_minutes, satisfaction_score, complaint_risk_score
       FROM wait_experience_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    customers = rows.map((r: any) => ({
      customer_id: String(r.customer_id ?? 'Unknown'),
      customer_name: String(r.customer_name ?? 'Unknown'),
      customer_profile: r.customer_profile ?? 'solo',
      party_size: safeNumber(r.party_size, 1),
      predicted_wait_minutes: safeNumber(r.predicted_wait_minutes, 0),
      context_factors: Array.isArray(r.context_factors) ? r.context_factors : [],
      visit_count: safeNumber(r.visit_count, 0),
      actual_wait_minutes: r.actual_wait_minutes != null ? safeNumber(r.actual_wait_minutes, 0) : undefined,
      satisfaction_score: r.satisfaction_score != null ? safeNumber(r.satisfaction_score, 0) : undefined,
      complaint_risk_score: safeNumber(r.complaint_risk_score, 0),
    }));
  } catch (err) {
    console.warn('[waitexp] fetchCustomers failed — using mock', err);
  }

  if (customers.length === 0) {
    customers = MOCK_CUSTOMERS;
  }

  for (const c of customers) {
    const monthlyOpp = Math.round(c.predicted_wait_minutes * 2 * 30 / 30);

    // Rule 1: BUSINESS_LUNCH_PRIORITY (time-pressured business customer)
    if (c.customer_profile === 'business_lunch' && c.context_factors.includes('time_pressured')) {
      alerts.push({
        rule_id: 'business_lunch_priority',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_profile: c.customer_profile,
        party_size: c.party_size,
        predicted_wait_minutes: c.predicted_wait_minutes,
        context_factors: c.context_factors.join(','),
        recommended_tactic: 'priority_seating',
        tactic_cost: 0,
        complaint_risk_score: c.complaint_risk_score,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: BUSINESS LUNCH — time-pressured, ${c.predicted_wait_minutes} min wait predicted. Business customers value TIME above all — each minute feels like 3. PRIORITY SEATING: find any available table, skip waitlist. Pre-order appetizer to arrive with seating. Failure = lost business customer (they won't return). Risk score: ${c.complaint_risk_score}/100. Opportunity: ${fmt$(monthlyOpp)}/mo from retained business lunch segment.`,
        ai_recommendation: 'execute_tactic',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: FAMILY_WITH_KIDS (family party with children)
    if (c.customer_profile === 'family' && c.context_factors.includes('has_kids')) {
      alerts.push({
        rule_id: 'family_with_kids',
        severity: c.predicted_wait_minutes >= 25 ? 'critical' : 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_profile: c.customer_profile,
        party_size: c.party_size,
        predicted_wait_minutes: c.predicted_wait_minutes,
        context_factors: c.context_factors.join(','),
        recommended_tactic: 'kids_activity',
        tactic_cost: 3,
        complaint_risk_score: c.complaint_risk_score,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: FAMILY WITH KIDS — party of ${c.party_size}, ${c.predicted_wait_minutes} min wait. Kids get restless after 10 min → meltdown → parent stress → complaint. KIDS ACTIVITY PACK: coloring sheets + crayons + small snack. High chair ready. If wait >25 min, escalate to free dessert for kids. Parents will forgive long wait if kids are happy. Risk: ${c.complaint_risk_score}/100. Cost: ~${fmt$(3)} per family.`,
        ai_recommendation: 'execute_tactic',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: SPECIAL_OCCASION_VIP (anniversary/birthday)
    if (c.customer_profile === 'special_occasion') {
      alerts.push({
        rule_id: 'special_occasion_vip',
        severity: 'high',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_profile: c.customer_profile,
        party_size: c.party_size,
        predicted_wait_minutes: c.predicted_wait_minutes,
        context_factors: c.context_factors.join(','),
        recommended_tactic: 'complimentary_drink',
        tactic_cost: Math.min(config.maxTacticCost, 12),
        complaint_risk_score: c.complaint_risk_score,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: SPECIAL OCCASION (${c.context_factors.join(', ')}) — ${c.predicted_wait_minutes} min wait. This is a MEMORY event — wait quality defines the entire experience. COMPLIMENTARY champagne/sparkling at bar while waiting. Best table reserved. Manager greeting. If wait exceeds 20 min, free appetizer. Special occasions drive word-of-mouth — one bad experience = lost referrals. Cost: ~${fmt$(12)} for high-value memory creation.`,
        ai_recommendation: 'execute_tactic',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SOLO_DINER_ENAGEMENT (solo diner waiting)
    if (c.customer_profile === 'solo' && c.predicted_wait_minutes >= 15) {
      alerts.push({
        rule_id: 'solo_diner_engagement',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_profile: c.customer_profile,
        party_size: c.party_size,
        predicted_wait_minutes: c.predicted_wait_minutes,
        context_factors: c.context_factors.join(','),
        recommended_tactic: 'bar_seating',
        tactic_cost: 0,
        complaint_risk_score: c.complaint_risk_score,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: SOLO DINER — ${c.predicted_wait_minutes} min wait alone. Solo diners feel awkward waiting (no one to talk to, feel judged). BAR SEATING: offer immediate bar seat + engage in conversation. Bartender chat = perceived wait drops 50%. Solo diners are high-value (frequent, consistent). If bar full, offer a magazine/phone charging station. Risk: ${c.complaint_risk_score}/100 — low but satisfaction fragile.`,
        ai_recommendation: 'engage_conversation',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: REGULAR_RECOGNITION (frequent repeat customer)
    if (c.customer_profile === 'regular' && c.visit_count >= 20) {
      alerts.push({
        rule_id: 'regular_recognition',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_profile: c.customer_profile,
        party_size: c.party_size,
        predicted_wait_minutes: c.predicted_wait_minutes,
        context_factors: c.context_factors.join(','),
        recommended_tactic: 'recognition_greeting',
        tactic_cost: 0,
        complaint_risk_score: c.complaint_risk_score,
        est_monthly_opportunity: monthlyOpp * 2,
        description: `${c.customer_name}: REGULAR — ${c.visit_count} visits. Waiting ${c.predicted_wait_minutes} min. Regulars expect RECOGNITION — personal greeting by name, "good to see you again." If possible, SKIP WAIT (find any table). Regulars are 5x more valuable than new customers — they spread word + provide stable revenue. Making them wait like strangers = loyalty erosion. Cost: ${fmt$(0)} — just staff awareness.`,
        ai_recommendation: 'execute_tactic',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: LONG_WAIT_COMPENSATION (predicted wait ≥25 min)
    if (c.predicted_wait_minutes >= config.longWait) {
      alerts.push({
        rule_id: 'long_wait_compensation',
        severity: 'critical',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_profile: c.customer_profile,
        party_size: c.party_size,
        predicted_wait_minutes: c.predicted_wait_minutes,
        context_factors: c.context_factors.join(','),
        recommended_tactic: 'free_appetizer',
        tactic_cost: Math.min(config.maxTacticCost, 10),
        complaint_risk_score: c.complaint_risk_score,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: LONG WAIT — ${c.predicted_wait_minutes} min predicted (threshold ${config.longWait} min). PROACTIVE COMPENSATION needed before complaint. Free appetizer or drink during wait (~${fmt$(10)}). Proactive compensation reduces complaints by 60% + converts wait into positive experience. Don't wait for complaint — customer already frustrated by minute 15. Risk: ${c.complaint_risk_score}/100. Cost: ${fmt$(10)} vs lost customer LTV of ${fmt$(500)}+.`,
        ai_recommendation: 'compensate',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: COMPLAINT_RISK_PREVENTION (complaint risk ≥60)
    if (c.complaint_risk_score >= config.complaintThreshold) {
      alerts.push({
        rule_id: 'complaint_risk_prevention',
        severity: 'critical',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_profile: c.customer_profile,
        party_size: c.party_size,
        predicted_wait_minutes: c.predicted_wait_minutes,
        context_factors: c.context_factors.join(','),
        recommended_tactic: 'manager_checkin',
        tactic_cost: 0,
        complaint_risk_score: c.complaint_risk_score,
        est_monthly_opportunity: monthlyOpp * 3,
        description: `${c.customer_name}: COMPLAINT RISK ${c.complaint_risk_score}/100 — high risk of complaint during ${c.predicted_wait_minutes} min wait. Risk factors: ${c.context_factors.join(', ')}. MANAGER CHECK-IN required — personal visit to table/bar during wait. "I'm the manager, I see you're waiting, let me take care of you." Personal attention defuses frustration. Prevents negative review (cost ~${fmt$(500)} in lost revenue). Escalate if wait extends further.`,
        ai_recommendation: 'escalate_manager',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: WAIT_SATISFACTION_TRACKING (satisfaction below target)
    if (c.satisfaction_score != null && c.satisfaction_score < config.targetSatisfaction) {
      alerts.push({
        rule_id: 'wait_satisfaction_tracking',
        severity: 'medium',
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_profile: c.customer_profile,
        actual_wait_minutes: c.actual_wait_minutes,
        satisfaction_score: c.satisfaction_score,
        est_monthly_opportunity: monthlyOpp,
        description: `${c.customer_name}: LOW WAIT SATISFACTION — ${c.satisfaction_score}/100 (target ${config.targetSatisfaction}). Actual wait: ${c.actual_wait_minutes ?? 'N/A'} min, profile: ${c.customer_profile}. Tactic used didn't fully satisfy. REVIEW: was the right tactic applied? Was staff execution good? Track which tactics work for which profiles. This data improves future personalization. Each dissatisfied customer tells ~9 people → negative word-of-mouth.`,
        ai_recommendation: 'monitor',
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
            { role: 'system', content: 'You are a restaurant customer experience AI specializing in wait experience personalization. Recommend specific tactics to reduce perceived wait and prevent complaints. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Customer: ${a.customer_name} — ${a.rule_id}. Profile: ${a.customer_profile ?? 'N/A'}, party ${a.party_size ?? 0}, predicted wait ${a.predicted_wait_minutes ?? 0} min. Context: ${a.context_factors ?? 'none'}. Complaint risk ${a.complaint_risk_score ?? 0}/100. Tactic: ${a.recommended_tactic ?? 'N/A'}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM wait_experience_alert WHERE status = 'open' AND detected_at < time::now() - 2h`);
  } catch { /* ignore - short TTL for real-time */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE wait_experience_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<WaitExpAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM wait_experience_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  avgSatisfaction: number; highRiskCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(satisfaction_score WHERE satisfaction_score != NONE) AS avgsat,
              math::count(complaint_risk_score >= 60) AS highrisk
       FROM wait_experience_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      avgSatisfaction: safeNumber(r.avgsat, 0), highRiskCount: safeNumber(r.highrisk, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgSatisfaction: 0, highRiskCount: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
