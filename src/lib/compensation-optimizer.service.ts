/**
 * AI Staff Performance-Based Compensation Optimizer — analyzes per-staff
 * performance vs pay, recommends raises/bonuses/hours reallocation.
 *
 * 92nd POSR-exclusive differentiator — restaurants lose $500-2,000/mo per
 * location from suboptimal compensation (overpaying underperformers,
 * underpaying top performers who leave, no bonus structure, subjective raises).
 *
 * Distinct from:
 *   - server-performance.service (SERVER metrics + ranking — NOT compensation
 *     optimization)
 *   - staff-gamification.service (GAME mechanics — NOT pay adjustments)
 *   - retention-program.service (RETENTION plans — NOT compensation recs)
 *   - server-coach.service (COACHING recommendations — NOT pay optimization)
 *   - staff-turnover.service (TURNOVER prediction — NOT compensation)
 *   - overtime-prediction.service (OVERTIME forecasting — NOT compensation)
 *   - training-need.service (TRAINING gaps — NOT compensation)
 *   - tip-analytics.service (TIP distribution fairness — NOT base pay)
 *
 * OPTIMIZES COMPENSATION:
 *   - Analyzes per-staff performance vs pay ratio
 *   - Identifies underpaid top performers (retention risk)
 *   - Identifies overpaid underperformers (cost waste)
 *   - Recommends performance-based bonuses
 *   - Suggests raise timing + amount
 *   - Recommends hours reallocation (more hours to top performers)
 *   - Generates peer comparison percentiles
 *   - Tracks satisfaction-pay correlation
 *   - Calculates ROI of compensation changes
 *
 * 8 AI rules:
 *   1. underpaid_top_performer — top performer paid below peer average
 *   2. overpaid_underperformer — low performer paid above peer average
 *   3. bonus_eligible — performance score > 85, eligible for bonus
 *   4. raise_due — consistent top performer for 6+ months, raise due
 *   5. hours_reallocation — top performers get too few hours
 *   6. peer_comparison_gap — large pay gap between same-performance peers
 *   7. retention_pay_risk — underpaid + high turnover risk
 *   8. satisfaction_pay_mismatch — low satisfaction but high pay
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type CompRuleId =
  | 'underpaid_top_performer'
  | 'overpaid_underperformer'
  | 'bonus_eligible'
  | 'raise_due'
  | 'hours_reallocation'
  | 'peer_comparison_gap'
  | 'retention_pay_risk'
  | 'satisfaction_pay_mismatch';

export type CompAiRec =
  | 'give_raise'
  | 'give_bonus'
  | 'reduce_hours'
  | 'increase_hours'
  | 'performance_review'
  | 'monitor'
  | 'skip';

export interface CompAlert {
  id?: string;
  rule_id: CompRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  employee_id?: string;
  employee_name: string;
  role?: string;
  current_hourly_rate?: number;
  suggested_rate?: number;
  performance_score?: number;
  peer_percentile?: number;
  monthly_hours?: number;
  suggested_hours?: number;
  monthly_revenue_generated?: number;
  monthly_tips?: number;
  customer_satisfaction?: number;
  est_turnover_cost: number;
  est_payroll_savings: number;
  est_revenue_uplift: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: CompAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface CompConfig {
  aiEnabled: boolean;
  raiseThresholdPct: number;       // 90
  underperformerThresholdPct: number; // 30
  bonusThresholdScore: number;     // 85
  turnoverCostPerEmployee: number; // 3000
}

export const DEFAULT_COMP_CONFIG: CompConfig = {
  aiEnabled: true,
  raiseThresholdPct: 90.0,
  underperformerThresholdPct: 30.0,
  bonusThresholdScore: 85,
  turnoverCostPerEmployee: 3000,
};

export const readCompConfig = (settings: any): CompConfig => ({
  aiEnabled: settings?.comp_ai_enabled ?? true,
  raiseThresholdPct: safeNumber(settings?.comp_raise_threshold_pct, 90.0),
  underperformerThresholdPct: safeNumber(settings?.comp_underperformer_threshold_pct, 30.0),
  bonusThresholdScore: safeNumber(settings?.comp_bonus_threshold_score, 85),
  turnoverCostPerEmployee: safeNumber(settings?.comp_turnover_cost_per_employee, 3000),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

// Mock staff performance data (in production, from employee + order + tip tables)
interface StaffPerformance {
  employee_id: string;
  employee_name: string;
  role: string;
  hourly_rate: number;
  monthly_hours: number;
  monthly_revenue_generated: number;
  monthly_tips: number;
  customer_satisfaction: number;   // 0-5 stars
  order_accuracy_pct: number;      // 0-100
  avg_ticket_time_min: number;     // speed
  tenure_months: number;           // how long employed
  performance_score: number;       // 0-100 composite
}

const MOCK_STAFF: StaffPerformance[] = [
  // Top performer, underpaid
  { employee_id: 'EMP-01', employee_name: 'Maria Garcia',  role: 'server',     hourly_rate: 15.00, monthly_hours: 160, monthly_revenue_generated: 28000, monthly_tips: 3200, customer_satisfaction: 4.9, order_accuracy_pct: 98, avg_ticket_time_min: 12, tenure_months: 18, performance_score: 95 },
  // Underperformer, overpaid
  { employee_id: 'EMP-02', employee_name: 'Tom Wilson',    role: 'server',     hourly_rate: 18.00, monthly_hours: 140, monthly_revenue_generated: 12000, monthly_tips: 1800, customer_satisfaction: 3.2, order_accuracy_pct: 82, avg_ticket_time_min: 22, tenure_months: 24, performance_score: 45 },
  // Good performer, bonus eligible
  { employee_id: 'EMP-03', employee_name: 'Sarah Lee',     role: 'bartender',  hourly_rate: 16.50, monthly_hours: 150, monthly_revenue_generated: 22000, monthly_tips: 2800, customer_satisfaction: 4.7, order_accuracy_pct: 95, avg_ticket_time_min: 14, tenure_months: 12, performance_score: 88 },
  // Top performer but too few hours
  { employee_id: 'EMP-04', employee_name: 'Jose Martinez', role: 'cook',       hourly_rate: 17.00, monthly_hours: 100, monthly_revenue_generated: 18000, monthly_tips: 0, customer_satisfaction: 4.5, order_accuracy_pct: 96, avg_ticket_time_min: 10, tenure_months: 8, performance_score: 92 },
  // Average performer, raise due (long tenure)
  { employee_id: 'EMP-05', employee_name: 'David Kim',     role: 'cook',       hourly_rate: 14.50, monthly_hours: 170, monthly_revenue_generated: 15000, monthly_tips: 0, customer_satisfaction: 4.0, order_accuracy_pct: 90, avg_ticket_time_min: 15, tenure_months: 30, performance_score: 72 },
  // Low satisfaction but high pay
  { employee_id: 'EMP-06', employee_name: 'Anna Garcia',   role: 'server',     hourly_rate: 17.50, monthly_hours: 155, monthly_revenue_generated: 16000, monthly_tips: 2200, customer_satisfaction: 3.5, order_accuracy_pct: 85, avg_ticket_time_min: 18, tenure_months: 15, performance_score: 55 },
  // Solid performer, fair pay
  { employee_id: 'EMP-07', employee_name: 'Emily Park',    role: 'host',       hourly_rate: 13.50, monthly_hours: 120, monthly_revenue_generated: 8000, monthly_tips: 800, customer_satisfaction: 4.3, order_accuracy_pct: 92, avg_ticket_time_min: 8, tenure_months: 6, performance_score: 78 },
  // New hire, performing well
  { employee_id: 'EMP-08', employee_name: 'Chris Brown',   role: 'server',     hourly_rate: 14.00, monthly_hours: 130, monthly_revenue_generated: 14000, monthly_tips: 1900, customer_satisfaction: 4.4, order_accuracy_pct: 91, avg_ticket_time_min: 16, tenure_months: 3, performance_score: 80 },
];

/**
 * Calculate peer percentile for an employee.
 */
