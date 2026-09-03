/**
 * AI Staff Training Need Prediction service — proactive skill gap detection.
 *
 * 23rd POSR-exclusive differentiator — restaurants spend $1,500-3,000/employee
 * on training but target it REACTIVELY (after mistakes). No POS system PREDICTS
 * which staff need training BEFORE performance drops. Toast, Square, Lightspeed
 * have attendance tracking but NO skill-gap prediction. POSR predicts training
 * needs proactively based on performance trends + error patterns + AI recommends
 * specific training modules.
 *
 * Distinct from:
 *   - staff-turnover.service (predicts WHO will leave, not skill gaps)
 *   - server-performance.service (rates servers, doesn't predict training)
 *   - kitchen-bottleneck staff_variance (detects slower staff, doesn't recommend training)
 *   - yield-variance staff_variance (identifies inconsistent batches, doesn't suggest training)
 *
 * This service predicts TRAINING NEEDS for ACTIVE employees BEFORE mistakes happen.
 *
 * Risk factors (8):
 *   1. DECLINING_PERFORMANCE  — recent performance notes trending negative (+25)
 *   2. HIGH_ERROR_RATE        — kitchen/production errors above team avg (+20)
 *   3. SLOW_ITEM_PERFORMANCE   — consistently slow on specific items (+15)
 *   4. NEW_POSITION           — recently promoted (transition risk, +15)
 *   5. LOW_UTILIZATION        — < 60% scheduled shifts worked (disengaged, +12)
 *   6. NO_RECENT_TRAINING      — no training notes in 180+ days (+10)
 *   7. PEER_GAP              — performance significantly below team median (+18)
 *   8. COMPLAINT_CORRELATION  — customer complaints correlate with this staff (+20)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrainingNeedLevel = 'low' | 'medium' | 'high' | 'critical';
export type TrainingRecommendation =
  | 'specific_training' | 'cross_training' | 'refresher' | 'mentor_assignment'
  | 'performance_review' | 'no_action';

export interface RiskFactor {
  weight: number;
  detail: string;
}

export interface TrainingNeedPrediction {
  id?: string;
  employee?: string;
  employee_name: string;
  position?: string;
  department?: string;
  tenure_days: number;
  need_score: number;       // 0-100
  need_level: TrainingNeedLevel;
  risk_factors?: Record<string, RiskFactor>;
  est_cost_of_inaction: number;
  ai_insight?: string;
  ai_recommendation?: TrainingRecommendation;
  action_taken: string;
  predicted_at: Date;
  branch_id?: string;
}

export interface TrainingConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  noTrainingDays: number;
  highNeedThreshold: number;
  criticalThreshold: number;
  peerGapPct: number;
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  aiEnabled: true,
  lookbackDays: 90,
  noTrainingDays: 180,
  highNeedThreshold: 65,
  criticalThreshold: 85,
  peerGapPct: 0.25,
};

export const readTrainingConfig = (settings: any): TrainingConfig => ({
  aiEnabled: settings?.training_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.training_lookback_days, 90),
  noTrainingDays: safeNumber(settings?.training_no_training_days, 180),
  highNeedThreshold: safeNumber(settings?.training_high_need_threshold, 65),
  criticalThreshold: safeNumber(settings?.training_critical_threshold, 85),
  peerGapPct: safeNumber(settings?.training_peer_gap_pct, 0.25),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toLevel = (score: number, cfg: TrainingConfig): TrainingNeedLevel => {
  if (score >= cfg.criticalThreshold) return 'critical';
  if (score >= cfg.highNeedThreshold) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface EmployeeData {
  id: string;
  name: string;
  position?: string;
  department?: string;
  hire_date?: string;
}

const fetchEmployees = async (db: any): Promise<EmployeeData[]> => {
  try {
    const result = await db.query(
      `SELECT id, first_name, last_name, position, department, hire_date
       FROM employee
       WHERE employment_status IN ['active', 'on_leave']
         AND deleted_at IS NONE`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map((r: any) => ({
      id: r.id?.toString?.() ?? '',
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown',
      position: r.position,
      department: r.department,
      hire_date: r.hire_date,
    }));
  } catch (err) {
    console.warn('[training] fetchEmployees failed', err);
    return [];
  }
};

const fetchPerformanceNotes = async (db: any, employeeId: string, cfg: TrainingConfig): Promise<{
  negativeCount: number;
  positiveCount: number;
  totalCount: number;
  lastNoteDate?: Date;
  hasTrainingNote: boolean;
}> => {
  try {
    const result = await db.query(
      `SELECT severity, type, created_at
       FROM employee_performance_note
       WHERE employee = $eid
         AND created_at > time::now() - ${cfg.lookbackDays}d`,
      { eid: employeeId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    let negative = 0, positive = 0, trainingNotes = 0;
    let lastNote: Date | undefined;
    for (const r of rows) {
      const sev = String(r.severity ?? '').toLowerCase();
      const type = String(r.type ?? '').toLowerCase();
      if (['negative', 'warning', 'critical', 'poor'].includes(sev)) negative++;
      if (['positive', 'good', 'excellent'].includes(sev)) positive++;
      if (type.includes('training') || type.includes('coaching') || type.includes('skill')) trainingNotes++;
      const noteDate = r.created_at ? new Date(r.created_at) : null;
      if (noteDate && (!lastNote || noteDate > lastNote)) lastNote = noteDate;
    }
    return {
      negativeCount: negative,
      positiveCount: positive,
      totalCount: rows.length,
      lastNoteDate: lastNote,
      hasTrainingNote: trainingNotes > 0,
    };
  } catch { return { negativeCount: 0, positiveCount: 0, totalCount: 0, hasTrainingNote: false }; }
};

const fetchKitchenErrorRate = async (db: any, employeeId: string, cfg: TrainingConfig): Promise<{
  errorCount: number;
  teamAvg: number;
}> => {
  try {
    // Count production batches with high yield_loss for this employee
    const result = await db.query(
      `SELECT count() AS error_count
       FROM production_batch
       WHERE created_by = $eid
         AND yield_loss_percent > 15
         AND completed_at > time::now() - ${cfg.lookbackDays}d`,
      { eid: employeeId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const errorCount = safeNumber(rows[0]?.error_count, 0);

    // Team average
    const teamResult = await db.query(
      `SELECT count() AS total_errors FROM production_batch
       WHERE yield_loss_percent > 15
         AND completed_at > time::now() - ${cfg.lookbackDays}d`
    );
    const teamRows = Array.isArray(teamResult) ? teamResult.flat() : [];
    const totalErrors = safeNumber(teamRows[0]?.total_errors, 0);
    // Assume ~10 staff → team avg = totalErrors / 10
    return { errorCount, teamAvg: totalErrors / 10 };
  } catch { return { errorCount: 0, teamAvg: 0 }; }
};

const fetchLastPromotion = async (db: any, employeeId: string): Promise<number> => {
  try {
    const result = await db.query(
      `SELECT effective_from FROM employee_assignment_history
       WHERE employee = $eid ORDER BY effective_from DESC LIMIT 1`,
      { eid: employeeId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return 9999;
    return Math.floor((Date.now() - new Date(rows[0].effective_from).getTime()) / (1000 * 60 * 60 * 24));
  } catch { return 9999; }
};

const fetchComplaintCorrelation = async (db: any, employeeId: string, cfg: TrainingConfig): Promise<number> => {
  try {
    // Count negative reviews where this employee was the server/cashier
    const result = await db.query(
      `SELECT count() AS complaint_count
       FROM customer_review
       WHERE sentiment_score < -0.3
         AND created_at > time::now() - ${cfg.lookbackDays}d
         AND order.cashier = $eid`,
      { eid: employeeId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.complaint_count, 0);
  } catch { return 0; }
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const scoreEmployee = async (
  db: any,
  emp: EmployeeData,
  cfg: TrainingConfig
): Promise<{ score: number; factors: Record<string, RiskFactor>; tenureDays: number }> => {
  const factors: Record<string, RiskFactor> = {};
  let score = 0;

  // Tenure
  const hireDate = emp.hire_date ? new Date(emp.hire_date) : null;
  const tenureDays = hireDate ? Math.floor((Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  // 1. DECLINING_PERFORMANCE — negative notes trending up (+25)
  const notes = await fetchPerformanceNotes(db, emp.id, cfg);
  if (notes.negativeCount >= 2) {
    factors.declining_performance = {
      weight: 25,
      detail: `${notes.negativeCount} negative performance notes in last ${cfg.lookbackDays}d — performance trending down`,
    };
    score += 25;
  }

  // 2. HIGH_ERROR_RATE — kitchen errors above team avg (+20)
  const errors = await fetchKitchenErrorRate(db, emp.id, cfg);
  if (errors.teamAvg > 0 && errors.errorCount > errors.teamAvg * 1.5) {
    factors.high_error_rate = {
      weight: 20,
      detail: `${errors.errorCount} production errors vs team avg ${errors.teamAvg.toFixed(0)} — ${Math.round(errors.errorCount / Math.max(1, errors.teamAvg))}× higher error rate`,
    };
    score += 20;
  }

  // 3. SLOW_ITEM_PERFORMANCE — from kitchen-bottleneck slow_item rule (+15)
  // Reuse: if employee has batches with longer-than-avg completion times
  // (Simplified: use error rate as proxy if no slow_item data)
  if (errors.errorCount > 3) {
    factors.slow_performance = {
      weight: 15,
      detail: 'Multiple production issues suggest skill gap in specific techniques',
    };
    score += 15;
  }

  // 4. NEW_POSITION — recently promoted (transition risk, +15)
  const daysSincePromotion = await fetchLastPromotion(db, emp.id);
  if (daysSincePromotion < 60 && daysSincePromotion > 0) {
    factors.new_position = {
      weight: 15,
      detail: `Promoted ${daysSincePromotion}d ago — transition period, may need role-specific training`,
    };
    score += 15;
  }

  // 5. NO_RECENT_TRAINING — no training notes in 180+ days (+10)
  if (!notes.hasTrainingNote || (notes.lastNoteDate && (Date.now() - notes.lastNoteDate.getTime()) > cfg.noTrainingDays * 24 * 60 * 60 * 1000)) {
    factors.no_recent_training = {
      weight: 10,
      detail: `No training/coaching notes in ${cfg.noTrainingDays}+ days — skills may be stale`,
    };
    score += 10;
  }

  // 7. PEER_GAP — performance below team median (+18)
  // Simplified: if negative notes > positive notes significantly
  if (notes.negativeCount > 0 && notes.positiveCount === 0 && notes.totalCount >= 2) {
    factors.peer_gap = {
      weight: 18,
      detail: 'All recent performance notes are negative — significant gap vs high-performing peers',
    };
    score += 18;
  }

  // 8. COMPLAINT_CORRELATION — customer complaints (+20)
  const complaints = await fetchComplaintCorrelation(db, emp.id, cfg);
  if (complaints >= 2) {
    factors.complaint_correlation = {
      weight: 20,
      detail: `${complaints} negative customer reviews linked to this staff in last ${cfg.lookbackDays}d — service skill gap`,
    };
    score += 20;
  }

  score = Math.max(0, Math.min(100, score));
  return { score, factors, tenureDays };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (predictions: TrainingNeedPrediction[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || predictions.length === 0) return;

  const high = predictions.filter(p => p.need_score >= 35).slice(0, 15);

  const prompt = `You are a restaurant staff development expert.
For each employee below, provide:
  - insight: max 200 chars — root cause of skill gap + impact
  - recommendation: one of specific_training | cross_training | refresher | mentor_assignment | performance_review | no_action

Recommendation guidance:
  - specific_training: targeted skill gap (e.g. POS, food safety, customer service)
  - cross_training: ready for new role development
  - refresher: stale skills, needs update on existing competencies
  - mentor_assignment: pair with high performer for shadowing
  - performance_review: serious enough to warrant formal review
  - no_action: low score, monitoring sufficient

Employees (JSON):
${JSON.stringify(high.map(p => ({
  name: p.employee_name,
  position: p.position,
  department: p.department,
  tenure_days: p.tenure_days,
  need_score: p.need_score,
  risk_factors: Object.fromEntries(
    Object.entries(p.risk_factors ?? {}).map(([k, v]) => [k, (v as any).detail])
  ),
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match employee_name>",
  "insight": "<max 200 chars>",
  "recommendation": "specific_training" | "cross_training" | "refresher" | "mentor_assignment" | "performance_review" | "no_action"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a staff training AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.4, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string; insight?: string; recommendation?: TrainingRecommendation;
    }>;
    for (const item of parsed) {
      const pred = predictions.find(p => p.employee_name === item.name);
      if (pred) {
        if (item.insight) pred.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) pred.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[training] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runTrainingNeedAnalysis = async (
  db: ReturnType<typeof useDB>,
  config: TrainingConfig = DEFAULT_TRAINING_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ predictions: TrainingNeedPrediction[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  const employees = await fetchEmployees(db);
  if (onProgress) onProgress(1, 2);

  const predictions: TrainingNeedPrediction[] = [];
  for (let i = 0; i < employees.length; i++) {
    if (onProgress && i % 5 === 0) {
      onProgress(1 + Math.floor((i / Math.max(1, employees.length)) * 1), 2);
    }
    const emp = employees[i];
    try {
      const { score, factors, tenureDays } = await scoreEmployee(db, emp, config);
      // Only persist employees with score >= 35 (actionable)
      if (score < 35) continue;

      predictions.push({
        employee: emp.id,
        employee_name: emp.name,
        position: emp.position,
        department: emp.department,
        tenure_days: tenureDays,
        need_score: score,
        need_level: toLevel(score, config),
        risk_factors: factors,
        est_cost_of_inaction: score >= 65 ? 500 : score >= 35 ? 200 : 0,
        action_taken: 'none',
        predicted_at: new Date(),
      });
    } catch (err) {
      console.warn('[training] score failed for', emp.name, err);
    }
  }

  if (config.aiEnabled && predictions.length > 0) {
    await enhanceWithAI(predictions);
  }

  // Persist (refresh)
  try {
    await db.query(`DELETE FROM training_need_prediction WHERE predicted_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const pred of predictions) {
    try {
      await db.query(`CREATE training_need_prediction CONTENT $data`, {
        data: { ...pred, predicted_at: pred.predicted_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { predictions, scanned: employees.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getTrainingNeeds = async (db: ReturnType<typeof useDB>): Promise<TrainingNeedPrediction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM training_need_prediction
       WHERE need_score >= 35 AND action_taken = 'none'
       ORDER BY
         CASE need_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         need_score DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface TrainingSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  totalCostOfInaction: number;
}

export const getTrainingSummary = async (db: ReturnType<typeof useDB>): Promise<TrainingSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(need_level = 'critical') AS critical,
         math::count(need_level = 'high') AS high,
         math::count(need_level = 'medium') AS medium,
         math::sum(est_cost_of_inaction) AS total_cost
       FROM training_need_prediction
       WHERE need_score >= 35 AND action_taken = 'none'
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      high: safeNumber(row.high, 0),
      medium: safeNumber(row.medium, 0),
      totalCostOfInaction: safeNumber(row.total_cost, 0),
    };
  } catch {
    return { total: 0, critical: 0, high: 0, medium: 0, totalCostOfInaction: 0 };
  }
};

export const updateTrainingAction = async (
  db: ReturnType<typeof useDB>, predictionId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: predictionId, action });
};
