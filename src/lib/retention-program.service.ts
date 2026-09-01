/**
 * AI Staff Retention Program Builder — personalized retention plans.
 *
 * 73rd POSR-exclusive differentiator — restaurant industry has 75% annual
 * turnover (BLS). Each lost employee costs $5,864 (Cornell CHR). 50% cite
 * "lack of growth" and "feeling undervalued" (Gallup).
 *
 * Distinct from:
 *   - staff-turnover.service (PREDICTS departure risk — doesn't build programs)
 *   - gamification.service (competition-based motivation — NOT individualized retention)
 *   - schedule-preference.service (learns scheduling prefs — NOT career development)
 *   - training-need.service (identifies skill gaps — NOT retention programs)
 *   - server-coach.service (skill matrix + coaching — NOT retention strategy)
 *
 * Builds personalized retention programs per high-risk employee:
 * career path planning, compensation review, recognition programs,
 * work-life balance adjustments, and mentorship matching.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type RetentionRuleId =
  | 'career_path'
  | 'compensation_review'
  | 'recognition_gap'
  | 'worklife_balance'
  | 'mentorship_match';

export type RetentionAiRec =
  | 'implement_now'
  | 'schedule_review'
  | 'escalate_to_owner'
  | 'monitor'
  | 'accept_departure';

export interface RetentionProgram {
  id?: string;
  rule_id: RetentionRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  staff_id?: string;
  staff_name?: string;
  turnover_risk: number;
  tenure_months: number;
  program_type: string;
  program_actions?: string;
  est_retention_probability: number;
  est_cost: number;
  est_replacement_cost: number;
  est_roi: number;
  mentor_assigned?: string;
  review_date?: Date;
  description: string;
  ai_insight?: string;
  ai_recommendation?: RetentionAiRec;
  status: 'open' | 'in_progress' | 'retained' | 'departed' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface RetentionConfig {
  aiEnabled: boolean;
  riskThreshold: number;
  replacementCost: number;
  programBudget: number;
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  aiEnabled: true,
  riskThreshold: 0.60,
  replacementCost: 5864,
  programBudget: 500,
};

export const readRetentionConfig = (settings: any): RetentionConfig => ({
  aiEnabled: settings?.retention_ai_enabled ?? true,
  riskThreshold: safeNumber(settings?.retention_risk_threshold, 0.60),
  replacementCost: safeNumber(settings?.retention_replacement_cost, 5864),
  programBudget: safeNumber(settings?.retention_program_budget, 500),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface StaffRiskData {
  staff_id: string;
  staff_name: string;
  turnover_risk: number;
  tenure_months: number;
  risk_factors: string[];
  base_rate: number;
  avg_hours: number;
  performance_notes: string[];
}

/**
 * Run the retention program builder engine.
 */
