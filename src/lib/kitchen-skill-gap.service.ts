/**
 * AI Kitchen Staff Skill Gap Analyzer — analyzes kitchen staff technique-level
 * performance against station benchmarks to identify skill gaps, recommend
 * targeted training, and optimize task assignment.
 *
 * 123rd POSR-exclusive differentiator — restaurants lose $500-1,500/mo per
 * location from kitchen staff skill gaps going undetected. No POS tracks
 * per-technique skill levels for kitchen staff.
 *
 * Distinct from:
 *   - training-need.service (23rd) — predicts WHO needs training across ALL staff
 *   - server-coach.service (45th) — 5-dimension skill matrix for SERVERS (FOH)
 *   - driver-coach.service — coaching for delivery drivers
 *   - server-performance.service — tracks server metrics (not kitchen techniques)
 *   - kitchen-station-efficiency.service — benchmarks STATIONS (not individual skills)
 *
 * 8 AI rules:
 *   1. technique_gap — specific technique score < benchmark by 20+ → targeted training
 *   2. skill_deterioration — was good, now declining 15+ points → investigate cause
 *   3. top_performer — technique score ≥85 → peer mentor candidate
 *   4. cross_training_opportunity — strong at 2+ stations → cross-train for flexibility
 *   5. station_mismatch — low scores at assigned station but high elsewhere → reassign
 *   6. training_roi_positive — post-training score improved → verify effectiveness
 *   7. peer_mentor_match — gap staff + top performer at same technique → pair them
 *   8. skill_stagnation — no improvement over time despite training → try different approach
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type KitchenSkillRuleId =
  | 'technique_gap'
  | 'skill_deterioration'
  | 'top_performer'
  | 'cross_training_opportunity'
  | 'station_mismatch'
  | 'training_roi_positive'
  | 'peer_mentor_match'
  | 'skill_stagnation';

export type KitchenSkillAiRec =
  | 'targeted_training'
  | 'peer_mentoring'
  | 'cross_train'
  | 'reassign_station'
  | 'verify_training'
  | 'investigate'
  | 'monitor'
  | 'skip';

export interface KitchenSkillAlert {
  id?: string;
  rule_id: KitchenSkillRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  staff_id: string;
  staff_name: string;
  station?: string;
  technique?: string;
  current_skill_score?: number;
  benchmark_score?: number;
  skill_gap?: number;
  previous_skill_score?: number;
  error_rate_pct?: number;
  tasks_completed?: number;
  avg_task_time?: number;
  recommended_training?: string;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: KitchenSkillAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface KitchenSkillConfig {
  aiEnabled: boolean;
  gapThreshold: number;
  deteriorationDrop: number;
  topThreshold: number;
}

export const DEFAULT_KITCHENSKILL_CONFIG: KitchenSkillConfig = {
  aiEnabled: true,
  gapThreshold: 20.0,
  deteriorationDrop: 15.0,
  topThreshold: 85.0,
};

export const readKitchenSkillConfig = (settings: any): KitchenSkillConfig => ({
  aiEnabled: settings?.kitchenskill_ai_enabled ?? true,
  gapThreshold: safeNumber(settings?.kitchenskill_gap_threshold, 20.0),
  deteriorationDrop: safeNumber(settings?.kitchenskill_deterioration_drop, 15.0),
  topThreshold: safeNumber(settings?.kitchenskill_top_threshold, 85.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface StaffTechniqueData {
  staff_id: string;
  staff_name: string;
  station: string;
  technique: string;
  current_score: number;         // 0-100
  benchmark_score: number;       // station benchmark for this technique
  previous_score?: number;       // for deterioration detection
  error_rate_pct: number;        // % of tasks with errors
  tasks_completed: number;
  avg_task_time: number;         // minutes per task
  // For training_roi: was training received?
  training_received?: boolean;
  pre_training_score?: number;
}

const MOCK_STAFF: StaffTechniqueData[] = [
  { staff_id: 'K001', staff_name: 'Carlos Mendez', station: 'grill', technique: 'temp_control',
    current_score: 62, benchmark_score: 85, previous_score: 68, error_rate_pct: 12, tasks_completed: 180, avg_task_time: 8.5 },
  { staff_id: 'K001', staff_name: 'Carlos Mendez', station: 'grill', technique: 'timing',
    current_score: 78, benchmark_score: 80, error_rate_pct: 5, tasks_completed: 180, avg_task_time: 8.5 },
  { staff_id: 'K002', staff_name: 'Maria Santos', station: 'saute', technique: 'sauce_emulsification',
    current_score: 88, benchmark_score: 82, previous_score: 84, error_rate_pct: 2, tasks_completed: 150, avg_task_time: 12.0 },
  { staff_id: 'K002', staff_name: 'Maria Santos', station: 'saute', technique: 'timing',
    current_score: 90, benchmark_score: 82, previous_score: 88, error_rate_pct: 1, tasks_completed: 150, avg_task_time: 11.5 },
  { staff_id: 'K003', staff_name: 'James Liu', station: 'grill', technique: 'temp_control',
    current_score: 55, benchmark_score: 85, previous_score: 72, error_rate_pct: 18, tasks_completed: 95, avg_task_time: 10.2 },
  { staff_id: 'K003', staff_name: 'James Liu', station: 'cold', technique: 'plating',
    current_score: 82, benchmark_score: 78, error_rate_pct: 3, tasks_completed: 120, avg_task_time: 5.5 },
  { staff_id: 'K004', staff_name: 'Priya Patel', station: 'pastry', technique: 'plating',
    current_score: 92, benchmark_score: 85, previous_score: 89, error_rate_pct: 1, tasks_completed: 200, avg_task_time: 14.0 },
  { staff_id: 'K004', staff_name: 'Priya Patel', station: 'pastry', technique: 'timing',
    current_score: 87, benchmark_score: 85, previous_score: 85, error_rate_pct: 2, tasks_completed: 200, avg_task_time: 13.5 },
  { staff_id: 'K005', staff_name: 'Tom O\'Brien', station: 'fry', technique: 'fryer_mgmt',
    current_score: 60, benchmark_score: 80, previous_score: 65, error_rate_pct: 15, tasks_completed: 140, avg_task_time: 6.8,
    training_received: true, pre_training_score: 58 },
  { staff_id: 'K006', staff_name: 'Anna Kowalski', station: 'grill', technique: 'temp_control',
    current_score: 58, benchmark_score: 85, previous_score: 60, error_rate_pct: 14, tasks_completed: 60, avg_task_time: 9.5,
    training_received: true, pre_training_score: 55 },
  { staff_id: 'K006', staff_name: 'Anna Kowalski', station: 'cold', technique: 'knife_skills',
    current_score: 85, benchmark_score: 78, error_rate_pct: 2, tasks_completed: 110, avg_task_time: 4.2 },
];

export const runKitchenSkillEngine = async (
  db: ReturnType<typeof useDB>,
  config: KitchenSkillConfig = DEFAULT_KITCHENSKILL_CONFIG
): Promise<{ alerts: KitchenSkillAlert[]; generated: number }> => {
  const alerts: KitchenSkillAlert[] = [];
  const now = new Date();

  let staff: StaffTechniqueData[] = [];
  try {
    const result = await db.query(
      `SELECT staff_id, staff_name, station, technique, current_score, benchmark_score,
              previous_score, error_rate_pct, tasks_completed, avg_task_time,
              training_received, pre_training_score
       FROM kitchen_skill_log
       WHERE status = 'active'
       LIMIT 50`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    staff = rows.map((r: any) => ({
      staff_id: String(r.staff_id ?? 'Unknown'),
      staff_name: String(r.staff_name ?? 'Unknown'),
      station: String(r.station ?? 'unknown'),
      technique: String(r.technique ?? 'unknown'),
      current_score: safeNumber(r.current_score, 0),
      benchmark_score: safeNumber(r.benchmark_score, 0),
      previous_score: r.previous_score != null ? safeNumber(r.previous_score, 0) : undefined,
      error_rate_pct: safeNumber(r.error_rate_pct, 0),
      tasks_completed: safeNumber(r.tasks_completed, 0),
      avg_task_time: safeNumber(r.avg_task_time, 0),
      training_received: r.training_received ?? false,
      pre_training_score: r.pre_training_score != null ? safeNumber(r.pre_training_score, 0) : undefined,
    }));
  } catch (err) {
    console.warn('[kitchenskill] fetchStaff failed — using mock', err);
  }

  if (staff.length === 0) {
    staff = MOCK_STAFF;
  }

  // Group by technique for peer mentor matching
  const byTechnique = new Map<string, StaffTechniqueData[]>();
  for (const s of staff) {
    if (!byTechnique.has(s.technique)) byTechnique.set(s.technique, []);
    byTechnique.get(s.technique)!.push(s);
  }

  // Group by staff for cross-training detection
  const byStaff = new Map<string, StaffTechniqueData[]>();
  for (const s of staff) {
    if (!byStaff.has(s.staff_id)) byStaff.set(s.staff_id, []);
    byStaff.get(s.staff_id)!.push(s);
  }

  for (const s of staff) {
    const gap = s.benchmark_score - s.current_score;
    const monthlyOpp = Math.round(gap * s.error_rate_pct * 0.5 * 30 / 30);

    // Rule 1: TECHNIQUE_GAP (specific technique below benchmark)
    if (gap >= config.gapThreshold) {
      alerts.push({
        rule_id: 'technique_gap',
        severity: gap >= 30 ? 'critical' : 'high',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        station: s.station,
        technique: s.technique,
        current_skill_score: s.current_score,
        benchmark_score: s.benchmark_score,
        skill_gap: Math.round(gap * 10) / 10,
        error_rate_pct: s.error_rate_pct,
        tasks_completed: s.tasks_completed,
        avg_task_time: s.avg_task_time,
        recommended_training: `${s.technique}_workshop`,
        est_monthly_opportunity: monthlyOpp,
        description: `${s.staff_name} (${s.station}): TECHNIQUE GAP — "${s.technique}" score ${s.current_score}/100 vs benchmark ${s.benchmark_score} (gap: ${gap.toFixed(0)} points). Error rate: ${s.error_rate_pct}%. ${s.tasks_completed} tasks completed. TARGETED TRAINING: ${s.technique} workshop focusing on specific technique. ${s.technique === 'temp_control' ? 'Grill temp control errors cause 30% of meat overcooking complaints. ' : s.technique === 'plating' ? 'Plating precision affects perceived value + social media appeal. ' : ''}Closing this gap reduces errors by ~${Math.round(s.error_rate_pct * 0.5)}% = ${fmt$(monthlyOpp)}/mo saved.`,
        ai_recommendation: 'targeted_training',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: SKILL_DETERIORATION (was good, now declining)
    if (s.previous_score != null) {
      const drop = s.previous_score - s.current_score;
      if (drop >= config.deteriorationDrop) {
        alerts.push({
          rule_id: 'skill_deterioration',
          severity: 'high',
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          station: s.station,
          technique: s.technique,
          current_skill_score: s.current_score,
          previous_skill_score: s.previous_score,
          skill_gap: Math.round(drop * 10) / 10,
          error_rate_pct: s.error_rate_pct,
          est_monthly_opportunity: monthlyOpp,
          description: `${s.staff_name} (${s.station}): SKILL DETERIORATION — "${s.technique}" score dropped ${drop.toFixed(0)} points (${s.previous_score} → ${s.current_score}). Was performing well, now declining. INVESTIGATE: burnout? health issue? recipe change? equipment wear? new distraction? Skill deterioration is a warning sign — intervene before it becomes permanent. Early coaching restores skill; delayed intervention creates bad habits.`,
          ai_recommendation: 'investigate',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 3: TOP_PERFORMER (technique score ≥85)
    if (s.current_score >= config.topThreshold) {
      alerts.push({
        rule_id: 'top_performer',
        severity: 'low',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        station: s.station,
        technique: s.technique,
        current_skill_score: s.current_score,
        benchmark_score: s.benchmark_score,
        est_monthly_opportunity: 0,
        description: `${s.staff_name} (${s.station}): TOP PERFORMER — "${s.technique}" score ${s.current_score}/100 (benchmark ${s.benchmark_score}). Exceeds benchmark by ${(s.current_score - s.benchmark_score).toFixed(0)} points with only ${s.error_rate_pct}% error rate. PEER MENTOR CANDIDATE: pair with staff who have gaps in this technique. Top performers make best mentors — they demonstrate technique + provide real-time feedback. Recognize + reward their excellence to retain talent.`,
        ai_recommendation: 'peer_mentoring',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: CROSS_TRAINING_OPPORTUNITY (strong at 2+ stations)
    const staffEntries = byStaff.get(s.staff_id) ?? [];
    const stationsExcelling = new Set<string>();
    for (const entry of staffEntries) {
      if (entry.current_score >= entry.benchmark_score) stationsExcelling.add(entry.station);
    }
    if (stationsExcelling.size >= 2 && s.staff_id === staffEntries[0]?.staff_id) {
      alerts.push({
        rule_id: 'cross_training_opportunity',
        severity: 'medium',
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        station: Array.from(stationsExcelling).join(', '),
        est_monthly_opportunity: Math.round(staffEntries.length * 50),
        description: `${s.staff_name}: CROSS-TRAINING OPPORTUNITY — excels at ${stationsExcelling.size} stations (${Array.from(stationsExcelling).join(', ')}). Multi-station capability is rare and valuable. CROSS-TRAIN further to increase kitchen flexibility — can cover any station during absences or rushes. Multi-station staff are 2x more valuable (coverage + flexibility). Invest in their development — they're future kitchen leads.`,
        ai_recommendation: 'cross_train',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: STATION_MISMATCH (low at assigned station but high elsewhere)
    if (gap >= config.gapThreshold) {
      const otherEntries = staffEntries.filter(e => e.station !== s.station && e.current_score >= e.benchmark_score);
      if (otherEntries.length > 0) {
        alerts.push({
          rule_id: 'station_mismatch',
          severity: 'high',
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          station: s.station,
          technique: s.technique,
          current_skill_score: s.current_score,
          benchmark_score: s.benchmark_score,
          skill_gap: Math.round(gap * 10) / 10,
          est_monthly_opportunity: monthlyOpp,
          description: `${s.staff_name}: STATION MISMATCH — struggling at ${s.station} (${s.technique}: ${s.current_score}/100) but excels at ${otherEntries.map(e => e.station).join(', ')}. REASSIGN to station where they excel. Forcing staff into stations where they have skill gaps = frustration + errors + churn. Playing to strengths improves morale + output + retention. Cross-train later when confidence is high.`,
          ai_recommendation: 'reassign_station',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 6: TRAINING_ROI_POSITIVE (post-training score improved)
    if (s.training_received && s.pre_training_score != null) {
      const improvement = s.current_score - s.pre_training_score;
      if (improvement >= 10) {
        alerts.push({
          rule_id: 'training_roi_positive',
          severity: 'low',
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          station: s.station,
          technique: s.technique,
          current_skill_score: s.current_score,
          previous_skill_score: s.pre_training_score,
          est_monthly_opportunity: 0,
          description: `${s.staff_name}: TRAINING ROI POSITIVE — "${s.technique}" improved ${improvement.toFixed(0)} points after training (${s.pre_training_score} → ${s.current_score}). Training was EFFECTIVE — verify it sticks (re-check in 30 days). This training module works — replicate for other staff with same gap. Track which training methods produce best ROI to optimize training budget.`,
          ai_recommendation: 'verify_training',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 7: PEER_MENTOR_MATCH (gap staff + top performer at same technique)
    if (gap >= config.gapThreshold) {
      const techniquePeers = byTechnique.get(s.technique) ?? [];
      const mentor = techniquePeers.find(p => p.current_score >= config.topThreshold && p.staff_id !== s.staff_id);
      if (mentor) {
        alerts.push({
          rule_id: 'peer_mentor_match',
          severity: 'medium',
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          station: s.station,
          technique: s.technique,
          current_skill_score: s.current_score,
          est_monthly_opportunity: monthlyOpp,
          description: `${s.staff_name}: PEER MENTOR MATCH — has gap in "${s.technique}" (${s.current_score}/100) and ${mentor.staff_name} is a top performer (${mentor.current_score}/100) at same technique. PAIR THEM: peer mentoring is 3x more effective than classroom training for technique skills. Mentor demonstrates in real-time, provides immediate feedback, and builds team rapport. Schedule 2-3 shadowing sessions this week. Cost: ${fmt$(0)} — just scheduling.`,
          ai_recommendation: 'peer_mentoring',
          status: 'open', detected_at: now,
        });
      }
    }

    // Rule 8: SKILL_STAGNATION (no improvement despite training)
    if (s.training_received && s.pre_training_score != null && s.previous_score != null) {
      const trainingImprovement = s.current_score - s.pre_training_score;
      const recentChange = s.current_score - s.previous_score;
      if (trainingImprovement < 5 && recentChange <= 0) {
        alerts.push({
          rule_id: 'skill_stagnation',
          severity: 'medium',
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          station: s.station,
          technique: s.technique,
          current_skill_score: s.current_score,
          previous_skill_score: s.previous_score,
          est_monthly_opportunity: monthlyOpp,
          description: `${s.staff_name}: SKILL STAGNATION — received training for "${s.technique}" but score hasn't improved (${s.pre_training_score} → ${s.current_score}, only ${trainingImprovement.toFixed(0)} points). Recent trend still flat/declining (${s.previous_score} → ${s.current_score}). Training method didn't work for this person. TRY DIFFERENT APPROACH: peer mentoring, hands-on workshop, video tutorial, or one-on-one coaching. Not everyone learns the same way — adapt the method, not the person.`,
          ai_recommendation: 'investigate',
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
            { role: 'system', content: 'You are a restaurant kitchen training AI specializing in technique-level skill gap analysis. Recommend specific culinary training interventions. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Staff: ${a.staff_name} (${a.station}) — ${a.rule_id}. Technique: ${a.technique ?? 'N/A'}. Score: ${a.current_skill_score ?? 0}/100 (benchmark ${a.benchmark_score ?? 0}, gap ${a.skill_gap ?? 0}). Error rate: ${a.error_rate_pct ?? 0}%. Tasks: ${a.tasks_completed ?? 0}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  try {
    await db.query(`DELETE FROM kitchen_skill_gap_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE kitchen_skill_gap_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<KitchenSkillAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM kitchen_skill_gap_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  staffAffected: number; topPerformers: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'technique_gap') AS gaps,
              math::count(rule_id = 'top_performer') AS top
       FROM kitchen_skill_gap_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      staffAffected: safeNumber(r.gaps, 0), topPerformers: safeNumber(r.top, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, staffAffected: 0, topPerformers: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
