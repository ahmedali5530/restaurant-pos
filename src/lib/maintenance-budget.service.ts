/**
 * AI Predictive Maintenance Budget Planner — annual maintenance budget.
 *
 * 75th POSR-exclusive differentiator — restaurants spend 2-4% of revenue on
 * maintenance (NRA). Reactive repairs cost 3-5x more. 80% have no maintenance
 * budget. A planned budget saves 25-40% annually (Cornell).
 *
 * Distinct from:
 *   - equipment-maintenance.service (predicts individual failures — NOT budget)
 *   - cash-stress-test.service (simulates scenarios — NOT maintenance planning)
 *   - energy-vampire.service (standby power — NOT maintenance budget)
 *   - energy-optimization.service (energy waste — NOT maintenance spending)
 *   - procurement.service (ingredient prices — NOT equipment maintenance)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type MaintenanceBudgetRuleId =
  | 'preventive_schedule'
  | 'replacement_fund'
  | 'emergency_reserve'
  | 'seasonal_prep'
  | 'cost_optimization';

export type MaintenanceBudgetAiRec =
  | 'budget_now'
  | 'schedule_service'
  | 'start_replacement_fund'
  | 'monitor'
  | 'defer';

export interface MaintenanceBudget {
  id?: string;
  rule_id: MaintenanceBudgetRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  equipment_name?: string;
  equipment_type?: string;
  action_type?: string;
  scheduled_month?: string;
  est_cost: number;
  est_cost_without_plan: number;
  est_savings: number;
  priority_score: number;
  funding_source?: string;
  description: string;
  ai_insight?: string;
  ai_recommendation?: MaintenanceBudgetAiRec;
  status: 'open' | 'budgeted' | 'scheduled' | 'completed' | 'deferred';
  detected_at: Date;
  expires_at?: Date;
}

export interface MaintenanceBudgetConfig {
  aiEnabled: boolean;
  revenuePct: number;
  emergencyPct: number;
  reactiveMultiplier: number;
}

export const DEFAULT_MAINT_BUDGET_CONFIG: MaintenanceBudgetConfig = {
  aiEnabled: true,
  revenuePct: 0.03,
  emergencyPct: 0.20,
  reactiveMultiplier: 4.0,
};

export const readMaintBudgetConfig = (settings: any): MaintenanceBudgetConfig => ({
  aiEnabled: settings?.maint_budget_ai_enabled ?? true,
  revenuePct: safeNumber(settings?.maint_budget_revenue_pct, 0.03),
  emergencyPct: safeNumber(settings?.maint_budget_emergency_pct, 0.20),
  reactiveMultiplier: safeNumber(settings?.maint_budget_reactive_multiplier, 4.0),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Equipment maintenance schedule benchmarks (from equipment-maintenance.service)
const EQUIPMENT_SCHEDULES: Array<{
  type: string; name: string; interval_months: number; cost: number; priority: number; action: string; funding: string;
}> = [
  { type: 'fridge', name: 'Walk-in Fridge #1', interval_months: 3, cost: 150, priority: 85, action: 'preventive_service', funding: 'operating_budget' },
  { type: 'freezer', name: 'Walk-in Freezer', interval_months: 3, cost: 150, priority: 85, action: 'preventive_service', funding: 'operating_budget' },
  { type: 'oven', name: 'Convection Oven', interval_months: 6, cost: 200, priority: 75, action: 'preventive_service', funding: 'operating_budget' },
  { type: 'fryer', name: 'Deep Fryer #1', interval_months: 2, cost: 100, priority: 80, action: 'preventive_service', funding: 'operating_budget' },
  { type: 'dishwasher', name: 'Commercial Dishwasher', interval_months: 3, cost: 120, priority: 70, action: 'preventive_service', funding: 'operating_budget' },
  { type: 'ice_maker', name: 'Ice Maker', interval_months: 3, cost: 100, priority: 65, action: 'preventive_service', funding: 'operating_budget' },
  { type: 'hvac', name: 'HVAC System', interval_months: 6, cost: 300, priority: 90, action: 'preventive_service', funding: 'operating_budget' },
  { type: 'coffee_machine', name: 'Espresso Machine', interval_months: 3, cost: 80, priority: 55, action: 'preventive_service', funding: 'operating_budget' },
  // Annual replacements/upgrades
  { type: 'fryer', name: 'Deep Fryer (replace oil system)', interval_months: 12, cost: 600, priority: 60, action: 'replacement', funding: 'reserve_fund' },
  { type: 'pos_terminal', name: 'POS Terminals (upgrade)', interval_months: 12, cost: 400, priority: 40, action: 'upgrade', funding: 'operating_budget' },
  // Seasonal
  { type: 'hvac', name: 'HVAC Pre-Summer Prep', interval_months: 12, cost: 250, priority: 75, action: 'inspection', funding: 'operating_budget' },
  { type: 'hvac', name: 'HVAC Pre-Winter Prep', interval_months: 12, cost: 250, priority: 75, action: 'inspection', funding: 'operating_budget' },
];

export const runMaintBudgetEngine = async (
  db: ReturnType<typeof useDB>,
  config: MaintenanceBudgetConfig = DEFAULT_MAINT_BUDGET_CONFIG
): Promise<{ budgets: MaintenanceBudget[]; generated: number }> => {
  const budgets: MaintenanceBudget[] = [];
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // 1. Fetch annual revenue for budget target
  let annualRevenue = 1095000; // default $3000/day × 365
  try {
    const revResult = await db.query(
      `SELECT math::sum(total) AS annual FROM order WHERE status = 'Paid' AND deleted_at IS NONE AND created_at > time::now() - 365d`
    );
    const revRows = Array.isArray(revResult) ? revResult.flat() : [];
    if (revRows[0]?.annual) annualRevenue = safeNumber(revRows[0].annual, annualRevenue);
  } catch { /* use default */ }

  const targetBudget = annualRevenue * config.revenuePct;
  const emergencyReserve = targetBudget * config.emergencyPct;
  const plannedBudget = targetBudget - emergencyReserve;

  // 2. Generate preventive maintenance schedule (quarterly items)
  for (const equip of EQUIPMENT_SCHEDULES) {
    // Calculate which month this service should happen
    // Spread quarterly items across different months
    let scheduledMonthIdx: number;
    if (equip.interval_months === 2) {
      // Bi-monthly: schedule 6 times/year
      scheduledMonthIdx = (currentMonth + 2) % 12;
    } else if (equip.interval_months === 3) {
      // Quarterly: schedule 4 times/year
      scheduledMonthIdx = (currentMonth + 3) % 12;
    } else if (equip.interval_months === 6) {
      // Semi-annual
      scheduledMonthIdx = (currentMonth + 6) % 12;
    } else {
      // Annual
      scheduledMonthIdx = (currentMonth + 6) % 12; // 6 months from now
    }

    const scheduledMonth = MONTH_NAMES[scheduledMonthIdx];
    const estCostReactive = equip.cost * config.reactiveMultiplier;
    const estSavings = estCostReactive - equip.cost;

    let ruleId: MaintenanceBudgetRuleId;
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let aiRec: MaintenanceBudgetAiRec;

    if (equip.action === 'replacement') {
      ruleId = 'replacement_fund';
      severity = 'medium';
      aiRec = 'start_replacement_fund';
    } else if (equip.action === 'inspection' && equip.name.includes('Pre-Summer')) {
      ruleId = 'seasonal_prep';
      severity = 'high';
      aiRec = 'schedule_service';
    } else if (equip.action === 'inspection' && equip.name.includes('Pre-Winter')) {
      ruleId = 'seasonal_prep';
      severity = 'high';
      aiRec = 'schedule_service';
    } else if (equip.priority >= 85) {
      ruleId = 'preventive_schedule';
      severity = 'high';
      aiRec = 'budget_now';
    } else if (equip.priority >= 70) {
      ruleId = 'preventive_schedule';
      severity = 'medium';
      aiRec = 'schedule_service';
    } else {
      ruleId = 'cost_optimization';
      severity = 'low';
      aiRec = 'monitor';
    }

    budgets.push({
      rule_id: ruleId,
      severity,
      equipment_name: equip.name,
      equipment_type: equip.type,
      action_type: equip.action,
      scheduled_month: scheduledMonth,
      est_cost: Math.round(equip.cost * 100) / 100,
      est_cost_without_plan: Math.round(estCostReactive * 100) / 100,
      est_savings: Math.round(estSavings * 100) / 100,
      priority_score: equip.priority,
      funding_source: equip.funding,
      description: `${equip.name}: ${equip.action.replace(/_/g, ' ')} in ${scheduledMonth} — planned ${fmt$(equip.cost)} vs reactive ${fmt$(estCostReactive)} (saves ${fmt$(estSavings)}). Priority ${equip.priority}/100.`,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 3. Add emergency reserve recommendation
  budgets.push({
    rule_id: 'emergency_reserve',
    severity: 'high',
    action_type: 'emergency_repair',
    scheduled_month: 'Ongoing',
    est_cost: Math.round(emergencyReserve * 100) / 100,
    est_cost_without_plan: Math.round(targetBudget * config.reactiveMultiplier * 100) / 100,
    est_savings: Math.round((targetBudget * config.reactiveMultiplier - emergencyReserve) * 100) / 100,
    priority_score: 90,
    funding_source: 'reserve_fund',
    description: `EMERGENCY RESERVE: Set aside ${fmt$(emergencyReserve)}/yr (${(config.emergencyPct * 100).toFixed(0)}% of ${fmt$(targetBudget)} maintenance budget) for unexpected breakdowns. Without reserve, emergency repairs cost ${fmt$(targetBudget * config.reactiveMultiplier)} at ${(config.reactiveMultiplier).toFixed(0)}x premium.`,
    ai_recommendation: 'budget_now',
    status: 'open',
    detected_at: now,
  });

  // 4. Add overall cost optimization summary
  const totalPlanned = budgets.reduce((s, b) => s + b.est_cost, 0);
  const totalReactive = budgets.reduce((s, b) => s + b.est_cost_without_plan, 0);
  const totalSavings = totalReactive - totalPlanned;
  const savingsPct = totalReactive > 0 ? (totalSavings / totalReactive) * 100 : 0;

  budgets.push({
    rule_id: 'cost_optimization',
    severity: 'high',
    action_type: 'annual_plan',
    scheduled_month: 'Annual',
    est_cost: Math.round(totalPlanned * 100) / 100,
    est_cost_without_plan: Math.round(totalReactive * 100) / 100,
    est_savings: Math.round(totalSavings * 100) / 100,
    priority_score: 95,
    funding_source: 'operating_budget',
    description: `ANNUAL BUDGET SUMMARY: Planned maintenance ${fmt$(totalPlanned)}/yr vs reactive-only ${fmt$(totalReactive)}/yr. SAVINGS: ${fmt$(totalSavings)}/yr (${savingsPct.toFixed(0)}% reduction). Target budget: ${fmt$(targetBudget)} (${(config.revenuePct * 100).toFixed(0)}% of ${fmt$(annualRevenue)} revenue).`,
    ai_recommendation: 'budget_now',
    status: 'open',
    detected_at: now,
  });

  // 5. AI insight for top 5 high-priority budgets
  if (config.aiEnabled && budgets.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topBudgets = budgets.filter(b => b.severity === 'high' || b.severity === 'critical').slice(0, 5);
      for (const b of topBudgets) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant facilities management AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Maintenance: ${b.equipment_name ?? b.action_type} in ${b.scheduled_month}. Cost ${fmt$(b.est_cost)} (reactive: ${fmt$(b.est_cost_without_plan)}, saves ${fmt$(b.est_savings)}). Priority ${b.priority_score}/100. Funding: ${b.funding_source}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          b.ai_insight = text.slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  // 6. Persist
  try { await db.query(`DELETE FROM maintenance_budget WHERE status = 'open' AND detected_at < time::now() - 1h`); } catch { /* ignore */ }
  for (const b of budgets) {
    try { await db.query(`CREATE maintenance_budget CONTENT $data`, { data: { ...b, detected_at: b.detected_at.toISOString() } }); } catch { /* ignore */ }
  }

  return { budgets, generated: budgets.length };
};

// Reads
export const getActiveBudgets = async (db: ReturnType<typeof useDB>): Promise<MaintenanceBudget[]> => {
  try {
    const result = await db.query(`SELECT * FROM maintenance_budget WHERE status = 'open' ORDER BY priority_score DESC LIMIT 50`);
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  itemCount: number;
  totalPlannedCost: number;
  totalSavings: number;
  emergencyReserve: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::sum(est_cost) AS cost, math::sum(est_savings) AS savings,
       math::sum(est_cost) FROM maintenance_budget WHERE status = 'open' AND rule_id = 'emergency_reserve' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    // Get emergency reserve separately
    let emergencyReserve = 0;
    try {
      const erResult = await db.query(`SELECT est_cost FROM maintenance_budget WHERE rule_id = 'emergency_reserve' AND status = 'open' LIMIT 1`);
      const erRows = Array.isArray(erResult) ? erResult.flat() : [];
      emergencyReserve = safeNumber(erRows[0]?.est_cost, 0);
    } catch { /* ignore */ }
    return {
      itemCount: safeNumber(r.total, 0),
      totalPlannedCost: safeNumber(r.cost, 0),
      totalSavings: safeNumber(r.savings, 0),
      emergencyReserve,
    };
  } catch { return { itemCount: 0, totalPlannedCost: 0, totalSavings: 0, emergencyReserve: 0 }; }
};

export const updateBudgetStatus = async (db: ReturnType<typeof useDB>, budgetId: string, status: 'budgeted' | 'scheduled' | 'completed' | 'deferred'): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: budgetId, status });
};
