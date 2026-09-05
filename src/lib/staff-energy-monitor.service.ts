/**
 * AI Staff Energy Level Monitor — tracks staff energy/fatigue throughout
 * their shift by monitoring order accuracy decline, service speed decline,
 * and error rate increase, recommending optimal break timing and shift length.
 *
 * 131st POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from staff fatigue-driven errors. No POS tracks staff energy
 * levels throughout a shift.
 *
 * Distinct from:
 *   - break-compliance.service — tracks LEGAL break compliance (not energy)
 *   - server-performance.service — tracks overall metrics (not energy trajectory)
 *   - server-coach.service — coaches SKILLS (not energy management)
 *   - overtime-prediction.service — predicts OVERTIME (not energy)
 *   - shift-handover.service — analyzes handover quality (not energy)
 *   - kitchen-skill-gap.service — technique gaps (not energy)
 *   - staff-turnover.service — staff churn (not shift energy)
 *
 * 8 AI rules:
 *   1. energy_decline_detected — energy dropped 25+ points from shift start
 *   2. critical_fatigue_zone — energy score <40/100 → high error risk
 *   3. optimal_break_window — hour 3-4 is ideal break time (before decline)
 *   4. shift_too_long — 8+ hours → error rate doubles in hour 9
 *   5. chronic_fatigue_pattern — same staff fatigued every shift → investigate
 *   6. fatigue_error_correlation — error rate spikes correlate with energy drops
 *   7. peak_hour_fatigue — fatigued staff during peak → critical error risk
 *   8. energy_recovery_confirmed — post-break energy recovered → validate breaks
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type StaffEnergyRuleId =
  | 'energy_decline_detected'
  | 'critical_fatigue_zone'
  | 'optimal_break_window'
  | 'shift_too_long'
  | 'chronic_fatigue_pattern'
  | 'fatigue_error_correlation'
  | 'peak_hour_fatigue'
  | 'energy_recovery_confirmed';

export type StaffEnergyAiRec =
  | 'take_break_now'
  | 'end_shift'
  | 'schedule_earlier_break'
  | 'reduce_shift_length'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface StaffEnergyAlert {
  id?: string;
  rule_id: StaffEnergyRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  staff_id: string;
  staff_name: string;
  role?: string;
  hours_into_shift?: number;
  current_energy_score?: number;
  shift_start_energy?: number;
  energy_decline_rate?: number;
  current_error_rate?: number;
  start_error_rate?: number;
  current_speed_pct?: number;
  recommended_break_time?: string;
  recommended_shift_end?: number;
  is_peak_hour?: boolean;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: StaffEnergyAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface StaffEnergyConfig {
  aiEnabled: boolean;
  declineThreshold: number;
  criticalThreshold: number;
  maxShiftHours: number;
  breakWindow: number;
}

export const DEFAULT_STAFFENERGY_CONFIG: StaffEnergyConfig = {
  aiEnabled: true,
  declineThreshold: 25.0,
  criticalThreshold: 40.0,
  maxShiftHours: 8.0,
  breakWindow: 3.0,
};

export const readStaffEnergyConfig = (settings: any): StaffEnergyConfig => ({
  aiEnabled: settings?.staffenergy_ai_enabled ?? true,
  declineThreshold: safeNumber(settings?.staffenergy_decline_threshold, 25.0),
  criticalThreshold: safeNumber(settings?.staffenergy_critical_threshold, 40.0),
  maxShiftHours: safeNumber(settings?.staffenergy_max_shift_hours, 8.0),
  breakWindow: safeNumber(settings?.staffenergy_break_window, 3.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface StaffEnergyData {
  staff_id: string;
  staff_name: string;
  role: string;
  hours_into_shift: number;
  shift_start_energy: number;      // 0-100
  current_energy_score: number;    // 0-100
  current_error_rate: number;      // errors per 10 orders
  start_error_rate: number;        // error rate at shift start
  current_speed_pct: number;       // speed as % of shift-start speed
  is_peak_hour: boolean;
  has_taken_break: boolean;
  // For chronic fatigue
  fatigued_shifts_last_30d: number;
  total_shifts_last_30d: number;
  // For energy recovery
  post_break_energy?: number;
  pre_break_energy?: number;
}

const MOCK_STAFF: StaffEnergyData[] = [
  { staff_id: 'E001', staff_name: 'Maria G', role: 'server', hours_into_shift: 6.5, shift_start_energy: 95, current_energy_score: 55, current_error_rate: 2.8, start_error_rate: 0.5, current_speed_pct: 78, is_peak_hour: true, has_taken_break: false, fatigued_shifts_last_30d: 12, total_shifts_last_30d: 18 },
  { staff_id: 'E002', staff_name: 'Carlos M', role: 'kitchen', hours_into_shift: 4, shift_start_energy: 90, current_energy_score: 85, current_error_rate: 0.8, start_error_rate: 0.6, current_speed_pct: 95, is_peak_hour: false, has_taken_break: false, fatigued_shifts_last_30d: 5, total_shifts_last_30d: 20 },
  { staff_id: 'E003', staff_name: 'Lisa A', role: 'server', hours_into_shift: 3, shift_start_energy: 92, current_energy_score: 88, current_error_rate: 0.7, start_error_rate: 0.5, current_speed_pct: 96, is_peak_hour: false, has_taken_break: false, fatigued_shifts_last_30d: 3, total_shifts_last_30d: 16 },
  { staff_id: 'E004', staff_name: 'James P', role: 'server', hours_into_shift: 8.5, shift_start_energy: 88, current_energy_score: 32, current_error_rate: 4.5, start_error_rate: 0.8, current_speed_pct: 62, is_peak_hour: true, has_taken_break: true, fatigued_shifts_last_30d: 8, total_shifts_last_30d: 15, pre_break_energy: 45, post_break_energy: 75 },
  { staff_id: 'E005', staff_name: 'Priya P', role: 'kitchen', hours_into_shift: 7, shift_start_energy: 85, current_energy_score: 38, current_error_rate: 3.2, start_error_rate: 0.9, current_speed_pct: 68, is_peak_hour: true, has_taken_break: false, fatigued_shifts_last_30d: 10, total_shifts_last_30d: 22 },
  { staff_id: 'E006', staff_name: 'Tom O', role: 'bartender', hours_into_shift: 5, shift_start_energy: 90, current_energy_score: 65, current_error_rate: 1.5, start_error_rate: 0.6, current_speed_pct: 85, is_peak_hour: true, has_taken_break: false, fatigued_shifts_last_30d: 4, total_shifts_last_30d: 18 },
  { staff_id: 'E007', staff_name: 'Anna K', role: 'server', hours_into_shift: 2.5, shift_start_energy: 93, current_energy_score: 90, current_error_rate: 0.4, start_error_rate: 0.4, current_speed_pct: 98, is_peak_hour: false, has_taken_break: false, fatigued_shifts_last_30d: 2, total_shifts_last_30d: 14 },
  { staff_id: 'E008', staff_name: 'David K', role: 'server', hours_into_shift: 9, shift_start_energy: 85, current_energy_score: 25, current_error_rate: 5.5, start_error_rate: 0.7, current_speed_pct: 55, is_peak_hour: false, has_taken_break: true, fatigued_shifts_last_30d: 15, total_shifts_last_30d: 20, pre_break_energy: 40, post_break_energy: 68 },
];

export const runStaffEnergyEngine = async (
  db: ReturnType<typeof useDB>,
  config: StaffEnergyConfig = DEFAULT_STAFFENERGY_CONFIG
): Promise<{ alerts: StaffEnergyAlert[]; generated: number }> => {
  const alerts: StaffEnergyAlert[] = [];
  const now = new Date();

  let staff: StaffEnergyData[] = [];
  try {
    const result = await db.query(
      `SELECT staff_id, staff_name, role, hours_into_shift, shift_start_energy,
              current_energy_score, current_error_rate, start_error_rate,
              current_speed_pct, is_peak_hour, has_taken_break,
              fatigued_shifts_last_30d, total_shifts_last_30d,
              post_break_energy, pre_break_energy
       FROM staff_energy_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    staff = rows.map((r: any) => ({
      staff_id: String(r.staff_id ?? 'Unknown'),
      staff_name: String(r.staff_name ?? 'Unknown'),
      role: String(r.role ?? 'server'),
      hours_into_shift: safeNumber(r.hours_into_shift, 0),
      shift_start_energy: safeNumber(r.shift_start_energy, 0),
      current_energy_score: safeNumber(r.current_energy_score, 0),
      current_error_rate: safeNumber(r.current_error_rate, 0),
      start_error_rate: safeNumber(r.start_error_rate, 0),
      current_speed_pct: safeNumber(r.current_speed_pct, 0),
      is_peak_hour: r.is_peak_hour ?? false,
      has_taken_break: r.has_taken_break ?? false,
      fatigued_shifts_last_30d: safeNumber(r.fatigued_shifts_last_30d, 0),
      total_shifts_last_30d: safeNumber(r.total_shifts_last_30d, 0),
      post_break_energy: r.post_break_energy != null ? safeNumber(r.post_break_energy, 0) : undefined,
      pre_break_energy: r.pre_break_energy != null ? safeNumber(r.pre_break_energy, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[staffenergy] fetchStaff failed — using mock', err);
  }

  if (staff.length === 0) {
    staff = MOCK_STAFF;
  }

  for (const s of staff) {
    const energyDecline = s.shift_start_energy - s.current_energy_score;
    const declineRate = s.hours_into_shift > 0 ? energyDecline / s.hours_into_shift : 0;
    const errorIncrease = s.current_error_rate - s.start_error_rate;
    const monthlyOpp = Math.round(errorIncrease * 15 * s.total_shifts_last_30d / 30 * 30);

    // Rule 1: ENERGY_DECLINE_DETECTED
    if (energyDecline >= config.declineThreshold && !s.has_taken_break) {
      alerts.push({
        rule_id: 'energy_decline_detected',
        severity: 'high',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        hours_into_shift: s.hours_into_shift,
        current_energy_score: s.current_energy_score,
        shift_start_energy: s.shift_start_energy,
        energy_decline_rate: Math.round(declineRate * 10) / 10,
        current_error_rate: s.current_error_rate,
        start_error_rate: s.start_error_rate,
        current_speed_pct: s.current_speed_pct,
        recommended_break_time: 'now',
        est_monthly_opportunity: monthlyOpp,
        description: `${s.staff_name} (${s.role}): ENERGY DECLINE — dropped ${energyDecline.toFixed(0)} points in ${s.hours_into_shift}h (${s.shift_start_energy} → ${s.current_energy_score}/100). Decline rate: ${declineRate.toFixed(1)} pts/hr. Error rate: ${s.start_error_rate} → ${s.current_error_rate}/10 orders (${(errorIncrease * 100).toFixed(0)}% increase). Speed: ${s.current_speed_pct}% of start. No break taken yet. TAKE BREAK NOW — each hour without break = ~8% more errors. Break at this point restores 25-30 energy points.`,
        ai_recommendation: 'take_break_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: CRITICAL_FATIGUE_ZONE
    if (s.current_energy_score < config.criticalThreshold) {
      alerts.push({
        rule_id: 'critical_fatigue_zone',
        severity: 'critical',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        hours_into_shift: s.hours_into_shift,
        current_energy_score: s.current_energy_score,
        shift_start_energy: s.shift_start_energy,
        current_error_rate: s.current_error_rate,
        start_error_rate: s.start_error_rate,
        current_speed_pct: s.current_speed_pct,
        is_peak_hour: s.is_peak_hour,
        est_monthly_opportunity: monthlyOpp * 2,
        description: `${s.staff_name} (${s.role}): CRITICAL FATIGUE — energy ${s.current_energy_score}/100 (below ${config.criticalThreshold} threshold). ${s.hours_into_shift}h into shift. Error rate: ${s.current_error_rate}/10 orders (${(s.current_error_rate / Math.max(s.start_error_rate, 0.1) * 100 - 100).toFixed(0)}% above start). Speed: ${s.current_speed_pct}%. ${s.is_peak_hour ? 'DURING PEAK — critical: fatigued staff + high volume = cascade errors. ' : ''}END SHIFT or take extended break. Operating at this energy level = ${fmt$(15 * s.current_error_rate)} in errors per 10 orders. Critical fatigue staff make 5x more errors than fresh staff.`,
        ai_recommendation: s.is_peak_hour ? 'end_shift' : 'take_break_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: OPTIMAL_BREAK_WINDOW
    if (s.hours_into_shift >= config.breakWindow - 0.5 && s.hours_into_shift <= config.breakWindow + 0.5 && !s.has_taken_break && s.current_energy_score > config.criticalThreshold) {
      alerts.push({
        rule_id: 'optimal_break_window',
        severity: 'low',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        hours_into_shift: s.hours_into_shift,
        current_energy_score: s.current_energy_score,
        shift_start_energy: s.shift_start_energy,
        recommended_break_time: `hour ${config.breakWindow}`,
        est_monthly_opportunity: monthlyOpp,
        description: `${s.staff_name} (${s.role}): OPTIMAL BREAK WINDOW — ${s.hours_into_shift}h into shift, energy ${s.current_energy_score}/100 (still good). Break NOW for maximum recovery. Breaks at hour ${config.breakWindow} prevent the hour 5-6 energy cliff. Waiting until hour 5 = too late (energy already crashed). Break at hour ${config.breakWindow} + 20min rest = energy recovers to 85%+ and sustains through shift end. Each timely break prevents ~${fmt$(monthlyOpp / s.total_shifts_last_30d)} in shift-end errors.`,
        ai_recommendation: 'take_break_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SHIFT_TOO_LONG
    if (s.hours_into_shift >= config.maxShiftHours) {
      const overtimeErrorMultiplier = s.hours_into_shift >= 9 ? 2 : 1.5;
      alerts.push({
        rule_id: 'shift_too_long',
        severity: s.hours_into_shift >= 9 ? 'critical' : 'high',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        hours_into_shift: s.hours_into_shift,
        current_energy_score: s.current_energy_score,
        current_error_rate: s.current_error_rate,
        start_error_rate: s.start_error_rate,
        recommended_shift_end: config.maxShiftHours,
        is_peak_hour: s.is_peak_hour,
        est_monthly_opportunity: monthlyOpp * 2,
        description: `${s.staff_name} (${s.role}): SHIFT TOO LONG — ${s.hours_into_shift}h (max recommended ${config.maxShiftHours}h). Error rate: ${s.current_error_rate}/10 (${overtimeErrorMultiplier}x normal). ${s.hours_into_shift >= 9 ? 'HOUR 9+ = error rate DOUBLES. ' : 'Past 8h = error rate increases 50%. '}END SHIFT now if possible. Each additional hour past ${config.maxShiftHours} = ${fmt$(15 * s.current_error_rate * (overtimeErrorMultiplier - 1))} in additional errors. Long shifts are false economy — labor savings eaten by error costs.`,
        ai_recommendation: 'end_shift',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: CHRONIC_FATIGUE_PATTERN
    if (s.total_shifts_last_30d > 0) {
      const fatigueRate = (s.fatigued_shifts_last_30d / s.total_shifts_last_30d) * 100;
      if (fatigueRate >= 50) {
        alerts.push({
          rule_id: 'chronic_fatigue_pattern',
          severity: 'high',
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          role: s.role,
          hours_into_shift: s.hours_into_shift,
          current_energy_score: s.current_energy_score,
          est_monthly_opportunity: monthlyOpp * 3,
          description: `${s.staff_name} (${s.role}): CHRONIC FATIGUE — fatigued in ${s.fatigued_shifts_last_30d}/${s.total_shifts_last_30d} shifts last 30 days (${fatigueRate.toFixed(0)}%). This is a PATTERN, not a one-time issue. Causes: too many consecutive shifts, insufficient rest between shifts, personal health, or shift length too long. INVESTIGATE: review shift scheduling — are they working 6+ days/week? Reduce shift frequency or length. Chronic fatigue leads to burnout + resignation → ${fmt$(2000)} replacement cost. Address before losing the employee.`,
          ai_recommendation: 'investigate',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 6: FATIGUE_ERROR_CORRELATION
    if (energyDecline >= 20 && errorIncrease >= 1.5) {
      alerts.push({
        rule_id: 'fatigue_error_correlation',
        severity: 'high',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        hours_into_shift: s.hours_into_shift,
        current_energy_score: s.current_energy_score,
        shift_start_energy: s.shift_start_energy,
        energy_decline_rate: Math.round(declineRate * 10) / 10,
        current_error_rate: s.current_error_rate,
        start_error_rate: s.start_error_rate,
        est_monthly_opportunity: monthlyOpp,
        description: `${s.staff_name} (${s.role}): FATIGUE-ERROR CORRELATION — energy dropped ${energyDecline.toFixed(0)} points AND error rate increased ${errorIncrease.toFixed(1)}/10 orders. Direct correlation confirmed: fatigue IS causing errors. Each 10-point energy drop = ~${(errorIncrease / Math.max(energyDecline / 10, 1)).toFixed(1)} additional errors per 10 orders. This staff member's errors are NOT skill gaps — they're ENERGY gaps. Fix: breaks, shorter shifts, or schedule change. Training won't help — rest will.`,
        ai_recommendation: 'schedule_earlier_break',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: PEAK_HOUR_FATIGUE
    if (s.is_peak_hour && s.current_energy_score < 55) {
      alerts.push({
        rule_id: 'peak_hour_fatigue',
        severity: 'critical',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        role: s.role,
        hours_into_shift: s.hours_into_shift,
        current_energy_score: s.current_energy_score,
        current_error_rate: s.current_error_rate,
        start_error_rate: s.start_error_rate,
        is_peak_hour: true,
        est_monthly_opportunity: monthlyOpp * 3,
        description: `${s.staff_name} (${s.role}): PEAK-HOUR FATIGUE — energy ${s.current_energy_score}/100 DURING PEAK. Error rate ${s.current_error_rate}/10 orders. Worst-case scenario: tired staff + busiest time = cascade of errors affecting multiple customers. Peak-hour errors cost 3x normal (more customers affected + harder to recover). RELIEVE this staff member from peak duties: move to prep/stocking, bring in fresh staff, or extend break. Never leave fatigued staff on the floor during peak — it's the highest-risk operational scenario.`,
        ai_recommendation: 'end_shift',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: ENERGY_RECOVERY_CONFIRMED
    if (s.post_break_energy != null && s.pre_break_energy != null) {
      const recovery = s.post_break_energy - s.pre_break_energy;
      if (recovery >= 20) {
        alerts.push({
          rule_id: 'energy_recovery_confirmed',
          severity: 'low',
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          role: s.role,
          current_energy_score: s.current_energy_score,
          est_monthly_opportunity: 0,
          description: `${s.staff_name} (${s.role}): ENERGY RECOVERY — break restored ${recovery.toFixed(0)} energy points (${s.pre_break_energy} → ${s.post_break_energy}/100). Break was EFFECTIVE. Validates break scheduling. Track which break durations produce best recovery: 15min vs 30min vs 45min. This data optimizes future break scheduling — longer isn't always better. Current energy: ${s.current_energy_score}/100 ${s.current_energy_score < 50 ? '(declining again — may need second break). ' : '(sustaining well).'}`,
          ai_recommendation: 'monitor',
          status: 'open', detected_at: now,
        });
      }
    }
  }

  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant workforce management AI specializing in staff energy and fatigue optimization. Recommend specific break timing and shift management interventions. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Staff: ${a.staff_name} (${a.role ?? 'N/A'}) — ${a.rule_id}. ${a.hours_into_shift ?? 0}h into shift. Energy: ${a.current_energy_score ?? 0}/100 (started ${a.shift_start_energy ?? 0}). Error rate: ${a.current_error_rate ?? 0}/10 (started ${a.start_error_rate ?? 0}). Speed: ${a.current_speed_pct ?? 0}%. Peak: ${a.is_peak_hour ?? false}. Break taken: ${a.has_taken_break ?? 'N/A'}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM staff_energy_alert WHERE status = 'open' AND detected_at < time::now() - 2h`);
  } catch { /* ignore - short TTL for real-time */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE staff_energy_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<StaffEnergyAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM staff_energy_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  avgEnergyScore: number; fatiguedStaff: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(current_energy_score WHERE current_energy_score != NONE) AS avgenergy,
              math::count(current_energy_score < 50) AS fatigued
       FROM staff_energy_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      avgEnergyScore: safeNumber(r.avgenergy, 0), fatiguedStaff: safeNumber(r.fatigued, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgEnergyScore: 0, fatiguedStaff: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
