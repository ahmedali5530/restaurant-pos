/**
 * AI Labor Cost Optimization service — labor cost vs revenue analysis.
 *
 * Research finding: Toast Labor Cost Management $35+/mo (higher tier),
 * Square Labor Cost Reporting in Plus. POSR offers it free — analyzes
 * labor cost as % of revenue, hourly efficiency, overtime impact,
 * + AI recommendations for staffing optimization.
 *
 * Metrics:
 *   - Labor cost %: total_labor_cost / total_revenue × 100 (benchmark: 25-35%)
 *   - Revenue per labor hour: revenue / total_hours (productivity)
 *   - Labor efficiency: revenue_per_hour / avg_hourly_cost (>3 = good)
 *   - Overtime %: overtime_cost / total_labor_cost × 100
 *   - Health: healthy (<30%) / watch (30-35%) / warning (35-40%) / critical (>40%)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type LaborHealthStatus = 'healthy' | 'watch' | 'warning' | 'critical';

export interface LaborCostAnalysis {
  id?: string;
  analysis_date: Date;
  period_start: Date;
  period_end: Date;
  total_revenue: number;
  total_labor_cost: number;
  labor_cost_pct: number;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  overtime_cost: number;
  overtime_pct: number;
  employee_count: number;
  avg_hourly_cost: number;
  revenue_per_labor_hour: number;
  labor_efficiency: number;
  health_status: LaborHealthStatus;
  daily_breakdown?: Array<{ date: string; revenue: number; labor_cost: number; labor_pct: number; hours: number; employees: number }>;
  top_cost_employees?: Array<{ name: string; hours: number; cost: number; overtime_hours: number }>;
  ai_insight?: string;
  ai_recommendations: string[];
  projected_savings?: number;
  generated_at: Date;
}

export interface LaborConfig {
  aiEnabled: boolean;
  targetPct: number;
  criticalPct: number;
  lookbackDays: number;
}

export const DEFAULT_LABOR_CONFIG: LaborConfig = {
  aiEnabled: true,
  targetPct: 30,
  criticalPct: 40,
  lookbackDays: 30,
};

export const readLaborConfig = (settings: any): LaborConfig => ({
  aiEnabled: settings?.labor_opt_ai_enabled ?? true,
  targetPct: safeNumber(settings?.labor_opt_target_pct, 30),
  criticalPct: safeNumber(settings?.labor_opt_critical_pct, 40),
  lookbackDays: safeNumber(settings?.labor_opt_lookback_days, 30),
});

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

const collectLaborData = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<{
  revenue: number;
  laborCost: number;
  totalHours: number;
  overtimeHours: number;
  overtimeCost: number;
  employeeCount: number;
  dailyData: Map<string, { revenue: number; laborCost: number; hours: number; employees: Set<string> }>;
  employeeData: Map<string, { name: string; hours: number; cost: number; overtimeHours: number }>;
}> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  let revenue = 0;
  let laborCost = 0;
  let totalHours = 0;
  let overtimeHours = 0;
  let overtimeCost = 0;
  const dailyData = new Map<string, { revenue: number; laborCost: number; hours: number; employees: Set<string> }>();
  const employeeData = new Map<string, { name: string; hours: number; cost: number; overtimeHours: number }>();

  // Fetch revenue (Paid orders)
  try {
    const result = await db.query(
      `SELECT total, created_at FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    for (const order of rows) {
      const total = safeNumber(order.total, 0);
      revenue += total;
      const dateKey = new Date(order.created_at).toISOString().split('T')[0];
      if (!dailyData.has(dateKey)) dailyData.set(dateKey, { revenue: 0, laborCost: 0, hours: 0, employees: new Set() });
      dailyData.get(dateKey)!.revenue += total;
    }
  } catch (err) {
    console.warn('[labor-opt] revenue fetch failed', err);
  }

  // Fetch time entries with employee pay rates
  try {
    const result = await db.query(
      `SELECT
         id,
         clock_in,
         clock_out,
         duration_seconds,
         user.id AS user_id,
         user.first_name AS first_name,
         user.last_name AS last_name,
         employee.id AS employee_id,
         (SELECT base_rate, maximum_hours_per_week FROM employee_pay_profile
          WHERE employee.id = $parent.employee LIMIT 1)[0] AS pay
       FROM time_entry
       WHERE clock_in > $cutoff AND clock_out != NONE
       FETCH user, employee`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const entry of rows) {
      const durationSec = safeNumber(entry.duration_seconds, 0);
      const hours = durationSec / 3600;
      if (hours <= 0 || hours > 24) continue; // sanity

      const rate = safeNumber(entry.pay?.base_rate, 15);
      const cost = hours * rate;
      const userId = entry.user_id?.toString?.() ?? entry.employee_id?.toString?.() ?? '';
      const userName = `${entry.first_name ?? ''} ${entry.last_name ?? ''}`.trim() || 'Unknown';

      laborCost += cost;
      totalHours += hours;

      // Overtime detection (> 8h in a day or > 40h/week)
      const isOvertime = hours > 8;
      if (isOvertime) {
        const otHours = hours - 8;
        overtimeHours += otHours;
        overtimeCost += otHours * rate * 1.5;
      }

      // Daily breakdown
      const dateKey = new Date(entry.clock_in).toISOString().split('T')[0];
      if (!dailyData.has(dateKey)) dailyData.set(dateKey, { revenue: 0, laborCost: 0, hours: 0, employees: new Set() });
      const dayData = dailyData.get(dateKey)!;
      dayData.laborCost += cost;
      dayData.hours += hours;
      if (userId) dayData.employees.add(userId);

      // Employee aggregation
      if (!employeeData.has(userId)) {
        employeeData.set(userId, { name: userName, hours: 0, cost: 0, overtimeHours: 0 });
      }
      const emp = employeeData.get(userId)!;
      emp.hours += hours;
      emp.cost += cost;
      if (isOvertime) emp.overtimeHours += hours - 8;
    }
  } catch (err) {
    console.warn('[labor-opt] time entry fetch failed', err);
  }

  return {
    revenue,
    laborCost,
    totalHours,
    overtimeHours,
    overtimeCost,
    employeeCount: employeeData.size,
    dailyData,
    employeeData,
  };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  analysis: LaborCostAnalysis,
  config: LaborConfig
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[labor-opt] OpenAI not available — using rule-based');
    analysis.ai_recommendations = generateRuleBasedRecommendations(analysis, config);
    analysis.ai_insight = generateRuleBasedInsight(analysis, config);
    return;
  }

  const prompt = `You are a restaurant labor cost optimization expert.
Analyze this labor cost data and provide insights + recommendations.

Period: ${analysis.period_start.toISOString().split('T')[0]} to ${analysis.period_end.toISOString().split('T')[0]}
Total revenue: $${analysis.total_revenue.toFixed(0)}
Total labor cost: $${analysis.total_labor_cost.toFixed(0)}
Labor cost %: ${analysis.labor_cost_pct}%
Total hours: ${analysis.total_hours.toFixed(0)}
Overtime hours: ${analysis.overtime_hours.toFixed(0)} (${analysis.overtime_pct}% of cost)
Employees: ${analysis.employee_count}
Revenue per labor hour: $${analysis.revenue_per_labor_hour.toFixed(2)}
Labor efficiency: ${analysis.labor_efficiency.toFixed(2)}x
Health: ${analysis.health_status}

Top cost employees:
${JSON.stringify(analysis.top_cost_employees?.slice(0, 5) ?? [], null, 2)}

Respond with JSON:
{
  "insight": "<max 300 chars — overall assessment>",
  "recommendations": ["<max 200 chars each — actionable steps>"],
  "projected_monthly_savings": <number>
}

Focus on: overtime reduction, staffing adjustments, peak hour optimization.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant labor cost optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    analysis.ai_insight = parsed.insight;
    analysis.ai_recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    analysis.projected_savings = parsed.projected_monthly_savings;
  } catch (err) {
    console.warn('[labor-opt] AI enhancement failed', err);
    analysis.ai_recommendations = generateRuleBasedRecommendations(analysis, config);
    analysis.ai_insight = generateRuleBasedInsight(analysis, config);
  }
};

const generateRuleBasedRecommendations = (a: LaborCostAnalysis, config: LaborConfig): string[] => {
  const recs: string[] = [];
  if (a.labor_cost_pct > config.criticalPct) {
    recs.push(`Labor cost at ${a.labor_cost_pct}% is critical (target < ${config.targetPct}%). Reduce staffing during low-revenue hours.`);
  } else if (a.labor_cost_pct > config.targetPct) {
    recs.push(`Labor cost at ${a.labor_cost_pct}% is above target. Review staffing during off-peak hours.`);
  }
  if (a.overtime_pct > 15) {
    recs.push(`Overtime is ${a.overtime_pct}% of labor cost. Hire part-time staff to reduce overtime burden.`);
  }
  if (a.labor_efficiency < 3) {
    recs.push(`Labor efficiency at ${a.labor_efficiency.toFixed(1)}x is below 3x target. Revenue per labor hour needs improvement.`);
  }
  if (a.revenue_per_labor_hour < 50) {
    recs.push(`Revenue per labor hour is only $${a.revenue_per_labor_hour.toFixed(0)}. Consider reducing staff during slow periods.`);
  }
  if (recs.length === 0) {
    recs.push('Labor costs are within healthy range. Monitor for trend changes.');
  }
  return recs;
};

const generateRuleBasedInsight = (a: LaborCostAnalysis, _config: LaborConfig): string => {
  if (a.health_status === 'critical') {
    return `Labor cost is ${a.labor_cost_pct}% of revenue — critically high. ${a.employee_count} employees worked ${a.total_hours.toFixed(0)} hours generating $${a.revenue_per_labor_hour.toFixed(0)}/hour. Immediate action needed.`;
  }
  if (a.health_status === 'warning') {
    return `Labor cost is ${a.labor_cost_pct}% of revenue — above ideal. Overtime accounts for ${a.overtime_pct}% of costs. Review staffing efficiency.`;
  }
  return `Labor cost is ${a.labor_cost_pct}% of revenue — within healthy range. ${a.employee_count} employees, ${a.total_hours.toFixed(0)} hours, $${a.revenue_per_labor_hour.toFixed(0)}/hour productivity.`;
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const analyzeLaborCosts = async (
  db: ReturnType<typeof useDB>,
  config: LaborConfig = DEFAULT_LABOR_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<LaborCostAnalysis | null> => {
  if (onProgress) onProgress(0, 3);

  const data = await collectLaborData(db, config.lookbackDays);
  if (onProgress) onProgress(1, 3);

  const totalRevenue = data.revenue;
  const totalLaborCost = data.laborCost;
  const laborCostPct = totalRevenue > 0 ? (totalLaborCost / totalRevenue) * 100 : 0;
  const totalHours = data.totalHours;
  const regularHours = totalHours - data.overtimeHours;
  const overtimePct = totalLaborCost > 0 ? (data.overtimeCost / totalLaborCost) * 100 : 0;
  const avgHourlyCost = totalHours > 0 ? totalLaborCost / totalHours : 0;
  const revenuePerHour = totalHours > 0 ? totalRevenue / totalHours : 0;
  const laborEfficiency = avgHourlyCost > 0 ? revenuePerHour / avgHourlyCost : 0;

  let healthStatus: LaborHealthStatus = 'healthy';
  if (laborCostPct >= config.criticalPct) healthStatus = 'critical';
  else if (laborCostPct >= config.criticalPct * 0.875) healthStatus = 'warning';
  else if (laborCostPct >= config.targetPct) healthStatus = 'watch';

  // Daily breakdown
  const dailyBreakdown = Array.from(data.dailyData.entries())
    .map(([date, d]) => ({
      date,
      revenue: Math.round(d.revenue * 100) / 100,
      labor_cost: Math.round(d.laborCost * 100) / 100,
      labor_pct: d.revenue > 0 ? Math.round((d.laborCost / d.revenue) * 100 * 10) / 10 : 0,
      hours: Math.round(d.hours * 10) / 10,
      employees: d.employees.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top cost employees
  const topCostEmployees = Array.from(data.employeeData.values())
    .map(e => ({
      name: e.name,
      hours: Math.round(e.hours * 10) / 10,
      cost: Math.round(e.cost * 100) / 100,
      overtime_hours: Math.round(e.overtimeHours * 10) / 10,
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  const analysis: LaborCostAnalysis = {
    analysis_date: new Date(),
    period_start: new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000),
    period_end: new Date(),
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_labor_cost: Math.round(totalLaborCost * 100) / 100,
    labor_cost_pct: Math.round(laborCostPct * 10) / 10,
    total_hours: Math.round(totalHours * 10) / 10,
    regular_hours: Math.round(regularHours * 10) / 10,
    overtime_hours: Math.round(data.overtimeHours * 10) / 10,
    overtime_cost: Math.round(data.overtimeCost * 100) / 100,
    overtime_pct: Math.round(overtimePct * 10) / 10,
    employee_count: data.employeeCount,
    avg_hourly_cost: Math.round(avgHourlyCost * 100) / 100,
    revenue_per_labor_hour: Math.round(revenuePerHour * 100) / 100,
    labor_efficiency: Math.round(laborEfficiency * 100) / 100,
    health_status: healthStatus,
    daily_breakdown: dailyBreakdown,
    top_cost_employees: topCostEmployees,
    ai_recommendations: [],
    generated_at: new Date(),
  };
  if (onProgress) onProgress(2, 3);

  // AI enhancement
  if (config.aiEnabled) {
    await enhanceWithAI(analysis, config);
  } else {
    analysis.ai_recommendations = generateRuleBasedRecommendations(analysis, config);
    analysis.ai_insight = generateRuleBasedInsight(analysis, config);
  }
  if (onProgress) onProgress(3, 3);

  // Persist
  try {
    await db.query(`UPDATE labor_cost_analysis SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    await db.query(`CREATE labor_cost_analysis CONTENT $data`, {
      data: {
        ...analysis,
        analysis_date: analysis.analysis_date.toISOString(),
        period_start: analysis.period_start.toISOString(),
        period_end: analysis.period_end.toISOString(),
        generated_at: analysis.generated_at.toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  } catch (err) {
    console.warn('[labor-opt] persist failed', err);
  }

  return analysis;
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getLatestLaborAnalysis = async (
  db: ReturnType<typeof useDB>
): Promise<LaborCostAnalysis | null> => {
  try {
    const result = await db.query(
      `SELECT * FROM labor_cost_analysis
       WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    return list[0] ?? null;
  } catch (err) {
    console.error('[labor-opt] getLatestLaborAnalysis failed', err);
    return null;
  }
};
