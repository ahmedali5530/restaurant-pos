/**
 * AI Table Turnover Optimization service — occupancy + revenue per table.
 *
 * Research finding: Toast Table Management $50+/mo (higher tier), Lightspeed
 * equivalent in Pro. POSR offers it free — analyzes table occupancy patterns,
 * turnover rates, revenue per table-hour + AI generates recommendations.
 *
 * Metrics per table:
 *   - avg_occupancy_minutes: avg time from first order to payment (seated duration)
 *   - median_occupancy_minutes: robust central tendency (outlier-resistant)
 *   - turnover_rate: parties served per open-day
 *   - revenue_per_hour: revenue / open-hours (table productivity)
 *   - avg_party_size: avg covers per party
 *   - capacity_utilization: avg_party_size / table_capacity
 *   - avg_idle_minutes: gap between consecutive parties
 *   - mismatch_score: % parties where size < capacity × 0.5 (wasted seats)
 *
 * Overall score (0-100, weighted):
 *   revenue_per_hour (40%, normalized to max) + turnover_rate (25%) +
 *   capacity_utilization (20%, 1.0 capped) + idle_efficiency (15%)
 *
 * AI recommendations:
 *   - 'combine' — low party size + low utilization → combine small tables
 *   - 'reseat_faster' — high idle time → optimize cleaning + seating flow
 *   - 'adjust_capacity' — frequent mismatch → change table capacity/size
 *   - 'remove' — consistently low revenue/hour → remove or repurpose
 *   - 'promote_location' — high performer → replicate (add similar table)
 *   - 'monitor' — borderline, watch
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TurnoverRecommendation = 'combine' | 'reseat_faster' | 'adjust_capacity' | 'remove' | 'promote_location' | 'monitor';
export type TurnoverGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface TableTurnoverAnalysis {
  id?: string;
  table_id: string;
  table_name: string;
  table_number?: string;
  capacity?: number;
  floor_name?: string;
  period_start: Date;
  period_end: Date;
  total_parties: number;
  total_revenue: number;
  avg_occupancy_minutes: number;
  median_occupancy_minutes: number;
  turnover_rate: number;          // parties per open-day
  revenue_per_hour: number;
  avg_party_size: number;
  capacity_utilization: number;   // 0-1+
  avg_idle_minutes: number;
  peak_hour?: number;
  peak_hour_parties: number;
  mismatch_count: number;
  mismatch_score: number;         // 0-1
  overall_score: number;          // 0-100
  grade: TurnoverGrade;
  generated_at: Date;
  expires_at?: Date;
}

export interface TurnoverInsight {
  id?: string;
  table_id: string;
  table_name: string;
  recommendation: TurnoverRecommendation;
  insight_text: string;
  action?: string;
  projected_revenue_impact?: number;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'acknowledged' | 'acted_on' | 'dismissed';
  generated_at: Date;
  expires_at?: Date;
}

export interface TurnoverConfig {
  lookbackDays: number;
  aiEnabled: boolean;
  openHours: number;
  minParties: number;
}

export const DEFAULT_TURNOVER_CONFIG: TurnoverConfig = {
  lookbackDays: 30,
  aiEnabled: true,
  openHours: 15,
  minParties: 5,
};

export const readTurnoverConfig = (settings: any): TurnoverConfig => ({
  lookbackDays: safeNumber(settings?.turnover_lookback_days, 30),
  aiEnabled: settings?.turnover_ai_enabled ?? true,
  openHours: safeNumber(settings?.turnover_open_hours, 15),
  minParties: safeNumber(settings?.turnover_min_parties, 5),
});

// ---------------------------------------------------------------------------
// Data collection — per-table order sessions
// ---------------------------------------------------------------------------

interface TableSession {
  table_id: string;
  table_name: string;
  table_number?: string;
  capacity?: number;
  floor_name?: string;
  order_id: string;
  created_at: Date;
  completed_at?: Date;
  covers: number;
  revenue: number;
}

const collectTableSessions = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<Map<string, TableSession[]>> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const byTable = new Map<string, TableSession[]>();

  try {
    // Fetch paid orders grouped by table (each order = one party/session)
    const result = await db.query<any[]>(
      `SELECT
         id,
         table.id AS table_id,
         table.name AS table_name,
         table.number AS table_number,
         table.capacity AS capacity,
         table.floor.name AS floor_name,
         created_at,
         completed_at,
         covers,
         math::sum(
           (SELECT quantity * price FROM $parent.items)
         ) AS revenue
       FROM order
       WHERE created_at > $cutoff
         AND status = 'Paid'
         AND deleted_at IS NONE
         AND table != NONE
       FETCH table, table.floor, items`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const order of rows) {
      const tableId = order.table_id?.toString?.() ?? '';
      if (!tableId) continue;
      if (!byTable.has(tableId)) byTable.set(tableId, []);
      byTable.get(tableId)!.push({
        table_id: tableId,
        table_name: order.table_name ?? `Table ${order.table_number ?? '?'}`,
        table_number: order.table_number,
        capacity: order.capacity ? safeNumber(order.capacity, 0) : undefined,
        floor_name: order.floor_name,
        order_id: order.id?.toString?.() ?? '',
        created_at: order.created_at ? new Date(order.created_at) : new Date(),
        completed_at: order.completed_at ? new Date(order.completed_at) : undefined,
        covers: safeNumber(order.covers, 0),
        revenue: safeNumber(order.revenue?.[0]?.revenue ?? order.revenue, 0),
      });
    }
  } catch (err) {
    console.error('[turnover] collectTableSessions failed', err);
  }

  return byTable;
};

// ---------------------------------------------------------------------------
// Per-table analysis computation
// ---------------------------------------------------------------------------

const median = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const computeGrade = (score: number): TurnoverGrade => {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
};

const computeTableAnalysis = (
  tableId: string,
  sessions: TableSession[],
  openDays: number,
  openHoursPerDay: number,
  maxRevenuePerHour: number
): TableTurnoverAnalysis => {
  const totalParties = sessions.length;
  const totalRevenue = sessions.reduce((s, sess) => s + sess.revenue, 0);
  const first = sessions[0];

  // Occupancy durations (minutes)
  const occupancyMinutes: number[] = [];
  for (const sess of sessions) {
    if (sess.completed_at) {
      const mins = (sess.completed_at.getTime() - sess.created_at.getTime()) / 60_000;
      if (mins > 0 && mins < 24 * 60) { // sanity: under 24h
        occupancyMinutes.push(mins);
      }
    }
  }
  const avgOccupancy = occupancyMinutes.length > 0
    ? occupancyMinutes.reduce((s, m) => s + m, 0) / occupancyMinutes.length
    : 0;
  const medianOccupancy = median(occupancyMinutes);

  // Turnover rate: parties per open-day
  const turnoverRate = openDays > 0 ? totalParties / openDays : 0;

  // Revenue per open-hour
  const totalOpenHours = openDays * openHoursPerDay;
  const revenuePerHour = totalOpenHours > 0 ? totalRevenue / totalOpenHours : 0;

  // Party size + capacity utilization
  const avgPartySize = totalParties > 0
    ? sessions.reduce((s, sess) => s + sess.covers, 0) / totalParties
    : 0;
  const capacity = first?.capacity ?? 0;
  const capacityUtilization = capacity > 0 ? avgPartySize / capacity : 0;

  // Idle minutes — gaps between consecutive sessions (sorted by time)
  const sortedSessions = [...sessions].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  const idleMinutes: number[] = [];
  for (let i = 1; i < sortedSessions.length; i++) {
    const prevEnd = sortedSessions[i - 1].completed_at ?? sortedSessions[i - 1].created_at;
    const currStart = sortedSessions[i].created_at;
    const gap = (currStart.getTime() - prevEnd.getTime()) / 60_000;
    if (gap > 0 && gap < 12 * 60) { // ignore gaps > 12h (overnight)
      idleMinutes.push(gap);
    }
  }
  const avgIdle = idleMinutes.length > 0
    ? idleMinutes.reduce((s, m) => s + m, 0) / idleMinutes.length
    : 0;

  // Peak hour
  const byHour = new Map<number, number>();
  for (const sess of sortedSessions) {
    const hour = sess.created_at.getHours();
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }
  let peakHour: number | undefined;
  let peakHourParties = 0;
  for (const [hour, count] of byHour) {
    if (count > peakHourParties) {
      peakHour = hour;
      peakHourParties = count;
    }
  }

  // Mismatch: party size < capacity × 0.5
  let mismatchCount = 0;
  if (capacity > 0) {
    for (const sess of sessions) {
      if (sess.covers < capacity * 0.5) mismatchCount++;
    }
  }
  const mismatchScore = totalParties > 0 ? mismatchCount / totalParties : 0;

  // Overall score (0-100, weighted):
  // revenue_per_hour (40%) + turnover_rate (25%) + capacity_utilization (20%) + idle_efficiency (15%)
  const revenueScore = maxRevenuePerHour > 0
    ? Math.min(1, revenuePerHour / maxRevenuePerHour) * 40
    : 0;
  const turnoverScore = Math.min(1, turnoverRate / 3) * 25; // 3+ turns/day = max
  const utilizationScore = Math.min(1, capacityUtilization) * 20;
  const idleScore = avgIdle > 0 ? Math.max(0, 1 - avgIdle / 60) * 15 : 7.5; // 60+ min idle = 0
  const overallScore = Math.round(revenueScore + turnoverScore + utilizationScore + idleScore);

  const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const periodEnd = new Date();

  return {
    table_id: tableId,
    table_name: first?.table_name ?? 'Unknown',
    table_number: first?.table_number,
    capacity: first?.capacity,
    floor_name: first?.floor_name,
    period_start: periodStart,
    period_end: periodEnd,
    total_parties: totalParties,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    avg_occupancy_minutes: Math.round(avgOccupancy),
    median_occupancy_minutes: Math.round(medianOccupancy),
    turnover_rate: Math.round(turnoverRate * 100) / 100,
    revenue_per_hour: Math.round(revenuePerHour * 100) / 100,
    avg_party_size: Math.round(avgPartySize * 10) / 10,
    capacity_utilization: Math.round(capacityUtilization * 100) / 100,
    avg_idle_minutes: Math.round(avgIdle),
    peak_hour: peakHour,
    peak_hour_parties: peakHourParties,
    mismatch_count: mismatchCount,
    mismatch_score: Math.round(mismatchScore * 100) / 100,
    overall_score: overallScore,
    grade: computeGrade(overallScore),
    generated_at: new Date(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
};

// ---------------------------------------------------------------------------
// AI enhancement — per-table insights + recommendations
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  analyses: TableTurnoverAnalysis[]
): Promise<TurnoverInsight[]> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[turnover] OpenAI not available — using rule-based');
    return ruleBasedInsights(analyses);
  }

  const topForAI = analyses.slice(0, 30); // limit prompt size
  const prompt = `You are a restaurant floor optimization expert.
Analyze these table turnover metrics and provide recommendations.

Tables (JSON):
${JSON.stringify(topForAI.map(a => ({
  table: a.table_name,
  capacity: a.capacity,
  parties: a.total_parties,
  revenue: a.total_revenue,
  revenue_per_hour: a.revenue_per_hour,
  turnover_rate: a.turnover_rate,
  avg_party_size: a.avg_party_size,
  capacity_utilization: a.capacity_utilization,
  avg_occupancy_min: a.avg_occupancy_minutes,
  avg_idle_min: a.avg_idle_minutes,
  mismatch_score: a.mismatch_score,
  peak_hour: a.peak_hour,
  grade: a.grade,
  score: a.overall_score,
  floor: a.floor_name,
})), null, 2)}

For each table needing attention, respond with JSON:
[{
  "table_name": "...",
  "recommendation": "combine" | "reseat_faster" | "adjust_capacity" | "remove" | "promote_location" | "monitor",
  "insight_text": "<max 300 chars — what's happening>",
  "action": "<max 200 chars — concrete next step>",
  "projected_monthly_revenue_impact": <number or 0>,
  "confidence": <0-1>,
  "priority": "low" | "medium" | "high"
}]

Focus on actionable insights that increase revenue per table-hour.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant floor optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 2000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return ruleBasedInsights(analyses);
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      table_name: string;
      recommendation: TurnoverRecommendation;
      insight_text: string;
      action?: string;
      projected_monthly_revenue_impact?: number;
      confidence?: number;
      priority?: 'low' | 'medium' | 'high';
    }>;

    const insights: TurnoverInsight[] = [];
    for (const item of parsed) {
      const analysis = analyses.find(a => a.table_name === item.table_name);
      if (!analysis) continue;
      insights.push({
        table_id: analysis.table_id,
        table_name: analysis.table_name,
        recommendation: item.recommendation,
        insight_text: item.insight_text.slice(0, 300),
        action: item.action?.slice(0, 200),
        projected_revenue_impact: item.projected_monthly_revenue_impact
          ? Math.round(item.projected_monthly_revenue_impact * 100) / 100
          : undefined,
        confidence: Math.max(0, Math.min(1, item.confidence ?? 0.7)),
        priority: item.priority ?? 'medium',
        status: 'open',
        generated_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }
    return insights;
  } catch (err) {
    console.warn('[turnover] AI failed — using rule-based', err);
    return ruleBasedInsights(analyses);
  }
};

const ruleBasedInsights = (analyses: TableTurnoverAnalysis[]): TurnoverInsight[] => {
  return analyses.map(a => {
    let recommendation: TurnoverRecommendation = 'monitor';
    let insight_text = '';
    let action = '';
    let revenue_impact = 0;
    let priority: 'low' | 'medium' | 'high' = 'low';

    if (a.grade === 'A') {
      recommendation = 'promote_location';
      insight_text = `Top performer — score ${a.overall_score}/100. ${a.revenue_per_hour.toFixed(2)}/h, ${a.turnover_rate.toFixed(1)} turns/day, utilization ${(a.capacity_utilization * 100).toFixed(0)}%.`;
      action = 'Replicate this setup — add a similar table nearby or study why it outperforms.';
      priority = 'low';
    } else if (a.grade === 'F' || (a.grade === 'D' && a.total_parties < 10)) {
      recommendation = 'remove';
      insight_text = `Underperforming — score ${a.overall_score}/100. Only ${a.revenue_per_hour.toFixed(2)}/h over ${a.total_parties} parties.`;
      action = 'Remove or repurpose this table — consider a standing bar, retail display, or waiting area.';
      priority = 'high';
    } else if (a.avg_idle_minutes > 45) {
      recommendation = 'reseat_faster';
      insight_text = `High idle time — avg ${a.avg_idle_minutes} min gap between parties. ${a.total_parties} parties served.`;
      action = 'Optimize cleaning + seating flow — target under 15 min turnover. Assign dedicated busser during peak.';
      revenue_impact = a.total_parties > 0 ? (a.avg_idle_minutes - 15) * a.turnover_rate * 30 * (a.total_revenue / a.total_parties / 60) : 0;
      priority = 'high';
    } else if (a.mismatch_score > 0.6 && (a.capacity ?? 0) >= 4) {
      recommendation = 'combine';
      insight_text = `Capacity mismatch — ${(a.mismatch_score * 100).toFixed(0)}% of parties under half capacity (${a.capacity} seats, avg party ${a.avg_party_size}).`;
      action = 'Replace with 2 smaller tables or mark as combinable for large parties only.';
      priority = 'medium';
    } else if (a.mismatch_score > 0.4 && (a.capacity ?? 0) >= 4) {
      recommendation = 'adjust_capacity';
      insight_text = `Frequent under-utilization — ${a.mismatch_score > 0 ? (a.mismatch_score * 100).toFixed(0) : 0}% of parties < half capacity. Avg party: ${a.avg_party_size}.`;
      action = 'Adjust table configuration — split into smaller tables or remove chairs.';
      priority = 'medium';
    } else {
      recommendation = 'monitor';
      insight_text = `Grade ${a.grade} — score ${a.overall_score}/100. Turnover ${a.turnover_rate.toFixed(1)}/day, occupancy ${a.avg_occupancy_minutes} min avg.`;
      action = 'Monitor for 30 days. Compare with floor average.';
      priority = 'low';
    }

    return {
      table_id: a.table_id,
      table_name: a.table_name,
      recommendation,
      insight_text,
      action,
      projected_revenue_impact: revenue_impact > 0 ? Math.round(revenue_impact * 100) / 100 : undefined,
      confidence: 0.6,
      priority,
      status: 'open',
      generated_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  });
};

// ---------------------------------------------------------------------------
// Main entry — analyze all tables
// ---------------------------------------------------------------------------

export interface AnalyzeTurnoverResult {
  analyses: TableTurnoverAnalysis[];
  insights: TurnoverInsight[];
  totalRevenue: number;
  avgTurnoverRate: number;
  potentialRevenueImpact: number;
}

export const analyzeTableTurnover = async (
  db: ReturnType<typeof useDB>,
  config: TurnoverConfig = DEFAULT_TURNOVER_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<AnalyzeTurnoverResult> => {
  if (onProgress) onProgress(0, 4);

  // 1. Collect sessions per table
  const sessionsByTable = await collectTableSessions(db, config.lookbackDays);
  if (onProgress) onProgress(1, 4);

  // Filter by min parties
  const openDays = Math.max(1, config.lookbackDays * (config.openHours > 0 ? 1 : 1));
  const filtered = new Map<string, TableSession[]>();
  for (const [tableId, sessions] of sessionsByTable) {
    if (sessions.length >= config.minParties) {
      filtered.set(tableId, sessions);
    }
  }

  if (filtered.size === 0) {
    return { analyses: [], insights: [], totalRevenue: 0, avgTurnoverRate: 0, potentialRevenueImpact: 0 };
  }

  // 2. First pass — compute analyses with placeholder max revenue
  const analyses: TableTurnoverAnalysis[] = [];
  for (const [tableId, sessions] of filtered) {
    analyses.push(computeTableAnalysis(tableId, sessions, openDays, config.openHours, 100));
  }

  // Find actual max revenue_per_hour for normalization
  const maxRevenuePerHour = Math.max(...analyses.map(a => a.revenue_per_hour), 1);

  // 3. Second pass — recompute with real max for normalized scores
  analyses.length = 0;
  for (const [tableId, sessions] of filtered) {
    analyses.push(computeTableAnalysis(tableId, sessions, openDays, config.openHours, maxRevenuePerHour));
  }
  analyses.sort((a, b) => b.overall_score - a.overall_score);
  if (onProgress) onProgress(2, 4);

  // 4. AI enhancement (or rule-based)
  let insights: TurnoverInsight[];
  if (config.aiEnabled) {
    insights = await enhanceWithAI(analyses);
  } else {
    insights = ruleBasedInsights(analyses);
  }
  if (onProgress) onProgress(3, 4);

  // 5. Persist
  try {
    await db.query(`UPDATE table_turnover_analysis SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    await db.query(`UPDATE turnover_insight SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);

    for (const analysis of analyses) {
      try {
        const result = await db.query<any>(
          `CREATE table_turnover_analysis CONTENT $data`,
          {
            data: {
              ...analysis,
              table: analysis.table_id,
              period_start: analysis.period_start.toISOString(),
              period_end: analysis.period_end.toISOString(),
              generated_at: analysis.generated_at.toISOString(),
              expires_at: analysis.expires_at?.toISOString(),
            },
          }
        );
        analysis.id = (result as any)?.id?.toString?.() ?? '';
      } catch (err) {
        console.warn('[turnover] persist analysis failed', err);
      }
    }

    for (const insight of insights) {
      try {
        await db.query(
          `CREATE turnover_insight CONTENT $data`,
          {
            data: {
              ...insight,
              generated_at: insight.generated_at.toISOString(),
              expires_at: insight.expires_at?.toISOString(),
            },
          }
        );
      } catch (err) {
        console.warn('[turnover] persist insight failed', err);
      }
    }
  } catch (err) {
    console.warn('[turnover] persist batch failed', err);
  }
  if (onProgress) onProgress(4, 4);

  const totalRevenue = analyses.reduce((s, a) => s + a.total_revenue, 0);
  const avgTurnoverRate = analyses.length > 0
    ? analyses.reduce((s, a) => s + a.turnover_rate, 0) / analyses.length
    : 0;
  const potentialRevenueImpact = insights.reduce((s, i) => s + (i.projected_revenue_impact ?? 0), 0);

  return { analyses, insights, totalRevenue, avgTurnoverRate, potentialRevenueImpact };
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getTableTurnoverAnalyses = async (
  db: ReturnType<typeof useDB>
): Promise<TableTurnoverAnalysis[]> => {
  try {
    const result = await db.query<TableTurnoverAnalysis[]>(
      `SELECT * FROM table_turnover_analysis
       WHERE expires_at > time::now()
       ORDER BY overall_score DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[turnover] getTableTurnoverAnalyses failed', err);
    return [];
  }
};

export const getOpenTurnoverInsights = async (
  db: ReturnType<typeof useDB>
): Promise<TurnoverInsight[]> => {
  try {
    const result = await db.query<TurnoverInsight[]>(
      `SELECT * FROM turnover_insight
       WHERE status = 'open' AND (expires_at = NONE OR expires_at > time::now())
       ORDER BY
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         projected_revenue_impact DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[turnover] getOpenTurnoverInsights failed', err);
    return [];
  }
};

export const updateTurnoverInsightStatus = async (
  db: ReturnType<typeof useDB>,
  insightId: string,
  status: 'acknowledged' | 'acted_on' | 'dismissed'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: insightId, status });
};