export const runRetentionEngine = async (
  db: ReturnType<typeof useDB>,
  config: RetentionConfig = DEFAULT_RETENTION_CONFIG
): Promise<{ programs: RetentionProgram[]; generated: number }> => {
  const programs: RetentionProgram[] = [];
  const now = new Date();

  // 1. Fetch staff data with turnover risk indicators
  let staffData: StaffRiskData[] = [];
  try {
    const result = await db.query(
      `SELECT
         id AS staff_id,
         name AS staff_name,
         base_rate,
         0 AS turnover_risk,
         0 AS avg_hours,
         0 AS tenure_months
       FROM user
       WHERE deleted_at IS NONE
         AND role IN ['server', 'cook', 'bartender', 'host', 'manager', 'dishwasher']
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    // Fetch shift data for tenure + hours
    let shiftStats: Map<string, { tenure_days: number; avg_hours: number; shift_count: number }> = new Map();
    try {
      const shiftResult = await db.query(
        `SELECT
           user.id AS sid,
           time::now() - time::min(start_time) AS tenure_micros,
           math::mean(time::minute(end_time) - time::minute(start_time)) / 60 AS avg_hours,
           count() AS shift_count
         FROM shift
         WHERE deleted_at IS NONE AND user IS NOT NONE
         GROUP BY user.id`
      );
      const shiftRows = Array.isArray(shiftResult) ? shiftResult.flat() : [];
      for (const r of shiftRows) {
        const tenureMicros = safeNumber(r.tenure_micros, 0);
        const tenureDays = tenureMicros / (24 * 60 * 60 * 1000000);
        shiftStats.set(String(r.sid), {
          tenure_days: tenureDays,
          avg_hours: safeNumber(r.avg_hours, 0),
          shift_count: safeNumber(r.shift_count, 0),
        });
      }
    } catch { /* ignore */ }

    // Fetch performance notes
    let notesMap: Map<string, string[]> = new Map();
    try {
      const notesResult = await db.query(
        `SELECT user.id AS sid, note AS text
         FROM performance_note
         WHERE created_at > time::now() - 90d
         LIMIT 100`
      );
      const notesRows = Array.isArray(notesResult) ? notesResult.flat() : [];
      for (const r of notesRows) {
        const sid = String(r.sid ?? '');
        if (!notesMap.has(sid)) notesMap.set(sid, []);
        notesMap.get(sid)!.push(String(r.text ?? ''));
      }
    } catch { /* ignore */ }

    staffData = rows.map((r: any) => {
      const stats = shiftStats.get(String(r.staff_id)) ?? { tenure_days: 0, avg_hours: 0, shift_count: 0 };
      const notes = notesMap.get(String(r.staff_id)) ?? [];
      const tenureMonths = Math.floor(stats.tenure_days / 30);

      // Compute turnover risk (simplified version of staff-turnover.service)
      const riskFactors: string[] = [];
      let risk = 0;

      if (tenureMonths < 6) { risk += 0.20; riskFactors.push('TENURE_SHORT'); }
      if (stats.avg_hours > 40) { risk += 0.15; riskFactors.push('HIGH_OVERTIME'); }
      if (stats.shift_count < 5) { risk += 0.12; riskFactors.push('LOW_UTILIZATION'); }
      if (notes.some(n => n.toLowerCase().match(/negative|issue|warning|poor/))) {
        risk += 0.15; riskFactors.push('RECENT_NEGATIVE_NOTES');
      }
      if (tenureMonths > 18 && stats.shift_count > 50) {
        // Long tenure but no promotion = stagnation
        risk += 0.10; riskFactors.push('NO_PROMOTION');
      }

      risk = Math.min(0.95, risk);

      return {
        staff_id: String(r.staff_id ?? ''),
        staff_name: String(r.staff_name ?? 'Unknown'),
        turnover_risk: risk,
        tenure_months: tenureMonths,
        risk_factors: riskFactors,
        base_rate: safeNumber(r.base_rate, 15),
        avg_hours: stats.avg_hours,
        performance_notes: notes,
      };
    }).filter(s => s.turnover_risk >= config.riskThreshold);
  } catch (err) {
    console.warn('[retention] fetchStaffData failed', err);
  }

  if (staffData.length === 0) return { programs: [], generated: 0 };

  // 2. Build retention programs per high-risk staff
  for (const staff of staffData) {
    // Determine primary retention need based on risk factors
    const hasTenureShort = staff.risk_factors.includes('TENURE_SHORT');
    const hasHighOvertime = staff.risk_factors.includes('HIGH_OVERTIME');
    const hasLowUtil = staff.risk_factors.includes('LOW_UTILIZATION');
    const hasNegativeNotes = staff.risk_factors.includes('RECENT_NEGATIVE_NOTES');
    const hasNoPromotion = staff.risk_factors.includes('NO_PROMOTION');

    // --- Rule 1: CAREER_PATH — for long-tenure, no promotion ---
    if (hasNoPromotion && staff.tenure_months >= 18) {
      const actions = [
        `Define career path: ${staff.staff_name} → Senior Server → Shift Lead → Manager`,
        'Create 90-day promotion milestones with measurable goals',
        `Assign stretch project: train new hires (leverages ${staff.tenure_months}mo experience)`,
        'Monthly 1:1 with manager to track progress',
        'Set promotion review date in 90 days',
      ];
      const estCost = 200; // training materials + manager time
      const estRetentionProb = 0.70;
      const estRoi = (config.replacementCost - estCost) / estCost;

      programs.push({
        rule_id: 'career_path',
        severity: staff.turnover_risk > 0.7 ? 'critical' : 'high',
        staff_id: staff.staff_id,
        staff_name: staff.staff_name,
        turnover_risk: Math.round(staff.turnover_risk * 100) / 100,
        tenure_months: staff.tenure_months,
        program_type: 'career_path',
        program_actions: JSON.stringify(actions),
        est_retention_probability: estRetentionProb,
        est_cost: estCost,
        est_replacement_cost: config.replacementCost,
        est_roi: Math.round(estRoi * 100) / 100,
        review_date: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
        description: `${staff.staff_name} (${staff.tenure_months}mo tenure, ${Math.round(staff.turnover_risk * 100)}% departure risk) — CAREER PATH program: define promotion track, assign stretch project, 90-day review. Est ${estRetentionProb * 100}% retention, ${fmt$(estRoi)}x ROI.`,
        ai_recommendation: 'implement_now',
        status: 'open',
        detected_at: now,
      });
      continue;
    }

    // --- Rule 2: COMPENSATION_REVIEW — pay below market ---
    if (staff.base_rate < 15 && staff.tenure_months >= 6) {
      const marketRate = 18; // assumed market rate
      const raiseAmount = (marketRate - staff.base_rate) * staff.avg_hours * 52;
      const actions = [
        `Compensation review: current $${staff.base_rate.toFixed(2)}/hr vs market $${marketRate.toFixed(2)}/hr`,
        `Propose raise to $${(staff.base_rate + 1.50).toFixed(2)}/hr (immediate) with path to $${marketRate.toFixed(2)}/hr in 6 months`,
        'Tie raise to performance milestones (attendance, accuracy, upsell)',
        'Review benefits package (PTO accrual, health insurance, meal discounts)',
        'Conduct stay interview: ask what would make them stay',
      ];
      const estCost = Math.min(raiseAmount / 4, config.programBudget); // first 3 months cost
      const estRetentionProb = 0.65;
      const estRoi = (config.replacementCost - estCost) / estCost;

      programs.push({
        rule_id: 'compensation_review',
        severity: staff.turnover_risk > 0.7 ? 'high' : 'medium',
        staff_id: staff.staff_id,
        staff_name: staff.staff_name,
        turnover_risk: Math.round(staff.turnover_risk * 100) / 100,
        tenure_months: staff.tenure_months,
        program_type: 'compensation',
        program_actions: JSON.stringify(actions),
        est_retention_probability: estRetentionProb,
        est_cost: Math.round(estCost * 100) / 100,
        est_replacement_cost: config.replacementCost,
        est_roi: Math.round(estRoi * 100) / 100,
        review_date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        description: `${staff.staff_name} ($${staff.base_rate.toFixed(2)}/hr, ${Math.round(staff.turnover_risk * 100)}% risk) — COMPENSATION review: raise to $${(staff.base_rate + 1.50).toFixed(2)}/hr. Est ${estRetentionProb * 100}% retention, ${fmt$(estRoi)}x ROI.`,
        ai_recommendation: 'schedule_review',
        status: 'open',
        detected_at: now,
      });
      continue;
    }

    // --- Rule 3: RECOGNITION_GAP — no positive feedback ---
    if (hasNegativeNotes || (staff.tenure_months >= 3 && staff.performance_notes.length === 0)) {
      const actions = [
        'Implement weekly recognition: public "shout-out" at pre-shift meeting',
        'Create peer-nominated "Employee of the Month" program with $50 bonus',
        'Send personalized thank-you note from owner/manager (handwritten)',
        'Celebrate work anniversary publicly (if applicable)',
        'Set up anonymous feedback channel for concerns',
      ];
      const estCost = 50; // small bonus + materials
      const estRetentionProb = 0.55;
      const estRoi = (config.replacementCost - estCost) / estCost;

      programs.push({
        rule_id: 'recognition_gap',
        severity: 'medium',
        staff_id: staff.staff_id,
        staff_name: staff.staff_name,
        turnover_risk: Math.round(staff.turnover_risk * 100) / 100,
        tenure_months: staff.tenure_months,
        program_type: 'recognition',
        program_actions: JSON.stringify(actions),
        est_retention_probability: estRetentionProb,
        est_cost: estCost,
        est_replacement_cost: config.replacementCost,
        est_roi: Math.round(estRoi * 100) / 100,
        review_date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        description: `${staff.staff_name} (${staff.tenure_months}mo, ${Math.round(staff.turnover_risk * 100)}% risk) — RECOGNITION gap: implement weekly shout-outs, peer recognition, handwritten notes. Est ${estRetentionProb * 100}% retention.`,
        ai_recommendation: 'implement_now',
        status: 'open',
        detected_at: now,
      });
      continue;
    }

    // --- Rule 4: WORKLIFE_BALANCE — high overtime or low utilization ---
    if (hasHighOvertime || hasLowUtil) {
      const issue = hasHighOvertime ? 'burnout from excessive overtime' : 'underutilized (disengaged)';
      const actions = hasHighOvertime ? [
        'Reduce overtime: cap at 5 hours/week for next 30 days',
        'Offer flexible scheduling: let them choose 2 shifts per week',
        'Add 15-min break during shifts (mandatory)',
        'Wellness check: manager 1:1 to discuss workload',
        'Consider 4-day work week trial (10h shifts, 4 days)',
      ] : [
        'Increase shift allocation: ensure 4+ shifts/week',
        'Cross-train for multiple stations (more shift opportunities)',
        'Assign to high-traffic shifts (Friday/Saturday) for better tips',
        'Set performance goals with clear weekly hours target',
        'Check if scheduling preferences are being honored (schedule-preference.service)',
      ];
      const estCost = 100;
      const estRetentionProb = 0.60;
      const estRoi = (config.replacementCost - estCost) / estCost;

      programs.push({
        rule_id: 'worklife_balance',
        severity: 'high',
        staff_id: staff.staff_id,
        staff_name: staff.staff_name,
        turnover_risk: Math.round(staff.turnover_risk * 100) / 100,
        tenure_months: staff.tenure_months,
        program_type: 'worklife',
        program_actions: JSON.stringify(actions),
        est_retention_probability: estRetentionProb,
        est_cost: estCost,
        est_replacement_cost: config.replacementCost,
        est_roi: Math.round(estRoi * 100) / 100,
        review_date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        description: `${staff.staff_name} (${staff.tenure_months}mo, ${Math.round(staff.turnover_risk * 100)}% risk) — WORK-LIFE: ${issue}. Adjust schedule, wellness check. Est ${estRetentionProb * 100}% retention.`,
        ai_recommendation: 'implement_now',
        status: 'open',
        detected_at: now,
      });
      continue;
    }

    // --- Rule 5: MENTORSHIP_MATCH — new employees (tenure < 6mo) ---
    if (hasTenureShort) {
      const actions = [
        'Assign veteran mentor (2+ year tenure, high performer)',
        'Weekly mentor check-ins (15 min, paid)',
        '30-60-90 day onboarding milestones with mentor sign-off',
        'Shadow mentor for first 3 shifts (learn culture + procedures)',
        'Mentor receives $100 bonus if mentee retained 6+ months',
      ];
      const estCost = 150; // mentor bonus + materials
      const estRetentionProb = 0.75; // mentorship is very effective for new hires
      const estRoi = (config.replacementCost - estCost) / estCost;

      programs.push({
        rule_id: 'mentorship_match',
        severity: staff.turnover_risk > 0.5 ? 'high' : 'medium',
        staff_id: staff.staff_id,
        staff_name: staff.staff_name,
        turnover_risk: Math.round(staff.turnover_risk * 100) / 100,
        tenure_months: staff.tenure_months,
        program_type: 'mentorship',
        program_actions: JSON.stringify(actions),
        est_retention_probability: estRetentionProb,
        est_cost: estCost,
        est_replacement_cost: config.replacementCost,
        est_roi: Math.round(estRoi * 100) / 100,
        mentor_assigned: 'Top performer (auto-match)',
        review_date: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
        description: `${staff.staff_name} (${staff.tenure_months}mo, ${Math.round(staff.turnover_risk * 100)}% risk) — MENTORSHIP: assign veteran mentor, weekly check-ins, 30-60-90 onboarding. Est ${estRetentionProb * 100}% retention, ${fmt$(estRoi)}x ROI.`,
        ai_recommendation: 'implement_now',
        status: 'open',
        detected_at: now,
      });
    }
  }

  // 3. AI insight for top 5 critical/high programs
  if (config.aiEnabled && programs.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topPrograms = programs.filter(p => p.severity === 'critical' || p.severity === 'high').slice(0, 5);
      for (const p of topPrograms) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant staff retention AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Staff ${p.staff_name}: ${p.tenure_months}mo tenure, ${Math.round(p.turnover_risk * 100)}% departure risk. Program: ${p.program_type}. Est ${Math.round(p.est_retention_probability * 100)}% retention if implemented. Cost ${fmt$(p.est_cost)}, replacement cost ${fmt$(p.est_replacement_cost)}, ROI ${p.est_roi}x.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          p.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM retention_program WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const p of programs) {
    try {
      await db.query(`CREATE retention_program CONTENT $data`, {
        data: { ...p, review_date: p.review_date?.toISOString(), detected_at: p.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { programs, generated: programs.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActivePrograms = async (db: ReturnType<typeof useDB>): Promise<RetentionProgram[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM retention_program
       WHERE status IN ('open', 'in_progress')
       ORDER BY turnover_risk DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  programCount: number;
  criticalCount: number;
  totalProgramCost: number;
  totalReplacementSavings: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_cost) AS cost,
         math::sum(est_replacement_cost - est_cost) AS savings
       FROM retention_program
       WHERE status IN ('open', 'in_progress') GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      programCount: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalProgramCost: safeNumber(r.cost, 0),
      totalReplacementSavings: safeNumber(r.savings, 0),
    };
  } catch {
    return { programCount: 0, criticalCount: 0, totalProgramCost: 0, totalReplacementSavings: 0 };
  }
};

export const updateProgramStatus = async (
  db: ReturnType<typeof useDB>,
  programId: string,
  status: 'in_progress' | 'retained' | 'departed' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: programId, status });
};
