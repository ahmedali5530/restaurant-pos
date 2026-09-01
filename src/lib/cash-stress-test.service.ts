/**
 * AI Cash Flow Stress Test — worst-case scenario simulation.
 *
 * 71st POSR-exclusive differentiator — 60% of restaurant closures are due to
 * cash flow problems (Cornell CHR). Existing services project NORMAL operations
 * or alert on KNOWN obligations. This service simulates DISRUPTION SCENARIOS
 * and predicts survival timeline.
 *
 * Distinct from:
 *   - cash-flow.service (projects NORMAL 30-day operations — NOT stress)
 *   - cash-early-warning.service (7-day known obligations — NOT scenario sim)
 *   - revenue-forecast.service (predicts revenue — NOT downside risk)
 *   - equipment-maintenance.service (predicts failures — NOT financial impact)
 *   - overtime-prediction.service (predicts OT — NOT cash survival)
 *
 * Simulates 5 stress scenarios: revenue drop, equipment failure, staff shortage,
 * supplier disruption, regulatory shutdown. Predicts survival timeline.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type StressTestRuleId =
  | 'revenue_drop'
  | 'equipment_failure'
  | 'staff_shortage'
  | 'supplier_disruption'
  | 'regulatory_shutdown';

export type StressTestAiRec =
  | 'build_reserve'
  | 'get_credit_line'
  | 'reduce_fixed_costs'
  | 'insurance_review'
  | 'monitor';

export interface CashStressTest {
  id?: string;
  rule_id: StressTestRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  scenario_name: string;
  scenario_description: string;
  revenue_impact_pct: number;
  one_time_cost: number;
  duration_days: number;
  current_balance: number;
  projected_balance_end: number;
  days_until_insolvent?: number;
  survival_outcome: string;
  mitigation_actions?: string;
  recommended_reserve: number;
  reserve_gap: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: StressTestAiRec;
  status: 'open' | 'reviewed' | 'mitigated' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface StressTestConfig {
  aiEnabled: boolean;
  reserveTargetDays: number;
  avgDailyRevenue: number;
  avgDailyCost: number;
}

export const DEFAULT_STRESS_CONFIG: StressTestConfig = {
  aiEnabled: true,
  reserveTargetDays: 60,
  avgDailyRevenue: 3000,
  avgDailyCost: 2500,
};

export const readStressConfig = (settings: any): StressTestConfig => ({
  aiEnabled: settings?.stress_test_ai_enabled ?? true,
  reserveTargetDays: safeNumber(settings?.stress_test_reserve_target_days, 60),
  avgDailyRevenue: safeNumber(settings?.stress_test_avg_daily_revenue, 3000),
  avgDailyCost: safeNumber(settings?.stress_test_avg_daily_cost, 2500),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Run the cash flow stress test engine.
 * Fetches current cash position, simulates disruption scenarios.
 */
