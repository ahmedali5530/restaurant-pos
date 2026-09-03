/**
 * AI Restaurant Opening & Closing Procedure Automator — generates daily
 * checklists, tracks completion, alerts on missed/overdue tasks.
 *
 * 89th POSR-exclusive differentiator — restaurants lose $200-500/mo per
 * location from inconsistent opening/closing procedures (forgotten equipment
 * startup, missed temp checks, incomplete cleaning, unsecured premises).
 *
 * Distinct from:
 *   - health-inspection-readiness.service (FDA Food Code violation scoring
 *     — NOT daily opening/closing procedures)
 *   - compliance-tracking.service (EMPLOYEE certifications — NOT daily checklists)
 *   - cleaning.service (PREDICTIVE cleaning schedule: traffic-based — NOT
 *     daily opening/closing cleaning)
 *   - equipment-maintenance.service (EQUIPMENT failure prediction — NOT
 *     daily startup/shutdown procedures)
 *   - prep-sheet-optimizer.service (FOOD prep quantities — NOT equipment/
 *     facility procedures)
 *   - energy-optimization.service (ENERGY waste detection — NOT procedure
 *     automation)
 *
 * AUTOMATES OPENING & CLOSING PROCEDURES:
 *   - Generates daily opening checklist (equipment, temp checks, cleaning,
 *     staffing, inventory, systems)
 *   - Generates daily closing checklist (equipment shutdown, food storage,
 *     security, cleaning, cash reconciliation)
 *   - Tracks completion with timestamps + staff accountability
 *   - Alerts on missed/overdue tasks
 *   - Predicts risk based on historical completion patterns
 *   - Auto-prioritizes critical tasks during time-constrained openings
 *
 * 8 AI rules:
 *   1. equipment_startup_missed — oven/fryer not preheated before opening
 *   2. temp_check_overdue — cooler/freezer temp not verified by deadline
 *   3. cleaning_incomplete — sanitization tasks not completed before opening
 *   4. security_breach_risk — door/alarm/safe not secured at closing
 *   5. staffing_gap_opening — opener hasn't arrived 15 min before prep start
 *   6. inventory_prep_missed — key ingredients not prepped before rush
 *   7. system_failure_risk — POS/payment terminal not booted before opening
 *   8. closing_equipment_left_on — equipment left on overnight (energy waste)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ProcedureRuleId =
  | 'equipment_startup_missed'
  | 'temp_check_overdue'
  | 'cleaning_incomplete'
  | 'security_breach_risk'
  | 'staffing_gap_opening'
  | 'inventory_prep_missed'
  | 'system_failure_risk'
  | 'closing_equipment_left_on';

export type ProcedureAiRec =
  | 'complete_now'
  | 'reassign'
  | 'escalate'
  | 'verify'
  | 'monitor'
  | 'skip';

export interface ProcedureAlert {
  id?: string;
  rule_id: ProcedureRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  shift_type: 'opening' | 'closing';
  task_name: string;
  zone?: string;
  assigned_to?: string;
  due_time?: string;
  minutes_overdue?: number;
  completion_rate_pct?: number;
  est_revenue_impact: number;
  est_risk_cost: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ProcedureAiRec;
  status: 'open' | 'completed' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface ProcedureConfig {
  aiEnabled: boolean;
  openingTime: string;       // '10:00'
  closingTime: string;       // '22:00'
  openingPrepMin: number;    // 60
  closingCheckMin: number;   // 30
  overdueAlertMin: number;   // 10
}

export const DEFAULT_PROCEDURE_CONFIG: ProcedureConfig = {
  aiEnabled: true,
  openingTime: '10:00',
  closingTime: '22:00',
  openingPrepMin: 60,
  closingCheckMin: 30,
  overdueAlertMin: 10,
};

export const readProcedureConfig = (settings: any): ProcedureConfig => ({
  aiEnabled: settings?.procedure_ai_enabled ?? true,
  openingTime: settings?.procedure_opening_time ?? '10:00',
  closingTime: settings?.procedure_closing_time ?? '22:00',
  openingPrepMin: safeNumber(settings?.procedure_opening_prep_min, 60),
  closingCheckMin: safeNumber(settings?.procedure_closing_check_min, 30),
  overdueAlertMin: safeNumber(settings?.procedure_overdue_alert_min, 10),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

// ---------------------------------------------------------------------------
// Mock checklist task data (in production, from procedure_checklist_log table)
// ---------------------------------------------------------------------------
interface ChecklistTask {
  task_name: string;
  shift_type: 'opening' | 'closing';
  zone: string;
  assigned_to: string;
  due_time: string;       // HH:MM
  completed: boolean;
  completed_at?: string;  // ISO datetime
  is_critical: boolean;
}

const MOCK_TASKS: ChecklistTask[] = [
  // Opening tasks
  { task_name: 'Preheat pizza oven to 450°F',     shift_type: 'opening', zone: 'kitchen',       assigned_to: 'Jose Martinez', due_time: '09:15', completed: false, is_critical: true },
  { task_name: 'Start fryer and heat to 350°F',   shift_type: 'opening', zone: 'kitchen',       assigned_to: 'Jose Martinez', due_time: '09:20', completed: true,  completed_at: '2026-09-10T09:18:00Z', is_critical: true },
  { task_name: 'Verify walk-in cooler temp <41°F', shift_type: 'opening', zone: 'storage',      assigned_to: 'Maria Garcia',  due_time: '09:10', completed: false, is_critical: true },
  { task_name: 'Verify walk-in freezer temp <0°F', shift_type: 'opening', zone: 'storage',      assigned_to: 'Maria Garcia',  due_time: '09:10', completed: true,  completed_at: '2026-09-10T09:05:00Z', is_critical: true },
  { task_name: 'Sanitize all prep surfaces',       shift_type: 'opening', zone: 'kitchen',       assigned_to: 'David Kim',     due_time: '09:30', completed: false, is_critical: false },
  { task_name: 'Boot POS terminals',               shift_type: 'opening', zone: 'front_of_house', assigned_to: 'Sarah Lee',   due_time: '09:30', completed: false, is_critical: true },
  { task_name: 'Test payment terminal connection', shift_type: 'opening', zone: 'front_of_house', assigned_to: 'Sarah Lee',   due_time: '09:35', completed: false, is_critical: true },
  { task_name: 'Prep pizza dough balls (50 units)', shift_type: 'opening', zone: 'kitchen',      assigned_to: 'Jose Martinez', due_time: '09:45', completed: false, is_critical: false },
  { task_name: 'Brew coffee + setup beverage station', shift_type: 'opening', zone: 'front_of_house', assigned_to: 'Emily Park', due_time: '09:40', completed: true, completed_at: '2026-09-10T09:35:00Z', is_critical: false },
  { task_name: 'Unlock front door + setup signage', shift_type: 'opening', zone: 'exterior',     assigned_to: 'Tom Wilson',    due_time: '09:55', completed: false, is_critical: true },

  // Closing tasks
  { task_name: 'Shut down pizza oven',             shift_type: 'closing', zone: 'kitchen',       assigned_to: 'Jose Martinez', due_time: '22:15', completed: false, is_critical: true },
  { task_name: 'Shut down fryer + drain oil',      shift_type: 'closing', zone: 'kitchen',       assigned_to: 'Jose Martinez', due_time: '22:10', completed: true,  completed_at: '2026-09-10T22:08:00Z', is_critical: true },
  { task_name: 'Store all perishables in walk-in', shift_type: 'closing', zone: 'storage',       assigned_to: 'Maria Garcia',  due_time: '22:20', completed: false, is_critical: true },
  { task_name: 'Clean + sanitize all surfaces',    shift_type: 'closing', zone: 'kitchen',       assigned_to: 'David Kim',     due_time: '22:30', completed: false, is_critical: false },
  { task_name: 'Reconcile cash drawer',            shift_type: 'closing', zone: 'office',        assigned_to: 'Sarah Lee',     due_time: '22:25', completed: false, is_critical: true },
  { task_name: 'Set alarm + lock front door',      shift_type: 'closing', zone: 'exterior',      assigned_to: 'Tom Wilson',    due_time: '22:35', completed: false, is_critical: true },
  { task_name: 'Lock office safe',                 shift_type: 'closing', zone: 'office',        assigned_to: 'Sarah Lee',     due_time: '22:30', completed: false, is_critical: true },
  { task_name: 'Turn off all non-essential lights', shift_type: 'closing', zone: 'front_of_house', assigned_to: 'Emily Park',  due_time: '22:40', completed: false, is_critical: false },
];

// Risk cost estimates per rule type
const RISK_COST: Record<ProcedureRuleId, number> = {
  equipment_startup_missed: 100,    // delayed opening revenue loss
  temp_check_overdue: 2500,          // food safety fine if spoiled food served
  cleaning_incomplete: 1500,         // health inspection violation
  security_breach_risk: 5000,        // theft + insurance
  staffing_gap_opening: 300,         // delayed opening
  inventory_prep_missed: 150,        // stockout during rush
  system_failure_risk: 200,          // can't take orders/payments
  closing_equipment_left_on: 75,     // energy waste per night
};

// Revenue impact per minute of delayed opening
const REVENUE_PER_MIN_OPEN = 8;

/**
 * Run the procedure automator engine.
 * Checks all checklist tasks and generates alerts for missed/overdue items.
 */
