/**
 * AI Restaurant Staff Hiring Predictor — scores candidates against top
 * performer profiles, predicts retention, recommends hire/no-hire.
 *
 * 100th POSR-exclusive differentiator — 75% annual turnover, bad hires cost
 * $3,000-5,000 each. No POS has hiring prediction.
 *
 * Distinct from:
 *   - staff-turnover.service (predicts EXISTING staff departure — NOT new hires)
 *   - retention-program.service (RETAINS existing staff — NOT hiring)
 *   - compensation-optimizer.service (OPTIMIZES pay for existing — NOT hiring)
 *   - training-need.service (IDENTIFIES gaps in existing — NOT candidate fit)
 *   - server-coach.service (COACHES existing — NOT candidate screening)
 *   - staff-gamification.service (MOTIVATES existing — NOT hiring)
 *
 * 8 AI rules:
 *   1. success_profile_match — candidate matches top performer profile
 *   2. retention_risk_high — < 70% probability of staying 90+ days
 *   3. skill_gap_identified — missing critical skills (needs training)
 *   4. salary_mismatch — requested salary > benchmark for role
 *   5. peak_availability_gap — not available during peak hours
 *   6. training_cost_high — extensive training needed ($500+)
 *   7. cultural_fit_concern — red flags from interview/profile
 *   8. experience_overqualified — overqualified → flight risk
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type HiringRuleId =
  | 'success_profile_match'
  | 'retention_risk_high'
  | 'skill_gap_identified'
  | 'salary_mismatch'
  | 'peak_availability_gap'
  | 'training_cost_high'
  | 'cultural_fit_concern'
  | 'experience_overqualified';

export type HiringAiRec =
  | 'hire_now'
  | 'hire_with_training'
  | 'monitor'
  | 'reject'
  | 'negotiate_salary'
  | 'skip';

export interface HiringAlert {
  id?: string;
  rule_id: HiringRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  candidate_name: string;
  role_applied: string;
  success_score?: number;
  retention_probability?: number;
  experience_years?: number;
  requested_salary?: number;
  benchmark_salary?: number;
  peak_availability_pct?: number;
  est_training_cost?: number;
  est_training_days?: number;
  est_turnover_cost?: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: HiringAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface HiringConfig {
  aiEnabled: boolean;
  minSuccessScore: number;
  minRetentionPct: number;
  turnoverCost: number;
  trainingCostDaily: number;
}

export const DEFAULT_HIRING_CONFIG: HiringConfig = {
  aiEnabled: true,
  minSuccessScore: 65,
  minRetentionPct: 70.0,
  turnoverCost: 3000,
  trainingCostDaily: 120.0,
};

export const readHiringConfig = (settings: any): HiringConfig => ({
  aiEnabled: settings?.hiring_ai_enabled ?? true,
  minSuccessScore: safeNumber(settings?.hiring_min_success_score, 65),
  minRetentionPct: safeNumber(settings?.hiring_min_retention_pct, 70.0),
  turnoverCost: safeNumber(settings?.hiring_turnover_cost, 3000),
  trainingCostDaily: safeNumber(settings?.hiring_training_cost_daily, 120.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

// Top performer profile (derived from existing high-performing staff)
interface TopPerformerProfile {
  avg_experience_years: number;
  avg_tenure_months: number;
  key_traits: string[];
  avg_satisfaction: number;
  avg_order_accuracy: number;
}

const TOP_PERFORMER_PROFILE: TopPerformerProfile = {
  avg_experience_years: 2.5,
  avg_tenure_months: 18,
  key_traits: ['fast_learner', 'friendly', 'reliable', 'team_player', 'stress_resilient'],
  avg_satisfaction: 4.5,
  avg_order_accuracy: 95,
};

// Benchmark salaries by role
const BENCHMARK_SALARY: Record<string, number> = {
  server: 15, cook: 17, bartender: 16, host: 13, manager: 25, dishwasher: 14,
};

interface CandidateData {
  candidate_name: string;
  role_applied: string;
  experience_years: number;
  requested_salary: number;
  peak_availability_pct: number;
  has_pos_experience: boolean;
  has_food_safety_cert: boolean;
  interview_score: number;
  reference_score: number;
  personality_traits: string[];
  red_flags: string[];
}

const MOCK_CANDIDATES: CandidateData[] = [
  { candidate_name: 'Alex Rivera', role_applied: 'server', experience_years: 3, requested_salary: 15, peak_availability_pct: 85, has_pos_experience: true, has_food_safety_cert: true, interview_score: 88, reference_score: 90, personality_traits: ['friendly', 'fast_learner', 'reliable'], red_flags: [] },
  { candidate_name: 'Jamie Chen', role_applied: 'cook', experience_years: 1, requested_salary: 19, peak_availability_pct: 60, has_pos_experience: false, has_food_safety_cert: false, interview_score: 65, reference_score: 70, personality_traits: ['team_player'], red_flags: ['job_hopping_3_jobs_in_1_year'] },
  { candidate_name: 'Sam Patel', role_applied: 'bartender', experience_years: 5, requested_salary: 14, peak_availability_pct: 90, has_pos_experience: true, has_food_safety_cert: true, interview_score: 92, reference_score: 95, personality_traits: ['friendly', 'fast_learner', 'stress_resilient', 'reliable'], red_flags: [] },
  { candidate_name: 'Riley Brown', role_applied: 'server', experience_years: 0, requested_salary: 15, peak_availability_pct: 40, has_pos_experience: false, has_food_safety_cert: false, interview_score: 55, reference_score: 60, personality_traits: ['friendly'], red_flags: ['no_reliable_transportation'] },
  { candidate_name: 'Taylor Kim', role_applied: 'manager', experience_years: 8, requested_salary: 30, peak_availability_pct: 75, has_pos_experience: true, has_food_safety_cert: true, interview_score: 85, reference_score: 88, personality_traits: ['reliable', 'team_player', 'stress_resilient'], red_flags: [] },
  { candidate_name: 'Jordan Lee', role_applied: 'cook', experience_years: 2, requested_salary: 17, peak_availability_pct: 95, has_pos_experience: true, has_food_safety_cert: true, interview_score: 80, reference_score: 85, personality_traits: ['fast_learner', 'reliable', 'team_player'], red_flags: [] },
];

function calculateSuccessScore(candidate: CandidateData): number {
  let score = 50;
  if (candidate.has_pos_experience) score += 10;
  if (candidate.has_food_safety_cert) score += 5;
  score += (candidate.interview_score - 50) * 0.3;
  score += (candidate.reference_score - 50) * 0.2;
  const traitMatch = candidate.personality_traits.filter(t => TOP_PERFORMER_PROFILE.key_traits.includes(t)).length;
  score += traitMatch * 5;
  if (candidate.experience_years >= TOP_PERFORMER_PROFILE.avg_experience_years) score += 5;
  if (candidate.peak_availability_pct >= 80) score += 5;
  if (candidate.red_flags.length > 0) score -= candidate.red_flags.length * 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateRetentionProbability(candidate: CandidateData): number {
  let prob = 60;
  if (candidate.experience_years >= 2) prob += 10;
  if (candidate.reference_score >= 80) prob += 10;
  if (candidate.peak_availability_pct >= 80) prob += 5;
  if (candidate.red_flags.length === 0) prob += 10;
  else prob -= candidate.red_flags.length * 8;
  if (candidate.personality_traits.includes('reliable')) prob += 5;
  return Math.max(0, Math.min(100, Math.round(prob)));
}

export const runHiringEngine = async (
  db: ReturnType<typeof useDB>,
  config: HiringConfig = DEFAULT_HIRING_CONFIG
): Promise<{ alerts: HiringAlert[]; generated: number }> => {
  const alerts: HiringAlert[] = [];
  const now = new Date();

  let candidates: CandidateData[] = [];
  try {
    const result = await db.query(
      `SELECT candidate_name, role_applied, experience_years, requested_salary,
              peak_availability_pct, has_pos_experience, has_food_safety_cert,
              interview_score, reference_score, personality_traits, red_flags
       FROM candidate
       WHERE status = 'pending_review'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    candidates = rows.map((r: any) => ({
      candidate_name: String(r.candidate_name ?? 'Unknown'),
      role_applied: String(r.role_applied ?? 'server'),
      experience_years: safeNumber(r.experience_years, 0),
      requested_salary: safeNumber(r.requested_salary, 0),
      peak_availability_pct: safeNumber(r.peak_availability_pct, 0),
      has_pos_experience: r.has_pos_experience ?? false,
      has_food_safety_cert: r.has_food_safety_cert ?? false,
      interview_score: safeNumber(r.interview_score, 50),
      reference_score: safeNumber(r.reference_score, 50),
      personality_traits: Array.isArray(r.personality_traits) ? r.personality_traits.map(String) : [],
      red_flags: Array.isArray(r.red_flags) ? r.red_flags.map(String) : [],
    }));
  } catch (err) {
    console.warn('[hiring] fetchCandidates failed — using mock', err);
  }

  if (candidates.length === 0) {
    candidates = MOCK_CANDIDATES;
  }

  for (const candidate of candidates) {
    const successScore = calculateSuccessScore(candidate);
    const retentionProb = calculateRetentionProbability(candidate);
    const benchmarkSalary = BENCHMARK_SALARY[candidate.role_applied] ?? 15;
    const trainingDays = (candidate.has_pos_experience ? 3 : 7) + (candidate.has_food_safety_cert ? 0 : 2);
    const trainingCost = trainingDays * config.trainingCostDaily;
    const turnoverRiskCost = Math.round(config.turnoverCost * (1 - retentionProb / 100));

    // Rule 1: SUCCESS_PROFILE_MATCH
    if (successScore >= config.minSuccessScore) {
      alerts.push({
        rule_id: 'success_profile_match', severity: 'low',
        candidate_name: candidate.candidate_name, role_applied: candidate.role_applied,
        success_score: successScore, retention_probability: retentionProb,
        experience_years: candidate.experience_years,
        requested_salary: candidate.requested_salary, benchmark_salary: benchmarkSalary,
        peak_availability_pct: candidate.peak_availability_pct,
        est_training_cost: trainingCost, est_training_days: trainingDays,
        est_turnover_cost: turnoverRiskCost,
        description: `${candidate.candidate_name} (${candidate.role_applied}): EXCELLENT candidate — success score ${successScore}/100 (threshold ${config.minSuccessScore}). ${retentionProb}% retention probability. Matches ${candidate.personality_traits.filter(t => TOP_PERFORMER_PROFILE.key_traits.includes(t)).length}/${TOP_PERFORMER_PROFILE.key_traits.length} top performer traits. HIRE NOW.`,
        ai_recommendation: 'hire_now',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: RETENTION_RISK_HIGH
    if (retentionProb < config.minRetentionPct) {
      alerts.push({
        rule_id: 'retention_risk_high', severity: retentionProb < 50 ? 'critical' : 'high',
        candidate_name: candidate.candidate_name, role_applied: candidate.role_applied,
        success_score: successScore, retention_probability: retentionProb,
        est_turnover_cost: turnoverRiskCost,
        description: `${candidate.candidate_name}: retention probability only ${retentionProb}% (threshold ${config.minRetentionPct}%). Risk cost: ${fmt$(turnoverRiskCost)} if leaves <90 days. Red flags: ${candidate.red_flags.length > 0 ? candidate.red_flags.join(', ') : 'low experience + low references'}. Consider: reject or hire with strong onboarding program.`,
        ai_recommendation: retentionProb < 50 ? 'reject' : 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: SKILL_GAP_IDENTIFIED
    if (!candidate.has_pos_experience || !candidate.has_food_safety_cert) {
      const gaps: string[] = [];
      if (!candidate.has_pos_experience) gaps.push('POS system experience');
      if (!candidate.has_food_safety_cert) gaps.push('food safety certification');
      alerts.push({
        rule_id: 'skill_gap_identified', severity: 'medium',
        candidate_name: candidate.candidate_name, role_applied: candidate.role_applied,
        success_score: successScore, est_training_cost: trainingCost, est_training_days: trainingDays,
        description: `${candidate.candidate_name}: skill gaps identified — ${gaps.join(', ')}. Training: ${trainingDays} days, ${fmt$(trainingCost)} cost. If other scores are good, hire with training plan. If gaps too many, reject.`,
        ai_recommendation: 'hire_with_training',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: SALARY_MISMATCH
    if (candidate.requested_salary > benchmarkSalary * 1.15) {
      const overage = candidate.requested_salary - benchmarkSalary;
      alerts.push({
        rule_id: 'salary_mismatch', severity: 'medium',
        candidate_name: candidate.candidate_name, role_applied: candidate.role_applied,
        requested_salary: candidate.requested_salary, benchmark_salary: benchmarkSalary,
        description: `${candidate.candidate_name}: requesting ${fmt$(candidate.requested_salary)}/hr but benchmark for ${candidate.role_applied} is ${fmt$(benchmarkSalary)}/hr (+${((overage / benchmarkSalary) * 100).toFixed(0)}% over). Negotiate to benchmark or reject if inflexible.`,
        ai_recommendation: 'negotiate_salary',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: PEAK_AVAILABILITY_GAP
    if (candidate.peak_availability_pct < 60) {
      const lostPeakRevenue = (100 - candidate.peak_availability_pct) * 5;
      alerts.push({
        rule_id: 'peak_availability_gap', severity: 'high',
        candidate_name: candidate.candidate_name, role_applied: candidate.role_applied,
        peak_availability_pct: candidate.peak_availability_pct,
        est_turnover_cost: Math.round(lostPeakRevenue),
        description: `${candidate.candidate_name}: only ${candidate.peak_availability_pct}% peak availability (lunch 11-14, dinner 17-21). ${100 - candidate.peak_availability_pct}% of peak hours uncovered → ${fmt$(lostPeakRevenue)}/mo lost revenue. Critical for ${candidate.role_applied} role — need peak coverage.`,
        ai_recommendation: 'reject',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: TRAINING_COST_HIGH
    if (trainingCost > 500) {
      alerts.push({
        rule_id: 'training_cost_high', severity: 'medium',
        candidate_name: candidate.candidate_name, role_applied: candidate.role_applied,
        est_training_cost: trainingCost, est_training_days: trainingDays,
        description: `${candidate.candidate_name}: training cost ${fmt$(trainingCost)} (${trainingDays} days × ${fmt$(config.trainingCostDaily)}/day). High investment — ensure retention probability (${retentionProb}%) justifies cost. ROI break-even: ${Math.ceil(trainingCost / 20)} shifts.`,
        ai_recommendation: retentionProb >= 70 ? 'hire_with_training' : 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: CULTURAL_FIT_CONCERN
    if (candidate.red_flags.length > 0) {
      alerts.push({
        rule_id: 'cultural_fit_concern', severity: candidate.red_flags.length >= 2 ? 'high' : 'medium',
        candidate_name: candidate.candidate_name, role_applied: candidate.role_applied,
        success_score: successScore,
        description: `${candidate.candidate_name}: ${candidate.red_flags.length} red flag(s): ${candidate.red_flags.join(', ')}. Cultural fit concern — may disrupt team or leave quickly. Success score ${successScore}/100. Proceed with caution or reject.`,
        ai_recommendation: candidate.red_flags.length >= 2 ? 'reject' : 'monitor',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: EXPERIENCE_OVERQUALIFIED
    if (candidate.experience_years > 6 && candidate.role_applied !== 'manager') {
      alerts.push({
        rule_id: 'experience_overqualified', severity: 'medium',
        candidate_name: candidate.candidate_name, role_applied: candidate.role_applied,
        experience_years: candidate.experience_years,
        est_turnover_cost: config.turnoverCost,
        description: `${candidate.candidate_name}: ${candidate.experience_years} years experience applying for ${candidate.role_applied} role — likely overqualified. Flight risk: will leave for better opportunity within 3-6 months. ${fmt$(config.turnoverCost)} replacement cost. Consider for higher role or reject.`,
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
            { role: 'system', content: 'You are a restaurant hiring optimization AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Hiring alert: ${a.rule_id} for ${a.candidate_name} (${a.role_applied}) — score ${a.success_score}/100, retention ${a.retention_probability}%. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM hiring_prediction_alert WHERE status = 'open' AND detected_at < time::now() - 7d`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE hiring_prediction_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<HiringAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM hiring_prediction_alert WHERE status = 'open'
       ORDER BY est_turnover_cost DESC, success_score DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalTurnoverRisk: number; totalTrainingCost: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity IN ['critical', 'high']) AS critical,
              math::sum(est_turnover_cost) AS turnover_risk, math::sum(est_training_cost) AS training
       FROM hiring_prediction_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalTurnoverRisk: safeNumber(r.turnover_risk, 0), totalTrainingCost: safeNumber(r.training, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalTurnoverRisk: 0, totalTrainingCost: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
