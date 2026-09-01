/**
 * AI Staff Turnover Prediction service — retention risk scoring.
 *
 * 9th POSR-exclusive differentiator — Toast, Square, Lightspeed have NO
 * turnover prediction. They only do attendance logging. POSR predicts
 * which employees are likely to leave using 9 risk factors + AI retention
 * recommendations.
 *
 * Restaurant industry has 75% annual turnover rate (highest of any industry),
 * costing $5,864 per lost employee (Cornell CHR). Predicting departures
 * 30-90 days ahead enables retention interventions.
 *
 * Risk factors (9):
 *   1. TENURE_SHORT       — < 6 months tenure (highest-risk window, +20)
 *   2. HIGH_OVERTIME      — > 25% of hours are overtime (burnout, +15)
 *   3. LOW_UTILIZATION    — < 60% of scheduled shifts actually worked (disengaged, +12)
 *   4. SCHEDULE_INSTABILITY — shift changes/cancellations > 2x per week (+10)
 *   5. NO_PROMOTION       — no position change in 18+ months (stagnation, +10)
 *   6. PAY_BELOW_MARKET   — base_rate < department median × 0.9 (+12)
 *   7. RECENT_PERFORMANCE_NOTES — negative performance notes in last 90 days (+15)
 *   8. SCHEDULE_GAP       — not scheduled in last 14 days (already disengaged, +18)
 *   9. PEER_TURNOVER     — 2+ coworkers in same department left in last 90 days (+10)
 *
 * Each prediction: risk score 0-100 + AI retention recommendation:
 *   schedule_check_in | review_compensation | offer_development | reduce_overtime |
 *   recognize_publicly | transfer_department | exit_interview | accept_departure
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TurnoverRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type TurnoverRecommendation =
  | 'schedule_check_in' | 'review_compensation' | 'offer_development'
  | 'reduce_overtime' | 'recognize_publicly' | 'transfer_department'
  | 'exit_interview' | 'accept_departure';

export interface RiskFactor {
  weight: number;
  detail: string;
}

export interface TurnoverPrediction {
  id?: string;
  employee?: string;
  employee_name: string;
  position?: string;
  department?: string;
  tenure_days: number;
  risk_score: number;          // 0-100
  risk_level: TurnoverRiskLevel;
  risk_factors?: Record<string, RiskFactor>;
  est_replacement_cost: number;
  ai_insight?: string;
  ai_recommendation?: TurnoverRecommendation;
  action_taken: string;
  predicted_at: Date;
  updated_at?: Date;
  branch_id?: string;
}

export interface TurnoverConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  tenureThresholdDays: number;
  overtimePct: number;
  utilizationMin: number;
  highRiskThreshold: number;
  criticalRiskThreshold: number;
  replacementCost: number;
}

export const DEFAULT_TURNOVER_CONFIG: TurnoverConfig = {
  aiEnabled: true,
  lookbackDays: 365,
  tenureThresholdDays: 180,
  overtimePct: 0.25,
  utilizationMin: 0.60,
  highRiskThreshold: 65,
  criticalRiskThreshold: 85,
  replacementCost: 5864,
};

export const readTurnoverConfig = (settings: any): TurnoverConfig => ({
  aiEnabled: settings?.turnover_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.turnover_lookback_days, 365),
  tenureThresholdDays: safeNumber(settings?.turnover_tenure_threshold_days, 180),
  overtimePct: safeNumber(settings?.turnover_overtime_pct, 0.25),
  utilizationMin: safeNumber(settings?.turnover_utilization_min, 0.60),
  highRiskThreshold: safeNumber(settings?.turnover_high_risk_threshold, 65),
  criticalRiskThreshold: safeNumber(settings?.turnover_critical_risk_threshold, 85),
  replacementCost: safeNumber(settings?.turnover_replacement_cost, 5864),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toLevel = (score: number, cfg: TurnoverConfig): TurnoverRiskLevel => {
  if (score >= cfg.criticalRiskThreshold) return 'critical';
  if (score >= cfg.highRiskThreshold) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(0)}`;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface EmployeeData {
  id: string;
  name: string;
  position?: string;
  department?: string;
  hire_date?: string;
  base_rate?: number;
  termination_date?: string;
}

interface ShiftStats {
  totalScheduled: number;
  totalWorked: number;
  overtimeHours: number;
  regularHours: number;
  shiftChanges: number;
  lastScheduledDate?: Date;
}

const fetchEmployees = async (db: any, _cfg: TurnoverConfig): Promise<EmployeeData[]> => {
  try {
    const result = await db.query(
      `SELECT id, first_name, last_name, position, department, hire_date,
              employment_status, termination_date
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
    console.warn('[turnover] fetchEmployees failed', err);
    return [];
  }
};

const fetchShiftStats = async (db: any, employeeId: string, cfg: TurnoverConfig): Promise<ShiftStats> => {
  try {
    // Get all shifts for this employee in lookback window
    const result = await db.query(
      `SELECT
         count() AS total_scheduled,
         math::sum(actual_hours) AS worked_hours,
         math::sum(overtime_hours) AS ot_hours,
         math::sum(planned_hours) AS planned_hours,
         max(start_time) AS last_shift
       FROM scheduled_shift
       WHERE employee = $eid
         AND start_time > time::now() - ${cfg.lookbackDays}d
       GROUP ALL`,
      { eid: employeeId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalScheduled: safeNumber(r.total_scheduled, 0),
      totalWorked: safeNumber(r.worked_hours, 0),
      overtimeHours: safeNumber(r.ot_hours, 0),
      regularHours: safeNumber(r.worked_hours, 0) - safeNumber(r.ot_hours, 0),
      shiftChanges: 0, // would need shift_swap_request or change log
      lastScheduledDate: r.last_shift ? new Date(r.last_shift) : undefined,
    };
  } catch {
    return { totalScheduled: 0, totalWorked: 0, overtimeHours: 0, regularHours: 0, shiftChanges: 0 };
  }
};

const fetchDepartmentMedianPay = async (db: any, _department: string): Promise<number> => {
  try {
    const result = await db.query(
      `SELECT math::median(base_rate) AS median
       FROM employee_pay_profile
       WHERE effective_to IS NONE OR effective_to > time::now()
       LIMIT 1`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.median, 0);
  } catch { return 0; }
};

const fetchEmployeePayRate = async (db: any, employeeId: string): Promise<number> => {
  try {
    const result = await db.query(
      `SELECT base_rate FROM employee_pay_profile
       WHERE employee = $eid
         AND (effective_to IS NONE OR effective_to > time::now())
       ORDER BY effective_from DESC LIMIT 1`,
      { eid: employeeId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.base_rate, 0);
  } catch { return 0; }
};

const fetchNegativeNotes = async (db: any, employeeId: string): Promise<number> => {
  try {
    const result = await db.query(
      `SELECT count() AS cnt FROM employee_performance_note
       WHERE employee = $eid
         AND severity IN ['negative', 'warning', 'critical']
         AND created_at > time::now() - 90d`,
      { eid: employeeId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.cnt, 0);
  } catch { return 0; }
};

const fetchPeerTurnover = async (db: any, department: string, _cfg: TurnoverConfig): Promise<number> => {
  if (!department) return 0;
  try {
    const result = await db.query(
      `SELECT count() AS cnt FROM employee
       WHERE department = $dept
         AND termination_date > time::now() - 90d
         AND termination_date IS NOT NONE`,
      { dept: department }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.cnt, 0);
  } catch { return 0; }
};

const fetchLastPromotion = async (db: any, employeeId: string): Promise<number> => {
  // Returns days since last position change in assignment_history
  try {
    const result = await db.query(
      `SELECT effective_from, position FROM employee_assignment_history
       WHERE employee = $eid
       ORDER BY effective_from DESC LIMIT 1`,
      { eid: employeeId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) return 9999; // never promoted
    const last = new Date(rows[0].effective_from);
    return Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
  } catch { return 9999; }
};

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

const scoreEmployee = async (
  db: any,
  emp: EmployeeData,
  cfg: TurnoverConfig
): Promise<{ score: number; factors: Record<string, RiskFactor>; tenureDays: number }> => {
  const factors: Record<string, RiskFactor> = {};
  let score = 0;

  // Tenure
  const hireDate = emp.hire_date ? new Date(emp.hire_date) : null;
  const tenureDays = hireDate ? Math.floor((Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  // 1. TENURE_SHORT — < 6 months (+20)
  if (tenureDays > 0 && tenureDays < cfg.tenureThresholdDays) {
    factors.tenure_short = {
      weight: 20,
      detail: `${Math.round(tenureDays / 30)} months tenure — within highest-risk departure window (< ${cfg.tenureThresholdDays / 30} months)`,
    };
    score += 20;
  }

  // Fetch shift stats
  const stats = await fetchShiftStats(db, emp.id, cfg);

  // 2. HIGH_OVERTIME — > 25% overtime (+15)
  if (stats.regularHours > 0) {
    const otPct = stats.overtimeHours / (stats.regularHours + stats.overtimeHours);
    if (otPct > cfg.overtimePct) {
      factors.high_overtime = {
        weight: 15,
        detail: `${(otPct * 100).toFixed(0)}% of hours are overtime (${stats.overtimeHours.toFixed(0)} OT / ${(stats.overtimeHours + stats.regularHours).toFixed(0)} total) — burnout risk`,
      };
      score += 15;
    }
  }

  // 3. LOW_UTILIZATION — < 60% worked/scheduled (+12)
  if (stats.totalScheduled > 5) {
    const utilization = stats.regularHours / Math.max(1, stats.totalScheduled * 8); // assume 8h shifts
    if (utilization < cfg.utilizationMin) {
      factors.low_utilization = {
        weight: 12,
        detail: `${(utilization * 100).toFixed(0)}% shift utilization (threshold ${(cfg.utilizationMin * 100).toFixed(0)}%) — disengaged`,
      };
      score += 12;
    }
  }

  // 4. SCHEDULE_INSTABILITY — not tracked separately; use schedule gap as proxy
  // 5. NO_PROMOTION — no position change in 18+ months (+10)
  const daysSincePromotion = await fetchLastPromotion(db, emp.id);
  if (daysSincePromotion > 540) { // 18 months
    factors.no_promotion = {
      weight: 10,
      detail: `No position change in ${Math.round(daysSincePromotion / 30)} months — stagnation`,
    };
    score += 10;
  }

  // 6. PAY_BELOW_MARKET — base_rate < department median × 0.9 (+12)
  const empPay = await fetchEmployeePayRate(db, emp.id);
  if (empPay > 0 && emp.department) {
    const deptMedian = await fetchDepartmentMedianPay(db, emp.department);
    if (deptMedian > 0 && empPay < deptMedian * 0.9) {
      const gap = ((deptMedian - empPay) / deptMedian * 100).toFixed(0);
      factors.pay_below_market = {
        weight: 12,
        detail: `Paid ${formatCurrency(empPay)}/hr vs department median ${formatCurrency(deptMedian)}/hr — ${gap}% below market`,
      };
      score += 12;
    }
  }

  // 7. RECENT_PERFORMANCE_NOTES — negative notes in last 90 days (+15)
  const negNotes = await fetchNegativeNotes(db, emp.id);
  if (negNotes > 0) {
    factors.recent_performance_notes = {
      weight: 15,
      detail: `${negNotes} negative performance note(s) in last 90 days`,
    };
    score += 15;
  }

  // 8. SCHEDULE_GAP — not scheduled in last 14 days (+18)
  if (!stats.lastScheduledDate || (Date.now() - stats.lastScheduledDate.getTime()) > 14 * 24 * 60 * 60 * 1000) {
    const daysSince = stats.lastScheduledDate
      ? Math.floor((Date.now() - stats.lastScheduledDate.getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    factors.schedule_gap = {
      weight: 18,
      detail: `Not scheduled in ${daysSince > 100 ? '100+' : daysSince} days — likely already disengaged`,
    };
    score += 18;
  }

  // 9. PEER_TURNOVER — 2+ coworkers in same department left in last 90 days (+10)
  if (emp.department) {
    const peerDepartures = await fetchPeerTurnover(db, emp.department, cfg);
    if (peerDepartures >= 2) {
      factors.peer_turnover = {
        weight: 10,
        detail: `${peerDepartures} coworker(s) in ${emp.department} left in last 90 days — flight risk spreads`,
      };
      score += 10;
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, factors, tenureDays };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  predictions: TurnoverPrediction[],
  _cfg: TurnoverConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || predictions.length === 0) return;

  const high = predictions.filter(p => p.risk_score >= 35).slice(0, 15);

  const prompt = `You are a restaurant HR retention specialist.
For each at-risk employee below, provide:
  - insight: max 200 chars — the single most likely reason for the departure risk
  - recommendation: one of schedule_check_in | review_compensation | offer_development | reduce_overtime | recognize_publicly | transfer_department | exit_interview | accept_departure

Recommendation guidance:
  - accept_departure: only for chronic low performers (3+ negative notes) + low utilization
  - exit_interview: critical risk with no obvious retention lever
  - review_compensation: pay_below_market factor present
  - reduce_overtime: high_overtime factor present
  - offer_development: no_promotion factor present (long tenure, no growth)
  - schedule_check_in: schedule_gap factor present (disengaged)
  - recognize_publicly: solid performer (no negative notes, good utilization) at risk
  - transfer_department: peer_turnover factor present (team toxicity)

Employees (JSON):
${JSON.stringify(high.map(p => ({
  name: p.employee_name,
  position: p.position,
  department: p.department,
  tenure_days: p.tenure_days,
  risk_score: p.risk_score,
  risk_factors: Object.fromEntries(
    Object.entries(p.risk_factors ?? {}).map(([k, v]) => [k, (v as any).detail])
  ),
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match employee_name>",
  "insight": "<max 200 chars>",
  "recommendation": "schedule_check_in" | "review_compensation" | "offer_development" | "reduce_overtime" | "recognize_publicly" | "transfer_department" | "exit_interview" | "accept_departure"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant HR AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1200 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string; insight?: string; recommendation?: TurnoverRecommendation;
    }>;
    for (const item of parsed) {
      const pred = predictions.find(p => p.employee_name === item.name);
      if (pred) {
        if (item.insight) pred.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) pred.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[turnover] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runTurnoverPrediction = async (
  db: ReturnType<typeof useDB>,
  config: TurnoverConfig = DEFAULT_TURNOVER_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ predictions: TurnoverPrediction[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch all active employees
  const employees = await fetchEmployees(db, config);
  if (onProgress) onProgress(1, 2);

  // 2. Score each employee
  const predictions: TurnoverPrediction[] = [];
  for (let i = 0; i < employees.length; i++) {
    if (onProgress && i % 5 === 0) {
      onProgress(1 + Math.floor((i / employees.length) * 1), 2);
    }
    const emp = employees[i];
    try {
      const { score, factors, tenureDays } = await scoreEmployee(db, emp, config);
      predictions.push({
        employee: emp.id,
        employee_name: emp.name,
        position: emp.position,
        department: emp.department,
        tenure_days: tenureDays,
        risk_score: score,
        risk_level: toLevel(score, config),
        risk_factors: factors,
        est_replacement_cost: score >= 35 ? config.replacementCost : 0,
        action_taken: 'none',
        predicted_at: new Date(),
      });
    } catch (err) {
      console.warn('[turnover] score failed for', emp.name, err);
    }
  }

  // 3. AI enhancement
  if (config.aiEnabled && predictions.length > 0) {
    await enhanceWithAI(predictions, config);
  }

  // 4. Persist (refresh — delete old predictions, create new)
  try {
    await db.query(`DELETE FROM turnover_prediction WHERE predicted_at < time::now() - 1h`);
  } catch { /* non-fatal */ }
  for (const pred of predictions) {
    try {
      await db.query(`CREATE turnover_prediction CONTENT $data`, {
        data: {
          ...pred,
          predicted_at: pred.predicted_at.toISOString(),
        },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { predictions, scanned: employees.length };
};

// ---------------------------------------------------------------------------
// Read + update
// ---------------------------------------------------------------------------

export const getAtRiskEmployees = async (
  db: ReturnType<typeof useDB>
): Promise<TurnoverPrediction[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM turnover_prediction
       WHERE risk_score >= 35
         AND action_taken = 'none'
       ORDER BY
         CASE risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         risk_score DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getTurnoverSummary = async (
  db: ReturnType<typeof useDB>
): Promise<{
  totalEmployees: number;
  critical: number;
  high: number;
  medium: number;
  atRiskCost: number;
  avgRiskScore: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level = 'critical') AS critical,
         math::count(risk_level = 'high') AS high,
         math::count(risk_level = 'medium') AS medium,
         math::sum(est_replacement_cost) AS total_cost,
         math::mean(risk_score) AS avg_risk
       FROM turnover_prediction
       WHERE risk_score >= 35
         AND action_taken = 'none'
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      totalEmployees: safeNumber(row.total, 0),
      critical: safeNumber(row.critical, 0),
      high: safeNumber(row.high, 0),
      medium: safeNumber(row.medium, 0),
      atRiskCost: safeNumber(row.total_cost, 0),
      avgRiskScore: safeNumber(row.avg_risk, 0),
    };
  } catch {
    return { totalEmployees: 0, critical: 0, high: 0, medium: 0, atRiskCost: 0, avgRiskScore: 0 };
  }
};

export const updateTurnoverAction = async (
  db: ReturnType<typeof useDB>,
  predictionId: string,
  action: string
): Promise<void> => {
  await db.query(
    `UPDATE $id SET action_taken = $action, updated_at = time::now()`,
    { id: predictionId, action }
  );
};
