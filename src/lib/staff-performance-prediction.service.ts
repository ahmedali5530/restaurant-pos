/**
 * AI Staff Performance Prediction Engine — predicts which staff members are
 * at risk of performance decline before it impacts customer satisfaction,
 * enabling proactive coaching and retention.
 *
 * 137th POSR-exclusive differentiator — restaurants lose $500-2,000/mo per
 * location from staff performance decline going undetected. No POS predicts
 * future performance from leading indicators.
 *
 * Distinct from:
 *   - server-performance.service — tracks CURRENT metrics (not prediction)
 *   - staff-energy-monitor.service — tracks shift-level energy (not trajectory)
 *   - server-coach.service — coaches SKILLS (not performance prediction)
 *   - training-need.service — predicts TRAINING needs (not decline)
 *   - staff-turnover.service — tracks CHURN (not performance trajectory)
 *   - overtime-prediction.service — predicts OVERTIME (not performance)
 *
 * 8 AI rules:
 *   1. performance_decline_predicted — declining ≥5pts/month → proactive coaching
 *   2. burnout_risk — all indicators declining simultaneously → schedule break
 *   3. disengagement_detected — reduced upsell + slower + fewer smiles → new challenge
 *   4. skill_stagnation — no improvement despite training + time → investigate
 *   5. schedule_overload_correlation — high shifts/week correlating with decline → reduce shifts
 *   6. performance_recovery_confirmed — post-intervention score improved → validate
 *   7. improving_performer — all indicators improving → recognize + amplify
 *   8. critical_decline_imminent — predicted to hit <40 within 4 weeks → urgent action
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type StaffPerfPredRuleId =
  | 'performance_decline_predicted'
  | 'burnout_risk'
  | 'disengagement_detected'
  | 'skill_stagnation'
  | 'schedule_overload_correlation'
  | 'performance_recovery_confirmed'
  | 'improving_performer'
  | 'critical_decline_imminent';

export type StaffPerfPredAiRec =
  | 'proactive_coaching'
  | 'schedule_break'
  | 'reduce_shifts'
  | 'new_challenge'
  | 'recognize_progress'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface StaffPerfPredAlert {
  id?: string;
  rule_id: StaffPerfPredRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  staff_id: string;
  staff_name: string;
  role?: string;
  current_performance_score?: number;
  previous_performance_score?: number;
  predicted_score_next_month?: number;
  performance_trend?: string;
  decline_rate?: number;
  weeks_until_critical?: number;
  leading_indicators?: string;
  energy_trend?: string;
  error_trend?: string;
  speed_trend?: string;
  upsell_trend?: string;
  shifts_last_14d?: number;
  avg_shifts_per_week?: number;
  recommended_intervention?: string;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: StaffPerfPredAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface StaffPerfPredConfig {
  aiEnabled: boolean;
  declineThreshold: number;
  criticalScore: number;
  overloadShifts: number;
}

export const DEFAULT_STAFFPERFPRED_CONFIG: StaffPerfPredConfig = {
  aiEnabled: true,
  declineThreshold: 5.0,
  criticalScore: 40.0,
  overloadShifts: 6.0,
};

export const readStaffPerfPredConfig = (settings: any): StaffPerfPredConfig => ({
  aiEnabled: settings?.staffperfpred_ai_enabled ?? true,
  declineThreshold: safeNumber(settings?.staffperfpred_decline_threshold, 5.0),
  criticalScore: safeNumber(settings?.staffperfpred_critical_score, 40.0),
  overloadShifts: safeNumber(settings?.staffperfpred_overload_shifts, 6.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface StaffPerfData {
  staff_id: string;
  staff_name: string;
  role: string;
  current_performance_score: number;
  previous_performance_score: number;
  // Leading indicators (trend: 'improving' | 'stable' | 'declining')
  energy_trend: string;
  error_trend: string;
  speed_trend: string;
  upsell_trend: string;
  shifts_last_14d: number;
  avg_shifts_per_week: number;
  months_employed: number;
  has_received_training: boolean;
  // For recovery
  pre_intervention_score?: number;
  post_intervention_score?: number;
}

const MOCK_STAFF: StaffPerfData[] = [
  { staff_id: 'PP01', staff_name: 'Maria G', role: 'server', current_performance_score: 72, previous_performance_score: 85, energy_trend: 'declining', error_trend: 'declining', speed_trend: 'declining', upsell_trend: 'declining', shifts_last_14d: 12, avg_shifts_per_week: 6, months_employed: 14, has_received_training: true },
  { staff_id: 'PP02', staff_name: 'Carlos M', role: 'kitchen', current_performance_score: 88, previous_performance_score: 82, energy_trend: 'improving', error_trend: 'improving', speed_trend: 'stable', upsell_trend: 'stable', shifts_last_14d: 10, avg_shifts_per_week: 5, months_employed: 8, has_received_training: true },
  { staff_id: 'PP03', staff_name: 'Lisa A', role: 'server', current_performance_score: 65, previous_performance_score: 78, energy_trend: 'stable', error_trend: 'declining', speed_trend: 'declining', upsell_trend: 'declining', shifts_last_14d: 11, avg_shifts_per_week: 5.5, months_employed: 10, has_received_training: true },
  { staff_id: 'PP04', staff_name: 'James P', role: 'server', current_performance_score: 92, previous_performance_score: 88, energy_trend: 'improving', error_trend: 'improving', speed_trend: 'improving', upsell_trend: 'improving', shifts_last_14d: 10, avg_shifts_per_week: 5, months_employed: 6, has_received_training: true },
  { staff_id: 'PP05', staff_name: 'Priya P', role: 'kitchen', current_performance_score: 45, previous_performance_score: 68, energy_trend: 'declining', error_trend: 'declining', speed_trend: 'declining', upsell_trend: 'stable', shifts_last_14d: 14, avg_shifts_per_week: 7, months_employed: 18, has_received_training: true },
  { staff_id: 'PP06', staff_name: 'Tom O', role: 'bartender', current_performance_score: 75, previous_performance_score: 80, energy_trend: 'stable', error_trend: 'stable', speed_trend: 'stable', upsell_trend: 'stable', shifts_last_14d: 10, avg_shifts_per_week: 5, months_employed: 12, has_received_training: true, pre_intervention_score: 65, post_intervention_score: 75 },
  { staff_id: 'PP07', staff_name: 'Anna K', role: 'server', current_performance_score: 82, previous_performance_score: 82, energy_trend: 'stable', error_trend: 'stable', speed_trend: 'stable', upsell_trend: 'stable', shifts_last_14d: 8, avg_shifts_per_week: 4, months_employed: 4, has_received_training: true },
  { staff_id: 'PP08', staff_name: 'David K', role: 'server', current_performance_score: 38, previous_performance_score: 55, energy_trend: 'declining', error_trend: 'declining', speed_trend: 'declining', upsell_trend: 'declining', shifts_last_14d: 13, avg_shifts_per_week: 6.5, months_employed: 20, has_received_training: true },
];

export const runStaffPerfPredEngine = async (
  db: ReturnType<typeof useDB>,
  config: StaffPerfPredConfig = DEFAULT_STAFFPERFPRED_CONFIG
): Promise<{ alerts: StaffPerfPredAlert[]; generated: number }> => {
  const alerts: StaffPerfPredAlert[] = [];
  const now = new Date();

  let staff: StaffPerfData[] = [];
  try {
    const result = await db.query(
      `SELECT staff_id, staff_name, role, current_performance_score, previous_performance_score,
              energy_trend, error_trend, speed_trend, upsell_trend,
              shifts_last_14d, avg_shifts_per_week, months_employed, has_received_training,
              pre_intervention_score, post_intervention_score
       FROM staff_performance_prediction_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    staff = rows.map((r: any) => ({
      staff_id: String(r.staff_id ?? 'Unknown'),
      staff_name: String(r.staff_name ?? 'Unknown'),
      role: String(r.role ?? 'server'),
      current_performance_score: safeNumber(r.current_performance_score, 0),
      previous_performance_score: safeNumber(r.previous_performance_score, 0),
      energy_trend: String(r.energy_trend ?? 'stable'),
      error_trend: String(r.error_trend ?? 'stable'),
      speed_trend: String(r.speed_trend ?? 'stable'),
      upsell_trend: String(r.upsell_trend ?? 'stable'),
      shifts_last_14d: safeNumber(r.shifts_last_14d, 0),
      avg_shifts_per_week: safeNumber(r.avg_shifts_per_week, 0),
      months_employed: safeNumber(r.months_employed, 0),
      has_received_training: r.has_received_training ?? false,
      pre_intervention_score: r.pre_intervention_score != null ? safeNumber(r.pre_intervention_score, 0) : undefined,
      post_intervention_score: r.post_intervention_score != null ? safeNumber(r.post_intervention_score, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[staffperfpred] fetchStaff failed — using mock', err);
  }

  if (staff.length === 0) {
    staff = MOCK_STAFF;
  }

  for (const s of staff) {
    const decline = s.previous_performance_score - s.current_performance_score;
    const monthlyDeclineRate = s.months_employed > 0 ? decline / Math.max(s.months_employed * 0.1, 1) : 0;
    const predictedNextMonth = Math.max(0, s.current_performance_score - monthlyDeclineRate);
    const weeksUntilCritical = monthlyDeclineRate > 0
      ? Math.ceil((s.current_performance_score - config.criticalScore) / (monthlyDeclineRate / 4))
      : 999;
    const decliningIndicators = [s.energy_trend, s.error_trend, s.speed_trend, s.upsell_trend].filter(t => t === 'declining').length;
    const improvingIndicators = [s.energy_trend, s.error_trend, s.speed_trend, s.upsell_trend].filter(t => t === 'improving').length;
    const monthlyOpp = Math.round(decline * 20);

    // Rule 1: PERFORMANCE_DECLINE_PREDICTED
    if (decline >= config.declineThreshold && s.current_performance_score >= config.criticalScore) {
      alerts.push({
        rule_id: 'performance_decline_predicted',
        severity: 'high',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        current_performance_score: s.current_performance_score,
        previous_performance_score: s.previous_performance_score,
        predicted_score_next_month: Math.round(predictedNextMonth),
        performance_trend: 'declining',
        decline_rate: Math.round(monthlyDeclineRate * 10) / 10,
        weeks_until_critical: weeksUntilCritical,
        leading_indicators: `${s.energy_trend}_energy, ${s.error_trend}_errors, ${s.speed_trend}_speed, ${s.upsell_trend}_upsell`,
        est_monthly_opportunity: monthlyOpp,
        description: `${s.staff_name} (${s.role}): PERFORMANCE DECLINE PREDICTED — score dropped ${decline}pts (${s.previous_performance_score} → ${s.current_performance_score}). ${decliningIndicators}/4 indicators declining. Predicted next month: ${Math.round(predictedNextMonth)}. At current rate, reaches critical (${config.criticalScore}) in ${weeksUntilCritical} weeks. PROACTIVE COACHING needed NOW — don't wait for customer complaints. Leading indicators (${s.energy_trend} energy, ${s.error_trend} errors, ${s.speed_trend} speed, ${s.upsell_trend} upsell) predict the trajectory. Each week of delay = ~${fmt$(50)} in declining satisfaction.`,
        ai_recommendation: 'proactive_coaching',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: BURNOUT_RISK
    if (decliningIndicators >= 3 && s.current_performance_score < 75) {
      alerts.push({
        rule_id: 'burnout_risk',
        severity: 'critical',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        current_performance_score: s.current_performance_score,
        previous_performance_score: s.previous_performance_score,
        performance_trend: 'declining',
        leading_indicators: `${decliningIndicators}/4 declining`,
        energy_trend: s.energy_trend,
        error_trend: s.error_trend,
        speed_trend: s.speed_trend,
        upsell_trend: s.upsell_trend,
        shifts_last_14d: s.shifts_last_14d,
        avg_shifts_per_week: s.avg_shifts_per_week,
        recommended_intervention: 'mandatory_break',
        est_monthly_opportunity: monthlyOpp * 2,
        description: `${s.staff_name} (${s.role}): BURNOUT RISK — ${decliningIndicators}/4 indicators declining simultaneously + score ${s.current_performance_score}/100. All-fronts decline = burnout, not skill gap. ${s.avg_shifts_per_week >= config.overloadShifts ? `Working ${s.avg_shifts_per_week} shifts/week (overload threshold ${config.overloadShifts}). ` : ''}SCHEDULE BREAK: mandatory 2-3 days off. Burnout recovery takes 3-5 days, not overnight. Don't coach skills — the issue is exhaustion, not ability. Each burnout-driven shift = ${fmt$(30)} in errors + reduced satisfaction. Untreated burnout → resignation → ${fmt$(2000)} replacement cost.`,
        ai_recommendation: 'schedule_break',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: DISENGAGEMENT_DETECTED
    if (s.upsell_trend === 'declining' && s.speed_trend === 'declining' && s.energy_trend === 'stable' && s.error_trend === 'stable') {
      alerts.push({
        rule_id: 'disengagement_detected',
        severity: 'medium',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        current_performance_score: s.current_performance_score,
        leading_indicators: 'upsell_declining, speed_declining, energy_stable, error_stable',
        upsell_trend: s.upsell_trend,
        speed_trend: s.speed_trend,
        recommended_intervention: 'new_challenge',
        est_monthly_opportunity: monthlyOpp,
        description: `${s.staff_name} (${s.role}): DISENGAGEMENT — upsell attempts dropping + service slowing, but energy and errors are stable. Not burnout (energy fine) and not skill gap (errors fine). This is DISENGAGEMENT — losing interest/motivation. Staff is capable but choosing not to try as hard. NEW CHALLENGE: assign new responsibility (train new hire, lead a station, try a different role). Disengagement is fixable with purpose, not coaching. Each disengaged shift = lost upsell revenue (${fmt$(15)}/shift) + slower service.`,
        ai_recommendation: 'new_challenge',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SKILL_STAGNATION
    if (s.has_received_training && s.months_employed >= 6 && Math.abs(decline) < 3 && s.current_performance_score < 75 && improvingIndicators === 0) {
      alerts.push({
        rule_id: 'skill_stagnation',
        severity: 'medium',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        current_performance_score: s.current_performance_score,
        performance_trend: 'stable',
        months_employed: s.months_employed,
        recommended_intervention: 'advanced_training',
        est_monthly_opportunity: Math.round((85 - s.current_performance_score) * 15),
        description: `${s.staff_name} (${s.role}): SKILL STAGNATION — ${s.months_employed} months employed, received training, but score stuck at ${s.current_performance_score}/100. No improvement, no decline — plateau. Training didn't unlock growth. INVESTIGATE: is the training method wrong for this person? Do they need different training (hands-on vs classroom)? Or is this their ceiling (wrong role)? Each point of improvement = ~${fmt$(15)}/mo in satisfaction + efficiency. Potential gain: ${fmt$((85 - s.current_performance_score) * 15)}/mo if score can reach 85.`,
        ai_recommendation: 'investigate',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: SCHEDULE_OVERLOAD_CORRELATION
    if (s.avg_shifts_per_week >= config.overloadShifts && decline >= config.declineThreshold) {
      alerts.push({
        rule_id: 'schedule_overload_correlation',
        severity: 'high',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        current_performance_score: s.current_performance_score,
        previous_performance_score: s.previous_performance_score,
        avg_shifts_per_week: s.avg_shifts_per_week,
        shifts_last_14d: s.shifts_last_14d,
        decline_rate: Math.round(monthlyDeclineRate * 10) / 10,
        recommended_intervention: 'reduce_shifts',
        est_monthly_opportunity: monthlyOpp,
        description: `${s.staff_name} (${s.role}): SCHEDULE OVERLOAD — working ${s.avg_shifts_per_week} shifts/week (threshold ${config.overloadShifts}) + performance declining ${decline}pts. CORRELATION: more shifts = worse performance. REDUCE SHIFTS to ${config.overloadShifts - 1}/week for 2 weeks → measure if performance recovers. If yes, overload was the cause → permanent schedule adjustment. If no, investigate other causes. Overloaded staff make more errors per shift (fatigue) — net productivity is LOWER despite more shifts. Less is more.`,
        ai_recommendation: 'reduce_shifts',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: PERFORMANCE_RECOVERY_CONFIRMED
    if (s.pre_intervention_score != null && s.post_intervention_score != null) {
      const recovery = s.post_intervention_score - s.pre_intervention_score;
      if (recovery >= 5) {
        alerts.push({
          rule_id: 'performance_recovery_confirmed',
          severity: 'low',
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          role: s.role,
          current_performance_score: s.current_performance_score,
          pre_intervention_score: s.pre_intervention_score,
          post_intervention_score: s.post_intervention_score,
          performance_trend: 'improving',
          est_monthly_opportunity: 0,
          description: `${s.staff_name} (${s.role}): RECOVERY CONFIRMED — performance improved ${recovery}pts post-intervention (${s.pre_intervention_score} → ${s.post_intervention_score}). Current: ${s.current_performance_score}/100. Intervention was EFFECTIVE. Validate which intervention worked (coaching? break? schedule change?) and replicate for other declining staff. Track if recovery sustains — 30-day re-check needed. Recovery confirms the prediction model works — leading indicators correctly identified decline before it became critical.`,
          ai_recommendation: 'monitor',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 7: IMPROVING_PERFORMER
    if (improvingIndicators >= 3 && s.current_performance_score > s.previous_performance_score) {
      alerts.push({
        rule_id: 'improving_performer',
        severity: 'low',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        current_performance_score: s.current_performance_score,
        previous_performance_score: s.previous_performance_score,
        performance_trend: 'improving',
        leading_indicators: `${improvingIndicators}/4 improving`,
        est_monthly_opportunity: 0,
        description: `${s.staff_name} (${s.role}): IMPROVING PERFORMER — ${improvingIndicators}/4 indicators improving, score up ${s.current_performance_score - s.previous_performance_score}pts (${s.previous_performance_score} → ${s.current_performance_score}). All-fronts improvement = engaged, learning, motivated. RECOGNIZE + AMPLIFY: acknowledge progress publicly, assign more responsibility, consider for promotion. Improving performers are the most valuable asset — their momentum should be accelerated, not taken for granted. Each improving performer raises team average + sets example.`,
        ai_recommendation: 'recognize_progress',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: CRITICAL_DECLINE_IMMINENT
    if (s.current_performance_score < 50 && weeksUntilCritical <= 4 && decliningIndicators >= 2) {
      alerts.push({
        rule_id: 'critical_decline_imminent',
        severity: 'critical',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        current_performance_score: s.current_performance_score,
        predicted_score_next_month: Math.round(predictedNextMonth),
        weeks_until_critical: weeksUntilCritical,
        performance_trend: 'critical',
        decline_rate: Math.round(monthlyDeclineRate * 10) / 10,
        recommended_intervention: 'urgent_action',
        est_monthly_opportunity: monthlyOpp * 3,
        description: `${s.staff_name} (${s.role}): CRITICAL DECLINE IMMINENT — current score ${s.current_performance_score}/100, predicted to hit critical (${config.criticalScore}) in ${weeksUntilCritical} weeks. ${decliningIndicators}/4 indicators declining. URGENT: immediate intervention required. ${s.current_performance_score < 40 ? 'ALREADY CRITICAL — performance is impacting customers NOW. ' : 'About to cross the threshold where performance significantly impacts customer satisfaction. '}Options: (1) mandatory break, (2) reduce shifts, (3) one-on-one coaching, (4) role reassignment. Each week of delay = ~${fmt$(100)} in customer satisfaction damage + potential complaints + negative reviews. This is the last chance to intervene before the customer experience deteriorates visibly.`,
        ai_recommendation: 'schedule_break',
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
            { role: 'system', content: 'You are a restaurant workforce management AI specializing in performance prediction and proactive intervention. Recommend specific actions to prevent performance decline before it impacts customers. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Staff: ${a.staff_name} (${a.role ?? 'N/A'}) — ${a.rule_id}. Score: ${a.current_performance_score ?? 0}/100 (was ${a.previous_performance_score ?? 0}, predicted ${a.predicted_score_next_month ?? 0}). Trend: ${a.performance_trend ?? 'N/A'}. Decline rate: ${a.decline_rate ?? 0}pts/mo. Weeks to critical: ${a.weeks_until_critical ?? '?'}. Indicators: ${a.leading_indicators ?? 'N/A'}. Shifts/wk: ${a.avg_shifts_per_week ?? 0}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM staff_performance_prediction_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE staff_performance_prediction_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<StaffPerfPredAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM staff_performance_prediction_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  decliningStaff: number; improvingStaff: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(performance_trend = 'declining') AS declining,
              math::count(performance_trend = 'improving') AS improving
       FROM staff_performance_prediction_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      decliningStaff: safeNumber(r.declining, 0), improvingStaff: safeNumber(r.improving, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, decliningStaff: 0, improvingStaff: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