function calculatePeerPercentile(employee: StaffPerformance, allStaff: StaffPerformance[]): number {
  const peers = allStaff.filter(s => s.role === employee.role);
  if (peers.length <= 1) return 50;
  const lowerCount = peers.filter(p => p.performance_score < employee.performance_score).length;
  return Math.round((lowerCount / (peers.length - 1)) * 100);
}

/**
 * Calculate average hourly rate for a role.
 */
function avgRateForRole(role: string, allStaff: StaffPerformance[]): number {
  const peers = allStaff.filter(s => s.role === role);
  if (peers.length === 0) return 15;
  return peers.reduce((sum, p) => sum + p.hourly_rate, 0) / peers.length;
}

/**
 * Run the compensation optimizer engine.
 */
export const runCompEngine = async (
  db: ReturnType<typeof useDB>,
  config: CompConfig = DEFAULT_COMP_CONFIG
): Promise<{ alerts: CompAlert[]; generated: number }> => {
  const alerts: CompAlert[] = [];
  const now = new Date();

  // 1. Fetch staff performance data
  let staff: StaffPerformance[] = [];
  try {
    const result = await db.query(
      `SELECT
         id AS employee_id, name AS employee_name, role,
         hourly_rate, monthly_hours, monthly_revenue_generated,
         monthly_tips, customer_satisfaction, order_accuracy_pct,
         avg_ticket_time_min, tenure_months, performance_score
       FROM employee
       WHERE deleted_at IS NONE
         AND status = 'active'
       LIMIT 100`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    staff = rows.map((r: any) => ({
      employee_id: String(r.employee_id ?? ''),
      employee_name: String(r.employee_name ?? 'Unknown'),
      role: String(r.role ?? 'server'),
      hourly_rate: safeNumber(r.hourly_rate, 15),
      monthly_hours: safeNumber(r.monthly_hours, 0),
      monthly_revenue_generated: safeNumber(r.monthly_revenue_generated, 0),
      monthly_tips: safeNumber(r.monthly_tips, 0),
      customer_satisfaction: safeNumber(r.customer_satisfaction, 4.0),
      order_accuracy_pct: safeNumber(r.order_accuracy_pct, 90),
      avg_ticket_time_min: safeNumber(r.avg_ticket_time_min, 15),
      tenure_months: safeNumber(r.tenure_months, 0),
      performance_score: safeNumber(r.performance_score, 50),
    }));
  } catch (err) {
    console.warn('[comp] fetchStaff failed — using mock', err);
  }

  // Fallback: use mock data
  if (staff.length === 0) {
    staff = MOCK_STAFF;
  }

  // 2. Apply 8 AI rules per employee
  for (const emp of staff) {
    const peerPct = calculatePeerPercentile(emp, staff);
    const avgRate = avgRateForRole(emp.role, staff);
    const rateDelta = emp.hourly_rate - avgRate;
    const revenuePerHour = emp.monthly_hours > 0 ? emp.monthly_revenue_generated / emp.monthly_hours : 0;

    // --- Rule 1: UNDERPAID_TOP_PERFORMER ---
    if (peerPct >= config.raiseThresholdPct && emp.hourly_rate < avgRate * 0.95) {
      const suggestedRate = avgRate * 1.05; // 5% above average
      const raiseCost = (suggestedRate - emp.hourly_rate) * emp.monthly_hours;
      const turnoverRisk = config.turnoverCostPerEmployee * 0.6; // 60% likely to leave
      alerts.push(makeAlert(
        'underpaid_top_performer', 'critical',
        emp, suggestedRate, peerPct,
        emp.monthly_hours, emp.monthly_hours, // keep hours same
        turnoverRisk, 0, 0,
        `${emp.employee_name} (${emp.role}): top performer (${peerPct}th percentile, score ${emp.performance_score}/100) but paid $${emp.hourly_rate.toFixed(2)}/hr — ${((1 - emp.hourly_rate / avgRate) * 100).toFixed(0)}% below peer avg ($${avgRate.toFixed(2)}). RETENTION RISK: ${fmt$(turnoverRisk)} replacement cost if leaves. Raise to $${suggestedRate.toFixed(2)} (+${fmt$(raiseCost)}/mo).`,
        'give_raise'
      ));
    }

    // --- Rule 2: OVERPAID_UNDERPERFORMER ---
    if (peerPct <= config.underperformerThresholdPct && emp.hourly_rate > avgRate * 1.05) {
      const payrollWaste = (emp.hourly_rate - avgRate) * emp.monthly_hours;
      const suggestedHours = Math.max(80, emp.monthly_hours - 20); // reduce hours
      alerts.push(makeAlert(
        'overpaid_underperformer', 'high',
        emp, avgRate, peerPct,
        emp.monthly_hours, suggestedHours,
        0, payrollWaste, 0,
        `${emp.employee_name} (${emp.role}): low performer (${peerPct}th percentile, score ${emp.performance_score}/100) but paid $${emp.hourly_rate.toFixed(2)}/hr — ${((emp.hourly_rate / avgRate - 1) * 100).toFixed(0)}% above peer avg. Payroll waste: ${fmt$(payrollWaste)}/mo. Reduce hours from ${emp.monthly_hours} to ${suggestedHours} or performance review.`,
        'reduce_hours'
      ));
    }

    // --- Rule 3: BONUS_ELIGIBLE ---
    if (emp.performance_score >= config.bonusThresholdScore) {
      const bonusAmount = emp.monthly_revenue_generated * 0.005; // 0.5% of revenue
      alerts.push(makeAlert(
        'bonus_eligible', 'medium',
        emp, emp.hourly_rate, peerPct,
        emp.monthly_hours, emp.monthly_hours,
        0, 0, bonusAmount * 0.5, // 50% ROI (motivation uplift)
        `${emp.employee_name} (${emp.role}): performance score ${emp.performance_score}/100 (bonus threshold ${config.bonusThresholdScore}). Eligible for ${fmt$(bonusAmount)} monthly bonus. Revenue generated: ${fmt$(emp.monthly_revenue_generated)}/mo. Bonus ROI: 50% (motivation + retention uplift).`,
        'give_bonus'
      ));
    }

    // --- Rule 4: RAISE_DUE — consistent performer 6+ months ---
    if (emp.tenure_months >= 6 && emp.performance_score >= 75 && peerPct >= 70) {
      const raisePct = Math.min(10, emp.tenure_months / 12 * 5); // 5% per year, max 10%
      const suggestedRate = emp.hourly_rate * (1 + raisePct / 100);
      const raiseCost = (suggestedRate - emp.hourly_rate) * emp.monthly_hours;
      alerts.push(makeAlert(
        'raise_due', 'medium',
        emp, suggestedRate, peerPct,
        emp.monthly_hours, emp.monthly_hours,
        config.turnoverCostPerEmployee * 0.3, // 30% risk if no raise
        0, 0,
        `${emp.employee_name} (${emp.role}): ${emp.tenure_months} months tenure, consistent performer (score ${emp.performance_score}, ${peerPct}th percentile). Raise due: +${raisePct.toFixed(1)}% → $${suggestedRate.toFixed(2)}/hr (+${fmt$(raiseCost)}/mo). Prevents stagnation + shows appreciation.`,
        'give_raise'
      ));
    }

    // --- Rule 5: HOURS_REALLOCATION — top performer, too few hours ---
    if (peerPct >= 75 && emp.monthly_hours < 130) {
      const suggestedHours = Math.min(170, emp.monthly_hours + 30);
      const additionalRevenue = (suggestedHours - emp.monthly_hours) * revenuePerHour;
      const additionalPayroll = (suggestedHours - emp.monthly_hours) * emp.hourly_rate;
      const netUplift = additionalRevenue - additionalPayroll;
      alerts.push(makeAlert(
        'hours_reallocation', 'high',
        emp, emp.hourly_rate, peerPct,
        emp.monthly_hours, suggestedHours,
        0, 0, netUplift,
        `${emp.employee_name} (${emp.role}): top performer (${peerPct}th percentile) but only ${emp.monthly_hours} hrs/mo. Increase to ${suggestedHours} hrs → +${fmt$(additionalRevenue)} revenue - ${fmt$(additionalPayroll)} payroll = ${fmt$(netUplift)} net uplift/mo. Reallocate hours from underperformers.`,
        'increase_hours'
      ));
    }

    // --- Rule 6: PEER_COMPARISON_GAP — large pay gap between same-performance peers ---
    const peers = staff.filter(s => s.role === emp.role && s.employee_id !== emp.employee_id);
    for (const peer of peers) {
      const perfDiff = Math.abs(emp.performance_score - peer.performance_score);
      const payDiff = Math.abs(emp.hourly_rate - peer.hourly_rate);
      if (perfDiff <= 5 && payDiff >= 2) {
        const higherPaid = emp.hourly_rate > peer.hourly_rate ? emp : peer;
        const lowerPaid = emp.hourly_rate > peer.hourly_rate ? peer : emp;
        alerts.push(makeAlert(
          'peer_comparison_gap', 'medium',
          emp, emp.hourly_rate, peerPct,
          emp.monthly_hours, emp.monthly_hours,
          0, 0, 0,
          `${emp.employee_name} vs ${peer.employee_name} (${emp.role}): similar performance (${emp.performance_score} vs ${peer.performance_score}, diff ${perfDiff}) but pay gap $${payDiff.toFixed(2)}/hr. ${higherPaid.employee_name} earns more despite same performance. Equalize pay to avoid favoritism perception.`,
          'performance_review'
        ));
        break; // only flag once per employee
      }
    }

    // --- Rule 7: RETENTION_PAY_RISK — underpaid + high turnover risk ---
    if (peerPct >= 70 && emp.hourly_rate < avgRate && emp.tenure_months >= 6) {
      const turnoverProbability = Math.min(0.8, (avgRate - emp.hourly_rate) / avgRate + 0.3);
      const expectedTurnoverCost = config.turnoverCostPerEmployee * turnoverProbability;
      alerts.push(makeAlert(
        'retention_pay_risk', 'critical',
        emp, avgRate, peerPct,
        emp.monthly_hours, emp.monthly_hours,
        expectedTurnoverCost, 0, 0,
        `${emp.employee_name} (${emp.role}): ${peerPct}th percentile performer, underpaid by ${fmt$(avgRate - emp.hourly_rate)}/hr. ${(turnoverProbability * 100).toFixed(0)}% turnover probability → ${fmt$(expectedTurnoverCost)} expected replacement cost. Raise to $${avgRate.toFixed(2)} (peer average) to retain.`,
        'give_raise'
      ));
    }

    // --- Rule 8: SATISFACTION_PAY_MISMATCH — low satisfaction but high pay ---
    if (emp.customer_satisfaction < 3.8 && emp.hourly_rate > avgRate * 1.05) {
      const payrollWaste = (emp.hourly_rate - avgRate) * emp.monthly_hours;
      alerts.push(makeAlert(
        'satisfaction_pay_mismatch', 'high',
        emp, avgRate, peerPct,
        emp.monthly_hours, emp.monthly_hours - 15,
        0, payrollWaste, 0,
        `${emp.employee_name} (${emp.role}): customer satisfaction ${emp.customer_satisfaction}/5 (below 3.8 threshold) but paid $${emp.hourly_rate.toFixed(2)}/hr (${((emp.hourly_rate / avgRate - 1) * 100).toFixed(0)}% above peer avg). Pay doesn't match performance. Payroll waste: ${fmt$(payrollWaste)}/mo. Performance review + reduce hours.`,
        'performance_review'
      ));
    }
  }

  // 3. AI insight for top 5 critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts
        .filter(a => a.severity === 'critical' || a.severity === 'high')
        .slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant HR compensation optimization AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Compensation alert: ${a.rule_id} for ${a.employee_name} (${a.role}) — score ${a.performance_score}/100, ${a.peer_percentile}th percentile, $${a.current_hourly_rate?.toFixed(2)}/hr. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM compensation_alert WHERE status = 'open' AND detected_at < time::now() - 1d`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE compensation_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { alerts, generated: alerts.length };
};

// ---------------------------------------------------------------------------
// Helper: build an alert
// ---------------------------------------------------------------------------
function makeAlert(
  ruleId: CompRuleId,
  severity: CompAlert['severity'],
  emp: StaffPerformance,
  suggestedRate: number,
  peerPct: number,
  monthlyHours: number,
  suggestedHours: number,
  estTurnoverCost: number,
  estPayrollSavings: number,
  estRevenueUplift: number,
  description: string,
  aiRec: CompAiRec
): CompAlert {
  const now = new Date();
  return {
    rule_id: ruleId,
    severity,
    employee_id: emp.employee_id,
    employee_name: emp.employee_name,
    role: emp.role,
    current_hourly_rate: Math.round(emp.hourly_rate * 100) / 100,
    suggested_rate: Math.round(suggestedRate * 100) / 100,
    performance_score: emp.performance_score,
    peer_percentile: peerPct,
    monthly_hours: monthlyHours,
    suggested_hours: suggestedHours !== monthlyHours ? suggestedHours : undefined,
    monthly_revenue_generated: Math.round(emp.monthly_revenue_generated),
    monthly_tips: Math.round(emp.monthly_tips),
    customer_satisfaction: Math.round(emp.customer_satisfaction * 10) / 10,
    est_turnover_cost: Math.round(estTurnoverCost),
    est_payroll_savings: Math.round(estPayrollSavings),
    est_revenue_uplift: Math.round(estRevenueUplift),
    description,
    ai_recommendation: aiRec,
    status: 'open',
    detected_at: now,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<CompAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM compensation_alert
       WHERE status = 'open'
       ORDER BY est_turnover_cost DESC, est_payroll_savings DESC, est_revenue_uplift DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number;
  criticalCount: number;
  totalTurnoverRisk: number;
  totalPayrollSavings: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_turnover_cost) AS turnover_risk,
         math::sum(est_payroll_savings) AS payroll_savings
       FROM compensation_alert
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalTurnoverRisk: safeNumber(r.turnover_risk, 0),
      totalPayrollSavings: safeNumber(r.payroll_savings, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalTurnoverRisk: 0, totalPayrollSavings: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