export const runStressEngine = async (
  db: ReturnType<typeof useDB>,
  config: StressTestConfig = DEFAULT_STRESS_CONFIG
): Promise<{ tests: CashStressTest[]; generated: number }> => {
  const tests: CashStressTest[] = [];
  const now = new Date();

  // 1. Fetch current cash balance
  let currentBalance = 5000; // default fallback
  let avgDailyRevenue = config.avgDailyRevenue;
  let avgDailyCost = config.avgDailyCost;

  try {
    const revResult = await db.query(
      `SELECT
         math::sum(total) / 30 AS daily_rev,
         count() / 30 AS daily_orders
       FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE
         AND created_at > time::now() - 30d`
    );
    const revRows = Array.isArray(revResult) ? revResult.flat() : [];
    if (revRows[0]) {
      avgDailyRevenue = safeNumber(revRows[0].daily_rev, config.avgDailyRevenue);
    }
  } catch (err) {
    console.warn('[stress-test] fetchRevenue failed', err);
  }

  try {
    const balanceResult = await db.query(
      `SELECT closing_balance
       FROM day_closing
       WHERE deleted_at IS NONE
       ORDER BY closing_date DESC LIMIT 1`
    );
    const balanceRows = Array.isArray(balanceResult) ? balanceResult.flat() : [];
    if (balanceRows[0]?.closing_balance) {
      currentBalance = safeNumber(balanceRows[0].closing_balance, 5000);
    }
  } catch (err) {
    console.warn('[stress-test] fetchBalance failed', err);
  }

  const avgDailyProfit = avgDailyRevenue - avgDailyCost;
  const recommendedReserve = avgDailyCost * config.reserveTargetDays;

  // --- Scenario definitions ---
  const scenarios: Array<{
    ruleId: StressTestRuleId;
    name: string;
    description: string;
    revenueImpactPct: number;
    oneTimeCost: number;
    durationDays: number;
    mitigations: string[];
  }> = [
    {
      ruleId: 'revenue_drop',
      name: '30% Revenue Drop (Pandemic/Construction)',
      description: 'Simulates 30% revenue decline for 90 days (pandemic, road construction, new competitor)',
      revenueImpactPct: -0.30,
      oneTimeCost: 0,
      durationDays: 90,
      mitigations: [
        'Negotiate rent deferral with landlord (60-90 days)',
        'Reduce staffing by 20% via reduced shifts (not layoffs)',
        'Launch delivery-only menu with lower overhead',
        'Apply for SBA Economic Injury Disaster Loan (EIDL)',
        'Negotiate extended payment terms with suppliers (net-60)',
      ],
    },
    {
      ruleId: 'equipment_failure',
      name: 'Critical Equipment Failure (Fridge/Oven)',
      description: 'Main fridge fails — $8k repair + 3 days of lost revenue + $2k inventory loss',
      revenueImpactPct: -0.50,
      oneTimeCost: 12000,
      durationDays: 3,
      mitigations: [
        'Verify equipment insurance coverage (check deductible)',
        'Establish emergency equipment repair fund ($10k)',
        'Backup fridge arrangement with neighboring restaurant',
        'Regular preventive maintenance (equipment-maintenance.service)',
        'Lease-to-own replacement option for fast swap',
      ],
    },
    {
      ruleId: 'staff_shortage',
      name: 'Staff Shortage (Flu Season/Mass Resignation)',
      description: '40% staff unavailable for 14 days — reduced capacity, overtime, lower service quality',
      revenueImpactPct: -0.20,
      oneTimeCost: 3000,
      durationDays: 14,
      mitigations: [
        'Cross-train all staff for multiple roles (training-need.service)',
        'Maintain on-call temp worker list (5+ contacts)',
        'Build gamification + retention program (staff-gamification.service)',
        'Offer overtime bonus ($2/hr extra) during shortage',
        'Reduce menu complexity (fewer items = less staff needed)',
      ],
    },
    {
      ruleId: 'supplier_disruption',
      name: 'Supplier Disruption (Price Spike/Delivery Failure)',
      description: 'Primary supplier fails — 15% cost increase + 5% revenue loss for 30 days while finding alternatives',
      revenueImpactPct: -0.05,
      oneTimeCost: 2000,
      durationDays: 30,
      mitigations: [
        'Diversify suppliers — maintain 3 active relationships (procurement.service)',
        'Keep 7-day emergency inventory buffer',
        'Negotiate backup supply agreements with 2+ vendors',
        'Join restaurant cooperative buying group for better rates',
        'Menu flexibility — ability to swap ingredients (recipe-substitution.service)',
      ],
    },
    {
      ruleId: 'regulatory_shutdown',
      name: 'Regulatory Shutdown (Health Inspection Failure)',
      description: 'Forced 5-day closure for health code violation — zero revenue, full fixed costs',
      revenueImpactPct: -1.00,
      oneTimeCost: 1500,
      durationDays: 5,
      mitigations: [
        'Maintain A+ health inspection score (cleaning-scheduler.service)',
        'Business interruption insurance (covers forced closures)',
        'Crisis communication plan for affected customers',
        'Legal counsel on retainer for appeal process',
        'Documented HACCP compliance (food-safety.service) for defense',
      ],
    },
  ];

  // 2. Simulate each scenario
  for (const scenario of scenarios) {
    const dailyRevenueStressed = avgDailyRevenue * (1 + scenario.revenueImpactPct);
    const dailyProfitStressed = dailyRevenueStressed - avgDailyCost;

    // Starting balance after one-time cost
    const startingBalance = currentBalance - scenario.oneTimeCost;

    // Project balance at end of scenario
    const projectedBalanceEnd = startingBalance + dailyProfitStressed * scenario.durationDays;

    // Calculate days until insolvent (balance reaches $0)
    let daysUntilInsolvent: number | undefined;
    if (dailyProfitStressed < 0 && startingBalance > 0) {
      daysUntilInsolvent = Math.floor(startingBalance / Math.abs(dailyProfitStressed));
    } else if (startingBalance <= 0) {
      daysUntilInsolvent = 0;
    }
    // null = survives full duration

    // Determine survival outcome
    let survivalOutcome: string;
    let severity: 'critical' | 'high' | 'medium' | 'low';

    if (daysUntilInsolvent !== undefined && daysUntilInsolvent === 0) {
      survivalOutcome = 'insolvent_immediately';
      severity = 'critical';
    } else if (daysUntilInsolvent !== undefined && daysUntilInsolvent <= 7) {
      survivalOutcome = 'insolvent_within_7d';
      severity = 'critical';
    } else if (daysUntilInsolvent !== undefined && daysUntilInsolvent <= 30) {
      survivalOutcome = 'insolvent_within_30d';
      severity = 'critical';
    } else if (projectedBalanceEnd < currentBalance * 0.3) {
      survivalOutcome = 'survives_with_difficulty';
      severity = 'high';
    } else if (projectedBalanceEnd < currentBalance * 0.7) {
      survivalOutcome = 'survives_with_difficulty';
      severity = 'medium';
    } else {
      survivalOutcome = 'survives';
      severity = 'low';
    }

    // Recommended reserve to survive this scenario
    const scenarioReserve = avgDailyCost * scenario.durationDays + scenario.oneTimeCost;
    const reserveGap = currentBalance - scenarioReserve;

    // AI recommendation
    let aiRec: StressTestAiRec;
    if (survivalOutcome === 'insolvent_immediately' || survivalOutcome === 'insolvent_within_7d') {
      aiRec = 'get_credit_line';
    } else if (survivalOutcome === 'insolvent_within_30d') {
      aiRec = 'build_reserve';
    } else if (survivalOutcome === 'survives_with_difficulty') {
      aiRec = 'reduce_fixed_costs';
    } else if (scenario.oneTimeCost > 5000) {
      aiRec = 'insurance_review';
    } else {
      aiRec = 'monitor';
    }

    tests.push({
      rule_id: scenario.ruleId,
      severity,
      scenario_name: scenario.name,
      scenario_description: scenario.description,
      revenue_impact_pct: Math.round(scenario.revenueImpactPct * 10000) / 10000,
      one_time_cost: Math.round(scenario.oneTimeCost * 100) / 100,
      duration_days: scenario.durationDays,
      current_balance: Math.round(currentBalance * 100) / 100,
      projected_balance_end: Math.round(projectedBalanceEnd * 100) / 100,
      days_until_insolvent: daysUntilInsolvent,
      survival_outcome: survivalOutcome,
      mitigation_actions: JSON.stringify(scenario.mitigations),
      recommended_reserve: Math.round(scenarioReserve * 100) / 100,
      reserve_gap: Math.round(reserveGap * 100) / 100,
      description: `${scenario.name}: ${scenario.revenueImpactPct * 100}% revenue for ${scenario.durationDays}d + ${fmt$(scenario.oneTimeCost)} one-time. Starting ${fmt$(currentBalance)} → projected ${fmt$(projectedBalanceEnd)}. ${daysUntilInsolvent !== undefined ? `Insolvent in ${daysUntilInsolvent}d.` : 'Survives full duration.'} Reserve needed: ${fmt$(scenarioReserve)} (gap: ${fmt$(reserveGap)}).`,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 3. AI insight for critical/high tests
  if (config.aiEnabled && tests.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topTests = tests.filter(t => t.severity === 'critical' || t.severity === 'high').slice(0, 5);
      for (const t of topTests) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant financial risk AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Stress test: ${t.scenario_name}. Current balance ${fmt$(t.current_balance)}, projected end ${fmt$(t.projected_balance_end)}. ${t.days_until_insolvent !== undefined ? `Insolvent in ${t.days_until_insolvent}d.` : 'Survives.'} Reserve needed ${fmt$(t.recommended_reserve)}, gap ${fmt$(t.reserve_gap)}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          t.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 4. Persist
  try {
    await db.query(`DELETE FROM cash_stress_test WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const t of tests) {
    try {
      await db.query(`CREATE cash_stress_test CONTENT $data`, {
        data: { ...t, detected_at: t.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { tests, generated: tests.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveTests = async (db: ReturnType<typeof useDB>): Promise<CashStressTest[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM cash_stress_test
       WHERE status = 'open'
       ORDER BY severity ASC
       LIMIT 20`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  criticalCount: number;
  totalTests: number;
  insolvencyRiskCount: number;
  totalReserveGap: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(survival_outcome != 'survives') AS insolvency,
         math::sum(reserve_gap) AS gap
       FROM cash_stress_test
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      criticalCount: safeNumber(r.critical, 0),
      totalTests: safeNumber(r.total, 0),
      insolvencyRiskCount: safeNumber(r.insolvency, 0),
      totalReserveGap: safeNumber(r.gap, 0),
    };
  } catch {
    return { criticalCount: 0, totalTests: 0, insolvencyRiskCount: 0, totalReserveGap: 0 };
  }
};

export const updateTestStatus = async (
  db: ReturnType<typeof useDB>,
  testId: string,
  status: 'reviewed' | 'mitigated' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: testId, status });
};