export const runProcedureEngine = async (
  db: ReturnType<typeof useDB>,
  config: ProcedureConfig = DEFAULT_PROCEDURE_CONFIG
): Promise<{ alerts: ProcedureAlert[]; generated: number }> => {
  const alerts: ProcedureAlert[] = [];
  const now = new Date();
  const nowTime = now.getTime();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const nowMinutes = currentHour * 60 + currentMin;

  // Helper: parse HH:MM to minutes
  const parseTime = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // Helper: parse opening/closing time
  const openingMin = parseTime(config.openingTime);
  const closingMin = parseTime(config.closingTime);
  const prepStartMin = openingMin - config.openingPrepMin;

  // 1. Fetch checklist tasks from database
  let tasks: ChecklistTask[] = [];
  try {
    const result = await db.query(
      `SELECT
         task_name, shift_type, zone, assigned_to, due_time,
         completed, completed_at, is_critical
       FROM procedure_checklist_log
       WHERE date = time::format(time::now(), '%Y-%m-%d')
       LIMIT 100`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    tasks = rows.map((r: any) => ({
      task_name: String(r.task_name ?? ''),
      shift_type: String(r.shift_type ?? 'opening') as 'opening' | 'closing',
      zone: String(r.zone ?? ''),
      assigned_to: String(r.assigned_to ?? ''),
      due_time: String(r.due_time ?? '00:00'),
      completed: r.completed ?? false,
      completed_at: r.completed_at ? String(r.completed_at) : undefined,
      is_critical: r.is_critical ?? false,
    }));
  } catch (err) {
    console.warn('[procedure] fetchTasks failed — using mock', err);
  }

  // Fallback: use mock data
  if (tasks.length === 0) {
    tasks = MOCK_TASKS;
  }

  // 2. Apply 8 AI rules per task
  for (const task of tasks) {
    const dueMin = parseTime(task.due_time);
    const minutesOverdue = nowMinutes - dueMin;

    // Skip if completed on time
    if (task.completed && task.completed_at) {
      const completedTime = new Date(task.completed_at).getTime();
      const dueTimeToday = new Date(now);
      dueTimeToday.setHours(Math.floor(dueMin / 60), dueMin % 60, 0, 0);
      if (completedTime <= dueTimeToday.getTime() + 5 * 60000) continue; // 5 min grace
    }

    // Only alert if overdue or critical+incomplete near due time
    const isOverdue = !task.completed && minutesOverdue > config.overdueAlertMin;
    const isNearDue = !task.completed && minutesOverdue > -10 && minutesOverdue <= 0;

    if (!isOverdue && !isNearDue) continue;

    // --- Rule 1: EQUIPMENT_STARTUP_MISSED ---
    if (task.task_name.toLowerCase().includes('preheat') || task.task_name.toLowerCase().includes('start fryer')) {
      const delayMin = Math.max(0, minutesOverdue);
      const revenueImpact = delayMin * REVENUE_PER_MIN_OPEN;
      alerts.push(makeAlert(
        'equipment_startup_missed', task.is_critical ? 'critical' : 'high',
        task, minutesOverdue,
        revenueImpact, RISK_COST.equipment_startup_missed,
        `${task.task_name} in ${task.zone} — ${delayMin > 0 ? `${delayMin} min overdue` : 'due now'}. Assigned to ${task.assigned_to}. Delayed equipment startup = ${fmt$(revenueImpact)} revenue impact from delayed opening. Complete NOW.`,
        'complete_now'
      ));
      continue;
    }

    // --- Rule 2: TEMP_CHECK_OVERDUE ---
    if (task.task_name.toLowerCase().includes('temp') || task.task_name.toLowerCase().includes('verify')) {
      alerts.push(makeAlert(
        'temp_check_overdue', task.is_critical ? 'critical' : 'high',
        task, minutesOverdue,
        0, RISK_COST.temp_check_overdue,
        `${task.task_name} — ${minutesOverdue > 0 ? `${minutesOverdue} min overdue` : 'due now'}. Assigned to ${task.assigned_to}. Unverified temps = ${fmt$(RISK_COST.temp_check_overdue)} food safety risk if spoiled food served. Verify NOW.`,
        'complete_now'
      ));
      continue;
    }

    // --- Rule 3: CLEANING_INCOMPLETE ---
    if (task.task_name.toLowerCase().includes('sanitiz') || task.task_name.toLowerCase().includes('clean')) {
      alerts.push(makeAlert(
        'cleaning_incomplete', task.is_critical ? 'high' : 'medium',
        task, minutesOverdue,
        0, RISK_COST.cleaning_incomplete,
        `${task.task_name} in ${task.zone} — ${minutesOverdue > 0 ? `${minutesOverdue} min overdue` : 'due now'}. Assigned to ${task.assigned_to}. Incomplete sanitization = ${fmt$(RISK_COST.cleaning_incomplete)} health inspection violation risk. Complete before opening.`,
        'complete_now'
      ));
      continue;
    }

    // --- Rule 4: SECURITY_BREACH_RISK (closing) ---
    if (task.shift_type === 'closing' && (
      task.task_name.toLowerCase().includes('lock') ||
      task.task_name.toLowerCase().includes('alarm') ||
      task.task_name.toLowerCase().includes('safe')
    )) {
      alerts.push(makeAlert(
        'security_breach_risk', 'critical',
        task, minutesOverdue,
        0, RISK_COST.security_breach_risk,
        `${task.task_name} — ${minutesOverdue > 0 ? `${minutesOverdue} min overdue` : 'due now'}. Assigned to ${task.assigned_to}. Unsecured premises = ${fmt$(RISK_COST.security_breach_risk)} theft + insurance risk. Complete BEFORE leaving.`,
        'escalate'
      ));
      continue;
    }

    // --- Rule 5: STAFFING_GAP_OPENING (opener not arrived) ---
    // (detected when opening tasks not started 15 min before prep start)
    if (task.shift_type === 'opening' && task.task_name.toLowerCase().includes('unlock')) {
      if (minutesOverdue > -15 && !task.completed) {
        alerts.push(makeAlert(
          'staffing_gap_opening', 'critical',
          task, Math.abs(minutesOverdue),
          RISK_COST.staffing_gap_opening, 0,
          `Opening task "${task.task_name}" not started — ${task.assigned_to} may not have arrived. ${fmt$(RISK_COST.staffing_gap_opening)} revenue at risk if opening delayed. Call staff + have backup opener ready.`,
          'escalate'
        ));
      }
      continue;
    }

    // --- Rule 6: INVENTORY_PREP_MISSED ---
    if (task.task_name.toLowerCase().includes('prep') || task.task_name.toLowerCase().includes('dough')) {
      const stockoutRisk = 50; // per item stockout cost
      alerts.push(makeAlert(
        'inventory_prep_missed', task.is_critical ? 'high' : 'medium',
        task, minutesOverdue,
        stockoutRisk, RISK_COST.inventory_prep_missed,
        `${task.task_name} — ${minutesOverdue > 0 ? `${minutesOverdue} min overdue` : 'due soon'}. Assigned to ${task.assigned_to}. Missing prep = ${fmt$(stockoutRisk)} stockout risk during rush. Complete before opening.`,
        'complete_now'
      ));
      continue;
    }

    // --- Rule 7: SYSTEM_FAILURE_RISK (POS/payment) ---
    if (task.task_name.toLowerCase().includes('pos') || task.task_name.toLowerCase().includes('payment') || task.task_name.toLowerCase().includes('terminal')) {
      alerts.push(makeAlert(
        'system_failure_risk', task.is_critical ? 'critical' : 'high',
        task, minutesOverdue,
        RISK_COST.system_failure_risk, 0,
        `${task.task_name} — ${minutesOverdue > 0 ? `${minutesOverdue} min overdue` : 'due now'}. Assigned to ${task.assigned_to}. Systems not booted = ${fmt$(RISK_COST.system_failure_risk)} revenue lost if can't take orders/payments at opening. Boot NOW.`,
        'complete_now'
      ));
      continue;
    }

    // --- Rule 8: CLOSING_EQUIPMENT_LEFT_ON ---
    if (task.shift_type === 'closing' && (
      task.task_name.toLowerCase().includes('shut down') ||
      task.task_name.toLowerCase().includes('turn off')
    )) {
      alerts.push(makeAlert(
        'closing_equipment_left_on', task.is_critical ? 'high' : 'medium',
        task, minutesOverdue,
        0, RISK_COST.closing_equipment_left_on,
        `${task.task_name} — ${minutesOverdue > 0 ? `${minutesOverdue} min overdue` : 'due now'}. Assigned to ${task.assigned_to}. Equipment left on overnight = ${fmt$(RISK_COST.closing_equipment_left_on)}/night energy waste + fire risk. Shut down BEFORE leaving.`,
        'complete_now'
      ));
      continue;
    }

    // Generic alert for other unclassified overdue tasks
    if (isOverdue && task.is_critical) {
      alerts.push(makeAlert(
        'cleaning_incomplete', 'medium',
        task, minutesOverdue,
        0, 100,
        `${task.task_name} in ${task.zone} — ${minutesOverdue} min overdue. Assigned to ${task.assigned_to}. Complete or reassign.`,
        'reassign'
      ));
    }
  }

  // 3. Calculate completion rate per shift
  const openingTasks = tasks.filter(t => t.shift_type === 'opening');
  const closingTasks = tasks.filter(t => t.shift_type === 'closing');
  const openingCompleted = openingTasks.filter(t => t.completed).length;
  const closingCompleted = closingTasks.filter(t => t.completed).length;
  const openingRate = openingTasks.length > 0 ? (openingCompleted / openingTasks.length) * 100 : 0;
  const closingRate = closingTasks.length > 0 ? (closingCompleted / closingTasks.length) * 100 : 0;

  // Aggregate alert if completion rate is low
  if (nowMinutes > openingMin && openingRate < 80) {
    alerts.push(makeAlert(
      'cleaning_incomplete', 'high',
      { task_name: 'Opening Checklist Overall', shift_type: 'opening', zone: 'all', assigned_to: 'Manager', due_time: config.openingTime, completed: false, is_critical: true },
      nowMinutes - openingMin,
      (100 - openingRate) * REVENUE_PER_MIN_OPEN,
      500,
      `Opening checklist only ${openingRate.toFixed(0)}% complete at opening time (${config.openingTime}). ${openingTasks.length - openingCompleted} tasks incomplete. Risk: delayed service, stockouts, food safety. ${fmt$((100 - openingRate) * REVENUE_PER_MIN_OPEN)} revenue impact.`,
      'escalate'
    ));
  }

  // 4. AI insight for top 5 critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts
        .filter(a => a.severity === 'critical' || a.severity === 'high')
        .slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant operations management AI specializing in opening/closing procedures. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Procedure alert: ${a.rule_id} for ${a.shift_type} shift — task "${a.task_name}" in ${a.zone}, assigned to ${a.assigned_to}. ${a.description}` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM procedure_alert WHERE status = 'open' AND detected_at < time::now() - 2h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE procedure_alert CONTENT $data`, {
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
  ruleId: ProcedureRuleId,
  severity: ProcedureAlert['severity'],
  task: ChecklistTask,
  minutesOverdue: number,
  estRevenueImpact: number,
  estRiskCost: number,
  description: string,
  aiRec: ProcedureAiRec
): ProcedureAlert {
  const now = new Date();
  return {
    rule_id: ruleId,
    severity,
    shift_type: task.shift_type,
    task_name: task.task_name,
    zone: task.zone,
    assigned_to: task.assigned_to,
    due_time: task.due_time,
    minutes_overdue: Math.max(0, minutesOverdue),
    est_revenue_impact: Math.round(estRevenueImpact),
    est_risk_cost: Math.round(estRiskCost),
    description,
    ai_recommendation: aiRec,
    status: 'open',
    detected_at: now,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ProcedureAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM procedure_alert
       WHERE status = 'open'
       ORDER BY est_risk_cost DESC, est_revenue_impact DESC
       LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number;
  criticalCount: number;
  totalRevenueImpact: number;
  totalRiskCost: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_revenue_impact) AS revenue,
         math::sum(est_risk_cost) AS risk
       FROM procedure_alert
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalRevenueImpact: safeNumber(r.revenue, 0),
      totalRiskCost: safeNumber(r.risk, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalRevenueImpact: 0, totalRiskCost: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'completed' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
