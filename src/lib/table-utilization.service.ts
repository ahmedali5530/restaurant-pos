/**
 * AI Table Utilization Optimization service — analyze occupancy patterns.
 *
 * 40th POSR-exclusive differentiator — restaurants waste 15-25% of seating
 * capacity due to poor table utilization. Toast, Square show table status but
 * DON'T optimize utilization patterns. POSR analyzes occupancy patterns +
 * AI recommends table reallocation, capacity changes, and seating policies.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type TableUtilSeverity = 'info' | 'warning' | 'critical';
export type TableUtilRecommendation =
  | 'reallocate_tables' | 'change_capacity' | 'combine_tables'
  | 'remove_table' | 'add_tables' | 'monitor';

export interface TableUtilizationAlert {
  id?: string;
  rule_id: string;
  severity: TableUtilSeverity;
  table_name?: string;
  floor?: string;
  capacity?: number;
  utilization_pct: number;
  avg_idle_minutes: number;
  avg_party_size?: number;
  mismatch_score: number;
  est_revenue_loss: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: TableUtilRecommendation;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  detected_at: Date;
}

export interface TableUtilConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  lowThreshold: number;
  highIdleMin: number;
}

export const DEFAULT_TABLE_UTIL_CONFIG: TableUtilConfig = {
  aiEnabled: true, lookbackDays: 30, lowThreshold: 0.30, highIdleMin: 30,
};

export const readTableUtilConfig = (settings: any): TableUtilConfig => ({
  aiEnabled: settings?.table_util_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.table_util_lookback_days, 30),
  lowThreshold: safeNumber(settings?.table_util_low_threshold, 0.30),
  highIdleMin: safeNumber(settings?.table_util_high_idle_min, 30),
});

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface TableData {
  tableId: string; tableName: string; floor?: string; capacity: number;
  totalOccupiedMin: number; totalOpenMin: number; partyCount: number;
  totalPartySize: number; totalRevenue: number; idleGaps: number[];
}

const fetchTableData = async (db: any, cfg: TableUtilConfig): Promise<TableData[]> => {
  try {
    const result = await db.query(
      `SELECT
         \`table\`.id AS tid,
         \`table\`.name AS tname,
         \`table\`.floor.name AS fname,
         \`table\`.capacity AS cap,
         math::sum(time::minute(completed_at - created_at)) AS occupied_min,
         count() AS party_count,
         math::sum(covers) AS total_party,
         math::sum(total) AS revenue
       FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE
         AND \`table\` IS NOT NONE
         AND created_at > time::now() - ${cfg.lookbackDays}d
       GROUP BY \`table\`
       FETCH \`table\`, \`table\`.floor`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows.map((r: any) => ({
      tableId: r.tid?.toString?.() ?? '',
      tableName: r.tname ?? 'Unknown',
      floor: r.fname,
      capacity: safeNumber(r.cap, 2),
      totalOccupiedMin: safeNumber(r.occupied_min, 0),
      totalOpenMin: cfg.lookbackDays * 8 * 60, // assume 8h open per day
      partyCount: safeNumber(r.party_count, 0),
      totalPartySize: safeNumber(r.total_party, 0),
      totalRevenue: safeNumber(r.revenue, 0),
      idleGaps: [],
    }));
  } catch (err) { console.warn('[table-util] fetchTableData failed', err); return []; }
};

const enhanceWithAI = async (alerts: TableUtilizationAlert[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || alerts.length === 0) return;
  const prompt = `You are a restaurant floor plan optimization expert. Analyze these table utilization alerts.

Alerts (JSON):
${JSON.stringify(alerts.slice(0, 10).map(a => ({
  rule: a.rule_id, severity: a.severity, table: a.table_name, capacity: a.capacity,
  utilization: a.utilization_pct, idle: a.avg_idle_minutes, mismatch: a.mismatch_score,
  loss: a.est_revenue_loss, description: a.description,
})), null, 2)}

Respond with JSON array:
[{"rule":"<match rule_id>","insight":"<max 200 chars>","recommendation":"reallocate_tables"|"change_capacity"|"combine_tables"|"remove_table"|"add_tables"|"monitor"}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a table utilization optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });
    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ rule: string; insight?: string; recommendation?: TableUtilRecommendation }>;
    for (const item of parsed) {
      const alert = alerts.find(a => a.rule_id === item.rule);
      if (alert) {
        if (item.insight) alert.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) alert.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[table-util] AI failed', err); }
};

export const runTableUtilScan = async (
  db: ReturnType<typeof useDB>,
  config: TableUtilConfig = DEFAULT_TABLE_UTIL_CONFIG
): Promise<{ alerts: TableUtilizationAlert[]; scanned: number }> => {
  const tables = await fetchTableData(db, config);
  if (tables.length === 0) return { alerts: [], scanned: 0 };

  const alerts: TableUtilizationAlert[] = [];

  for (const t of tables) {
    const utilizationPct = t.totalOpenMin > 0 ? t.totalOccupiedMin / t.totalOpenMin : 0;
    const avgIdleMin = t.partyCount > 1 ? (t.totalOpenMin - t.totalOccupiedMin) / t.partyCount : 0;
    const avgPartySize = t.partyCount > 0 ? t.totalPartySize / t.partyCount : 0;
    const avgRevenuePerParty = t.partyCount > 0 ? t.totalRevenue / t.partyCount : 0;

    // 1. UNDERUTILIZED — utilization < 30%
    if (utilizationPct < config.lowThreshold && t.partyCount > 0) {
      const estLoss = (config.lowThreshold - utilizationPct) * t.totalOpenMin / 60 * avgRevenuePerParty * 0.5;
      alerts.push({
        rule_id: 'underutilized', severity: utilizationPct < 0.15 ? 'critical' : 'warning',
        table_name: t.tableName, floor: t.floor, capacity: t.capacity,
        utilization_pct: Math.round(utilizationPct * 100),
        avg_idle_minutes: Math.round(avgIdleMin),
        avg_party_size: Math.round(avgPartySize * 10) / 10,
        mismatch_score: Math.round((1 - utilizationPct) * 100),
        est_revenue_loss: Math.round(estLoss * 100) / 100,
        description: `Table "${t.tableName}" (capacity ${t.capacity}) is only ${Math.round(utilizationPct * 100)}% utilized — well below 30% threshold. Avg idle: ${Math.round(avgIdleMin)}min between parties. Revenue loss: ${formatCurrency(estLoss)}.`,
        status: 'open', detected_at: new Date(),
      });
    }

    // 2. HIGH_IDLE — avg idle > 30 min between parties
    if (avgIdleMin > config.highIdleMin && t.partyCount > 2) {
      const estLoss = (avgIdleMin - config.highIdleMin) * t.partyCount * avgRevenuePerParty / 60 * 0.3;
      alerts.push({
        rule_id: 'high_idle', severity: avgIdleMin > 60 ? 'critical' : 'warning',
        table_name: t.tableName, floor: t.floor, capacity: t.capacity,
        utilization_pct: Math.round(utilizationPct * 100),
        avg_idle_minutes: Math.round(avgIdleMin),
        avg_party_size: Math.round(avgPartySize * 10) / 10,
        mismatch_score: Math.round(avgIdleMin / 2),
        est_revenue_loss: Math.round(estLoss * 100) / 100,
        description: `Table "${t.tableName}" has ${Math.round(avgIdleMin)}min avg idle gap between parties (threshold ${config.highIdleMin}min). Excessive idle time suggests seating flow or cleaning bottleneck.`,
        status: 'open', detected_at: new Date(),
      });
    }

    // 3. CAPACITY_MISMATCH — avg party size << table capacity
    if (t.capacity > 0 && avgPartySize > 0 && avgPartySize < t.capacity * 0.4) {
      const mismatchScore = Math.round((1 - avgPartySize / t.capacity) * 100);
      const estLoss = mismatchScore * 0.5 * t.partyCount;
      alerts.push({
        rule_id: 'capacity_mismatch', severity: mismatchScore > 70 ? 'critical' : 'warning',
        table_name: t.tableName, floor: t.floor, capacity: t.capacity,
        utilization_pct: Math.round(utilizationPct * 100),
        avg_idle_minutes: Math.round(avgIdleMin),
        avg_party_size: Math.round(avgPartySize * 10) / 10,
        mismatch_score: mismatchScore,
        est_revenue_loss: Math.round(estLoss * 100) / 100,
        description: `Table "${t.tableName}" (capacity ${t.capacity}) hosts avg party of ${avgPartySize.toFixed(1)} — ${(avgPartySize / t.capacity * 100).toFixed(0)}% capacity match. Large table wasted on small parties.`,
        status: 'open', detected_at: new Date(),
      });
    }
  }

  // Sort: critical first, then by revenue loss
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.est_revenue_loss - a.est_revenue_loss;
  });

  if (config.aiEnabled && alerts.length > 0) await enhanceWithAI(alerts);

  for (const alert of alerts) {
    try { await db.query(`CREATE table_utilization_alert CONTENT $data`, { data: { ...alert, detected_at: alert.detected_at.toISOString() } }); } catch { }
  }

  return { alerts, scanned: tables.length };
};

export const getOpenAlerts = async (db: ReturnType<typeof useDB>): Promise<TableUtilizationAlert[]> => {
  try {
    const result = await db.query(`SELECT * FROM table_utilization_alert WHERE status = 'open' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, est_revenue_loss DESC`);
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{ total: number; critical: number; warning: number; totalLoss: number }> => {
  try {
    const result = await db.query(`SELECT count() AS total, math::count(severity = 'critical') AS critical, math::count(severity = 'warning') AS warning, math::sum(est_revenue_loss) AS loss FROM table_utilization_alert WHERE status = 'open' GROUP ALL`);
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return { total: safeNumber(row.total, 0), critical: safeNumber(row.critical, 0), warning: safeNumber(row.warning, 0), totalLoss: safeNumber(row.loss, 0) };
  } catch { return { total: 0, critical: 0, warning: 0, totalLoss: 0 }; }
};

export const updateStatus = async (db: ReturnType<typeof useDB>, alertId: string, status: string): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
